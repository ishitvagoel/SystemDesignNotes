# eBPF and Kernel Observability

## Why This Exists

Traditional observability requires cooperation from the application: you add a metrics library, a tracing SDK, a log exporter. This works until it doesn't — a legacy service you can't recompile, a third-party binary, a kernel network driver causing mysterious latency. The instrumentation gap leaves you blind exactly where you need to see.

eBPF (extended Berkeley Packet Filter) solves this by running sandboxed programs directly in the Linux kernel without modifying application code, recompiling binaries, or adding sidecar processes. You can observe every TCP connection, HTTP request, DNS query, system call, and CPU stack trace across the entire system — kernel and userspace — from a single vantage point with near-zero overhead. This is the shift from "applications report what they choose to" to "the kernel reports what actually happened."

The operational impact is substantial. Meta reported ~20% CPU reduction after replacing sidecar-based telemetry collection with eBPF agents. Cloudflare handles 10 Tbps+ of DDoS mitigation using eBPF programs at line rate on commodity hardware. The technology has moved from kernel experimentation to production infrastructure staple in five years.

## Mental Model

Think of eBPF as **a safe plugin system for the Linux kernel**. The analogy holds in three ways:

1. **Safety**: Every eBPF program passes through a verifier before loading. The verifier proves the program terminates (no infinite loops), never accesses out-of-bounds memory, and doesn't call unsafe kernel functions. If verification fails, the program is rejected — the kernel cannot crash.
2. **Sandboxed**: eBPF programs run in a restricted execution environment with limited instruction set. They cannot modify arbitrary kernel memory. They communicate with userspace through well-defined channels (BPF maps).
3. **Pluggable**: Programs attach to hooks — network packet paths, syscall entry/exit, function entry/exit, scheduler events. When the hook fires, the program runs. When the program detaches, the hook returns to its original behavior. No kernel recompile, no reboot.

The crucial insight: **the kernel already knows everything**. Every network packet, every file open, every CPU context switch passes through the kernel. eBPF gives you a safe window into that omniscient view.

## How It Works

### Program Types and Attachment Points

eBPF programs are attached to specific kernel hooks based on what you want to observe or control:

| Program Type | Attachment Point | Use Cases |
|-------------|-----------------|-----------|
| **kprobe/kretprobe** | Entry/exit of any kernel function | Observe `tcp_connect`, `sock_sendmsg`, `do_sys_openat2` |
| **uprobe/uretprobe** | Entry/exit of userspace function | Trace Go/Python/Java functions without recompile |
| **tracepoint** | Stable kernel tracing hooks | Scheduler events, syscalls, block I/O — stable across kernel versions |
| **XDP (eXpress Data Path)** | Network driver receive hook (pre-stack) | Packet filtering/dropping at line rate; DDoS mitigation |
| **TC (Traffic Control)** | Network stack ingress/egress | Packet rewriting, load balancing, policy enforcement |
| **Socket filter** | Per-socket packet inspection | Network monitoring, protocol parsing |
| **perf_event** | CPU performance counters | CPU profiling, cache misses, branch mispredictions |
| **LSM (Linux Security Module)** | Security policy enforcement points | Runtime security policies (Falco, Tetragon) |

### The Verifier: Safety Without Trust

When you load an eBPF program, the kernel verifier performs static analysis:

1. **Control flow graph analysis**: No loops that don't terminate; all code paths explored.
2. **Register tracking**: Every register has a known type at every instruction; no type confusion.
3. **Pointer arithmetic**: All memory accesses proven safe before execution.
4. **Instruction limit**: Programs have a maximum complexity bound (1 million instructions as of kernel 5.2).

Programs that pass verification are JIT-compiled to native machine code. First-run latency: ~1ms for compilation. Subsequent invocations: native speed, typically < 1µs per event.

### BPF Maps: Kernel-to-Userspace Communication

eBPF programs cannot directly write to userspace. They communicate through **BPF maps** — typed, kernel-managed data structures accessible from both kernel programs and userspace:

| Map Type | Structure | Use Case |
|----------|-----------|----------|
| **Hash map** | Key-value store | Per-connection state, per-PID metrics |
| **Array** | Fixed-size indexed array | Global counters, configuration |
| **Ring buffer** | Lock-free circular buffer | High-throughput event streaming to userspace |
| **LRU hash** | Hash with automatic eviction | Per-flow state at scale (no manual cleanup) |
| **Perf event array** | Per-CPU event buffers | High-frequency CPU profiling |
| **Sock map** | Socket redirection | Accelerate service mesh (bypasses TCP stack) |

Ring buffers are the modern choice for event streaming: they achieve > 1 GB/s throughput with < 1% CPU overhead, replacing perf_event_array in most new programs.

### CO-RE: Portable eBPF Programs

A persistent challenge: eBPF programs access kernel data structures (e.g., `struct task_struct`) whose layout varies by kernel version. **CO-RE (Compile Once – Run Everywhere)** solves this:

1. The kernel exposes its type information via **BTF (BPF Type Format)** — a compact description of all kernel structs, sizes, and field offsets.
2. The eBPF program is compiled with BTF-annotated relocations (not hardcoded field offsets).
3. At load time, the loader reads the running kernel's BTF and patches the program's memory accesses to match the actual struct layout.

Result: a single `.bpf.o` binary runs correctly across different kernel versions (requires kernel ≥ 5.2 for BTF, ≥ 5.8 for ring buffers, ≥ 6.0 for full CO-RE stability).

## Production Use Cases

### 1. Network Flow Observability (Cilium / Hubble)

**Cilium** uses eBPF to replace kube-proxy and implement Kubernetes networking at the kernel level. **Hubble** (Cilium's observability layer) attaches eBPF programs to network paths to emit per-flow metadata:

- Source/destination pod identity (not just IP — resolved to Kubernetes namespace/pod name)
- L7 protocol (HTTP method, gRPC service, DNS query) decoded without application cooperation
- Latency, drop reason, policy verdict (allowed/denied)

This gives you service dependency graphs and request latency breakdowns without injecting any sidecars — the sidecar-less service mesh.

### 2. Continuous CPU Profiling (Parca / Pyroscope)

Traditional profilers require application instrumentation or sampling via `SIGPROF`. eBPF enables **always-on profiling**:

1. Attach a `perf_event` eBPF program to CPU sampling (e.g., 97 Hz per CPU).
2. On each sample, capture the kernel stack trace + userspace stack trace via `bpf_get_stackid()`.
3. Emit (stack trace → count) pairs to a ring buffer.
4. Userspace aggregates into flame graph data.

Overhead: < 1% CPU, zero application code changes. Every process on the node is profiled simultaneously. Parca Open Source (from Polar Signals) and Grafana Pyroscope use this approach to provide always-on flame graphs in production.

### 3. Runtime Security (Falco / Tetragon)

**Falco** (CNCF) uses eBPF tracepoints/syscall hooks to detect security violations at runtime:
- Process spawning unexpected binaries (`execve` with unexpected arguments)
- Container escape attempts (accessing host mount namespace)
- Sensitive file reads (`/etc/shadow`, `/proc/1/mem`)

**Tetragon** (Cilium project) uses LSM eBPF hooks for enforcement — not just detection — allowing it to kill a process on policy violation without a userspace round-trip.

### 4. DDoS Mitigation at Line Rate (XDP)

XDP programs attach before the kernel network stack. A packet-drop decision at XDP means the NIC's receive ring is polled, the eBPF program runs, and the packet is dropped — **before any sk_buff allocation, before any interrupt processing**. At 100 Gbps, this means:

- Linux network stack: ~1M pps (limited by sk_buff allocation overhead)
- XDP: ~14.88M pps (100 Gbps line rate at 64-byte packets)

Cloudflare uses XDP-based eBPF programs to drop volumetric DDoS traffic before it consumes any CPU cycles on the victim system. Their production eBPF programs drop packets in < 1µs.

### 5. Service Mesh Acceleration (Sockmap)

In a sidecar service mesh (Istio/Envoy), traffic flows: app → loopback → Envoy → loopback → app. This is 2× loopback traversal per request. eBPF sockmap programs short-circuit this: when the app sends to Envoy's local socket, the kernel redirects the data directly to the destination socket without traversing the network stack. Latency reduction: ~20–35% for intra-host traffic.

## Trade-Off Analysis

| Approach | Visibility | Overhead | Application Changes | Kernel Requirement |
|----------|-----------|----------|--------------------|--------------------|
| **eBPF** | Kernel + userspace | < 1–3% CPU | None | ≥ 5.8 (production-grade) |
| **Sidecar proxy (Envoy)** | L7 application | 10–20% CPU | None (injection) | Any |
| **Application SDK (OTel)** | In-app only | 1–5% CPU | Required | Any |
| **Kernel module** | Full kernel | Variable | None | Matching version |
| **ptrace / strace** | Syscall level | 50–1000% CPU | None | Any |

eBPF wins on overhead and visibility breadth. It loses when you need application-level context (business transaction IDs, user auth data) that never enters the kernel — combine eBPF for infrastructure-level signals with application OTel for business-level spans.

## Failure Modes & Production Lessons

**1. Verifier rejection on complex programs**
eBPF programs that loop over dynamic-length data (parsing HTTP headers, walking linked lists) frequently hit the verifier's complexity limit. The verifier explores all possible paths — a loop that runs up to 100 iterations causes 100× path explosion. Mitigation: use bounded loops (`#pragma unroll` or explicit bounds); prefer map lookups over inline parsing; split complex programs into tail calls.

**2. Map memory exhaustion**
Hash maps have a fixed maximum entry count set at creation. A per-connection hash map with `max_entries = 65536` will drop new entries silently when full — you lose visibility, not data. Mitigation: use LRU hash maps for connection-state tracking (automatic eviction); monitor map fill percentage via `bpf_map_get_info_by_fd`; alert when > 80% full.

**3. Kernel version fragmentation in hybrid fleets**
A fleet mixing kernel 4.15 (CentOS 7), 5.4 (Ubuntu 20.04), and 5.15 (Ubuntu 22.04) cannot use a single eBPF program binary. CO-RE partially solves struct layout differences but not missing program types (LSM hooks require ≥ 5.7, ring buffers ≥ 5.8). Mitigation: maintain separate program versions per kernel generation; use libbpf's feature detection API to select the right implementation at runtime.

**4. Privilege escalation via crafted programs**
eBPF requires `CAP_BPF` (kernel ≥ 5.8) or `CAP_SYS_ADMIN`. A misconfigured container with `CAP_SYS_ADMIN` can load eBPF programs that read arbitrary kernel memory. Mitigation: audit container capabilities; use `seccomp` to block `bpf()` syscall in application containers; restrict eBPF loading to dedicated observability agents.

**5. uprobe overhead on hot paths**
uprobes instrument userspace function entry via a software breakpoint (int3 on x86). On a function called 10M times/second, each uprobe fires a trap → kernel → eBPF program → userspace. This can add 5–15% CPU overhead on hot paths. Mitigation: instrument at call sites that fire < 1M/s; use USDT (userspace statically defined tracepoints) for planned instrumentation points in hot code; never uprobe functions in tight inner loops.

## Architecture Diagram

```mermaid
flowchart TD
    subgraph Userspace["Userspace"]
        App["Application\n(any language)"]
        Agent["eBPF Agent\n(Cilium / Parca / Falco)"]
        OTEL["OpenTelemetry\nCollector"]
    end

    subgraph Kernel["Linux Kernel"]
        Verifier["eBPF Verifier\n(safety check on load)"]
        JIT["JIT Compiler\n(native code)"]
        Maps[("BPF Maps\n(ring buffer, hash, LRU)")]

        Hook1["kprobe: tcp_connect\n(network events)"]
        Hook2["tracepoint: sched_switch\n(CPU profiling)"]
        Hook3["XDP: recv\n(packet filter)"]
        Hook4["LSM: exec\n(security policy)"]
    end

    Agent -->|"bpf() syscall\nload program"| Verifier
    Verifier --> JIT
    JIT --> Hook1 & Hook2 & Hook3 & Hook4

    Hook1 & Hook2 & Hook3 & Hook4 -->|"write event"| Maps
    Maps -->|"read via\nring buffer poll"| Agent
    Agent --> OTEL
    OTEL --> Backends["Metrics / Traces /\nSecurity Alerts"]

    App -.->|"syscalls\n(transparent)"| Hook1

    style Kernel fill:var(--surface),stroke:var(--accent),stroke-width:2px
    style Userspace fill:var(--surface),stroke:var(--accent2),stroke-width:2px
```

## Back-of-the-Envelope Heuristics

- **CPU overhead**: 1–3% per observed node with ring-buffer-based collection. Compare to 15–20% for a sidecar proxy and 0% for no observability (blindness has a different cost).
- **Ring buffer throughput**: 1–5 GB/s for event streaming from kernel to userspace — easily handles 500K events/second at 2 KB/event without backpressure.
- **XDP drop rate**: 14.88M pps at 100 Gbps with 64-byte packets on a single core. Scale linearly with CPU cores.
- **Uprobe overhead on hot functions**: +50–150ns per call (trap + eBPF program execution). Acceptable for < 1M calls/s; problematic at 10M+ calls/s.
- **Map lookup**: O(1) hash map lookup in eBPF: ~10–50ns. Comparable to L1 cache access time.
- **Program load time**: 1–10ms for verifier + JIT on a 1,000-instruction program. Negligible for long-running agents.
- **Kernel BTF data size**: ~10–20 MB per kernel image. Present in all major distros since 2020 as `/sys/kernel/btf/vmlinux`.

## Real-World Case Studies

- **Meta (Sidecar Elimination)**: Meta replaced their entire sidecar-based telemetry collection fleet with eBPF agents, reporting 20% CPU reduction across their production fleet. The key win: a single eBPF agent per host replaces N sidecar containers (one per service instance), eliminating both the agent CPU cost and the sidecar injection complexity for hundreds of service teams.

- **Cloudflare (XDP DDoS Mitigation)**: Cloudflare's entire DDoS mitigation pipeline runs on eBPF XDP programs. When a volumetric attack arrives, their eBPF programs detect the attack signature (IP range + packet pattern) and drop matching packets in < 1µs at the NIC driver level — before any Linux networking stack processing. This allows them to absorb 10+ Tbps attacks on commodity hardware without provisioning special-purpose appliances.

- **Datadog (Agent 7 eBPF Mode)**: Datadog's Agent 7 uses eBPF to collect network performance metrics (NPM) — per-connection latency, throughput, retransmissions — without requiring application changes or network taps. Their eBPF programs attach to TCP state machine transitions in the kernel, emitting events when connections open, close, or retransmit. This gives service-to-service network topology maps automatically derived from kernel events.

## Connections

- [[03-Phase-3-Architecture-Operations__Module-17-Observability-Deployment__Observability_and_Alerting]] — eBPF is one of three observability data sources (alongside application instrumentation and infra metrics); zero-instrumentation observability enables the "measure everything" ideal
- [[03-Phase-3-Architecture-Operations__Module-17-Observability-Deployment__Distributed_Tracing_Deep_Dive]] — eBPF network traces can be correlated with application spans via connection-level metadata (source/dest pod, port, latency)
- [[03-Phase-3-Architecture-Operations__Module-15-Security__Zero_Trust_Architecture]] — eBPF LSM hooks enforce policy at the kernel level, providing the enforcement plane for network micro-segmentation and runtime security
- [[04-Phase-4-Modern-AI__Module-21-Serverless-Edge-Platform__Kubernetes_and_Platform_Engineering]] — Cilium eBPF networking replaces kube-proxy; eBPF is increasingly the foundation of the Kubernetes data plane

## Reflection Prompts

1. Your platform team wants to replace Envoy sidecars (which add 15% CPU overhead) with eBPF-based networking for a Kubernetes cluster of 500 services. Compare the operational trade-offs: what observability capabilities does Envoy provide that eBPF alone cannot, and how would you design a hybrid approach that gets eBPF's efficiency while retaining application-level trace context propagation?

2. You're running a security audit of a multi-tenant SaaS platform. A customer's container is found to have `CAP_SYS_ADMIN`. Explain the specific eBPF-based attack vector this enables, what data the attacker could extract, and design the policy changes (container security context, seccomp profile, admission controller) that prevent it.

3. Your team adopts Parca for always-on CPU profiling via eBPF. After deployment, a senior engineer raises a concern: "We have services running on kernel 4.15 (our legacy CentOS 7 nodes). How do we handle this?" Design the multi-kernel strategy: what features degrade gracefully, what requires a fallback implementation, and how do you communicate the observability gap to teams running on legacy kernels?

## Canonical Sources

- Brendan Gregg, *BPF Performance Tools* (2019) — definitive reference for eBPF observability
- Liz Rice, *Learning eBPF* (O'Reilly, 2023) — accessible introduction to eBPF programming
- Cilium documentation (docs.cilium.io) — production eBPF networking and observability
- eBPF.io — curated resource hub with program type reference and kernel compatibility matrix
- Cloudflare blog, "XDP in Practice" — DDoS mitigation architecture deep dive
