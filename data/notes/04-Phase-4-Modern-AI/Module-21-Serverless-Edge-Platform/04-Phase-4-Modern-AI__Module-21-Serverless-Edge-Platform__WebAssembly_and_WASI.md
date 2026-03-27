# WebAssembly and WASI

## Why This Exists

WebAssembly was originally designed to run high-performance code in browsers. A funny thing happened: the same properties that made it useful in browsers (sandboxed, near-native speed, portable, language-agnostic) turned out to be exactly what server-side compute needed.

Traditional serverless functions (AWS Lambda) have three problems at the margins: cold start latency (100ms–1s for JVM runtimes), large container images (hundreds of MB), and isolation overhead (each function needs OS-level isolation). WebAssembly solves all three: WASM modules start in microseconds (not milliseconds), are measured in KB (not MB), and provide memory-safe sandboxing without OS process isolation. The result is a compute substrate that can run thousands of isolated function instances on a single machine with sub-millisecond startup — a fundamentally different point in the latency/density/isolation design space.

WASI (WebAssembly System Interface) extends WASM to access system capabilities (filesystem, networking, clocks) in a portable, capability-based way — enabling WASM modules to run outside the browser in production server environments.

## Mental Model

Think of WebAssembly as **a universal bytecode format for a fictional CPU**. Just like Java bytecode runs on the JVM (any OS, any hardware), WASM bytecode runs on the WebAssembly runtime (any OS, any hardware). But unlike the JVM, WASM's "fictional CPU" is designed to be:
- **Sandboxed by default**: The module cannot access memory outside its allocated linear memory — no escaping the sandbox without explicit capability grants.
- **Extremely compact**: Binary format, no runtime overhead of a garbage collector (for most languages).
- **Ahead-of-time compilable**: Cranelift or LLVM can AOT-compile WASM to native code; execution speed is 90–100% of native.

WASI is the "ports" on this fictional CPU — it defines standard interfaces for what the WASM module can plug into (filesystem, network sockets, environment variables) without hardcoding OS-specific syscalls. A WASM module compiled with WASI support runs identically on Linux, macOS, Windows, or embedded hardware.

## How It Works

### The WASM Binary Format

A `.wasm` file is a compact binary containing:
- **Type section**: Function signatures (parameter and return types)
- **Import section**: External functions the module needs (from the host runtime or other WASM modules)
- **Function section**: The module's own functions
- **Memory section**: Declaration of linear memory (a flat byte array, sized in 64KB pages)
- **Export section**: Functions and memory segments the host can call

**Linear memory model**: A WASM module has one or more linear memories — flat byte arrays. Pointers in WASM are byte offsets into this array. The runtime guarantees all memory accesses stay within bounds — out-of-bounds access is a trap (deterministic error), not a security vulnerability. This is why WASM modules cannot read each other's memory or the host process's memory.

### WASI 0.2: The Component Model

WASI 0.1 defined POSIX-like syscalls. WASI 0.2 (standardized 2024) introduces the **Component Model**: a composable module system where WASM modules export and import typed interfaces (WIT — WebAssembly Interface Types), enabling:
- **Type-safe inter-module calls** without marshaling through bytes
- **Composition**: Assemble a component from multiple smaller WASM modules
- **Portability**: A component targeting WASI 0.2 runs on any compliant runtime (Wasmtime, WasmEdge, WAMR)

This is the platform-independent "shipping container" model for software: compile once, run anywhere.

### Runtime Ecosystem

| Runtime | Primary Use | Performance | Key Feature |
|---------|-------------|-------------|-------------|
| **Wasmtime** (Bytecode Alliance) | Server-side, CLI | AOT + JIT | Production-grade, Rust-based |
| **WasmEdge** | Cloud-native, edge, AI | AOT + JIT | WASI-NN (neural network inference), K8s integration |
| **WAMR** (WebAssembly Micro Runtime) | Embedded, IoT | Interpreter + JIT | 100KB footprint, no OS needed |
| **V8 (Node.js/Deno)** | Browser + server | JIT (Turbofan) | JavaScript + WASM integration |
| **Cloudflare Workers runtime** | Edge compute | AOT | Isolate-based, zero cold start |

## Server-Side Use Cases

### 1. Edge Functions at Near-Zero Cold Start
Cloudflare Workers, Fastly Compute@Edge, and Deno Deploy use WASM as the execution substrate. When a request arrives at an edge PoP, a new WASM isolate starts in **~5 microseconds** (vs. 100ms–1s for a Lambda cold start). This makes per-request isolation economical at edge scale.

**The isolation model**: Each request gets a fresh WASM module instance (its own linear memory, no shared state). 10,000 concurrent requests = 10,000 isolated instances. There's no "noisy neighbor" memory corruption risk between requests on the same machine.

### 2. Plugin Systems (Untrusted Code Execution)
Running arbitrary user-provided code in a hosted platform is dangerous. Docker containers provide isolation but have 100ms+ startup and MB-scale overhead. WASM provides the same isolation with microsecond startup and KB-scale modules.

**Envoy's WASM filter system**: Envoy proxy supports WASM-based HTTP filters — you write a filter in Rust or Go, compile to WASM, and Envoy loads and executes it in a sandboxed environment. The filter can inspect and transform HTTP headers, bodies, and trailers. If the filter panics or hits a timeout, only that filter's WASM module is terminated — the proxy continues serving.

**Other plugin systems**: Istio, Kong, OPA (policy-as-WASM), Shopify's liquid template engine, game modding platforms.

### 3. Database UDFs and Query Extensions
PostgreSQL, ClickHouse, and SingleStore are exploring WASM for user-defined functions. A WASM UDF runs in a sandbox within the database process — if it crashes, the database continues. It can be dynamically loaded without restarting the DB server and is faster than out-of-process UDFs (no IPC overhead).

### 4. Portable AI Inference (WASI-NN)
WasmEdge implements **WASI-NN**: a standard interface for neural network inference. An LLM inference module compiled to WASM + WASI-NN can run on CPU, CUDA, Metal, or OpenVINO backends — the same binary, different hardware. This is particularly powerful for edge inference where the hardware variety is high.

## WASM vs. Alternative Isolation Technologies

| Technology | Startup Latency | Memory Overhead | Isolation Level | Language Support |
|-----------|----------------|-----------------|-----------------|------------------|
| **WASM/WASI** | ~5–100 µs | ~1–10 MB | Memory-safe sandbox | 20+ languages |
| **Linux container** | 50–500 ms | ~10–100 MB | Namespace + cgroup | Any |
| **gVisor (sandboxed container)** | 100–500 ms | ~10 MB | Syscall interception | Any |
| **Firecracker microVM** | 100–200 ms | ~5 MB | Hypervisor (full VM) | Any |
| **V8 Isolate** | ~1–5 ms | ~1–5 MB | JS heap isolation | JS/WASM only |

**The WASM sweet spot**: WASM wins on startup latency and density (many isolates per machine). It loses when you need full POSIX compatibility or access to the entire Linux syscall surface. Use WASM for: short-lived, stateless, high-cardinality workloads. Use containers for: long-lived stateful services with complex dependencies.

## Failure Modes & Production Lessons

**1. Non-deterministic WASM from floating-point differences**
WASM guarantees deterministic execution except for floating-point NaN bit patterns. A WASM module that relies on specific NaN behavior will produce different results on different hosts. Mitigation: avoid relying on NaN bit patterns; test on multiple runtimes during CI.

**2. Memory exhaustion from unbounded linear memory growth**
A WASM module that leaks memory will exhaust its linear memory limit and trap. Unlike a native process, there's no OS swap to fall back on. Mitigation: set explicit maximum memory limits in the WASM module's memory declaration; monitor memory watermarks per invocation.

**3. WASI capability confusion**
A WASM module deployed with `--dir /etc` capability grant (WASI filesystem access) can read arbitrary files in `/etc`. WASI's capability model is only as strong as the capabilities you grant. Mitigation: follow least-privilege for WASI capability grants; default to no capabilities and add only what's needed.

**4. Cold start spikes from JIT compilation**
Wasmtime uses JIT compilation on first load. Loading a 2 MB WASM module for the first time takes 50–200ms for compilation. Subsequent loads use the compiled native code cache. In serverless environments where modules are deployed infrequently, this is fine. In per-request isolation models (new instance per request), pre-compile to AOT and cache. Mitigation: use AOT compilation for production deployments; Wasmtime's `wasmtime compile` produces a `.cwasm` file that loads in microseconds.

**5. Interface mismatches between WASI versions**
WASI 0.1 and WASI 0.2 are not wire-compatible. A module compiled against WASI 0.2 will not run on a runtime that only supports WASI 0.1. Mitigation: pin runtime and SDK versions together; use adapters (provided by the WASM Component Model tooling) for compatibility shims.

## Architecture Diagram

```mermaid
flowchart TD
    subgraph Sources["Source Languages"]
        Rust["Rust\n(.rs)"]
        Go["Go\n(.go)"]
        Python["Python\n(.py)"]
        C["C/C++\n(.c)"]
    end

    subgraph Compile["Compile Step"]
        WASM["WASM Module\n(.wasm or .cwasm)\n(portable bytecode)"]
    end

    subgraph Runtimes["Deployment Targets (same binary)"]
        Edge["Cloudflare Workers\n(edge, ~5µs startup)"]
        K8s["WasmEdge in K8s\n(container alternative)"]
        Plugin["Envoy Filter\n(plugin system)"]
        Lambda["Wasmtime on Lambda\n(serverless)"]
    end

    subgraph WASI_Caps["WASI Capability Grants\n(explicit per-deployment)"]
        FS["Filesystem\n(--dir /data)"]
        Net["Networking\n(--tcplisten)"]
        Env["Environment Vars\n(--env KEY=val)"]
    end

    Sources --> Compile
    Compile --> WASM
    WASM --> Edge
    WASM --> K8s
    WASM --> Plugin
    WASM --> Lambda
    WASI_Caps --> K8s
    WASI_Caps --> Lambda

    style Sources fill:var(--surface),stroke:var(--accent),stroke-width:2px
    style Runtimes fill:var(--surface),stroke:var(--accent2),stroke-width:2px
```

## Back-of-the-Envelope Heuristics

- **Module startup time**: 5–100µs (Wasmtime AOT); 1–5ms (Wasmtime JIT first load); compare to ~100ms–1s Lambda cold start. **20–200× faster than container startup.**
- **Module binary size**: A Rust "Hello World" compiled to WASM: ~2 KB. A typical web handler: 50–500 KB. A Python runtime (CPython compiled to WASM): ~10 MB. Languages with runtimes compile large.
- **Memory overhead**: Each WASM instance: minimum 64 KB (1 page). A typical handler with state: 1–10 MB. **10,000 isolated instances at 1 MB each = 10 GB RAM** — plan accordingly.
- **Execution speed**: AOT-compiled WASM runs at 90–100% of native speed for compute-bound workloads. Garbage-collected languages (Java, Python) pay their GC tax as usual within the WASM sandbox.
- **Isolation density**: A 32-core 128 GB server can run ~128,000 concurrent 1 MB WASM instances — far more than the ~1,000 Docker containers on the same hardware.
- **WASI-NN inference overhead vs native**: ~5–15% slower than native CUDA inference for quantized models — acceptable for edge inference where portability matters.

## Real-World Case Studies

- **Cloudflare Workers**: Cloudflare runs ~50 million WASM-isolated worker invocations per second globally. Their V8 isolate-per-request model (where WASM runs inside V8) achieves < 5ms cold start at any PoP. When Netflix CDN partners fail, Cloudflare Workers can rewrite origin requests in < 1ms at the edge — before the user's TCP connection even travels to origin.

- **Envoy (gRPC/HTTP WASM Filters)**: Envoy's WASM filter SDK (released 2020) enabled organizations like Zalando and eBay to replace custom Lua filters (unsafe, hard to test) with WASM filters written in Rust or Go. The WASM sandbox prevents a filter crash from bringing down the proxy process — critical for a service mesh component handling all inter-service traffic.

- **SingleStore (WASM UDFs)**: SingleStore (a distributed SQL database) added WASM support for user-defined functions in 2022. Teams write analytics functions in Rust, compile to WASM, and load them into the database at runtime. Performance benchmarks show WASM UDFs running 10–50× faster than equivalent Python UDFs (due to elimination of Python interpreter overhead and IPC serialization).

## Connections

- [[Serverless and Edge Computing]] — WASM is the execution substrate for edge functions; Cloudflare Workers is the canonical example
- [[Kubernetes and Platform Engineering]] — WASM is emerging as an alternative to containers in K8s via WasmEdge and runwasi (OCI-compatible WASM shim)
- [[Zero-Trust Architecture]] — WASM's capability-based WASI model mirrors zero-trust principles: explicit capability grants, deny-by-default
- [[Inference Serving Architecture]] — WASI-NN enables portable AI inference across GPU and CPU backends

## Reflection Prompts

1. You're building a SaaS platform where customers can upload custom transformation logic (written in TypeScript). You need to execute this logic on every API request with per-customer isolation. Compare three options: (a) Node.js `vm.runInNewContext`, (b) Docker container per customer, (c) WASM module per request. Evaluate each on startup latency, isolation strength, memory overhead, and operational complexity.

2. A company runs all their business logic as Cloudflare Workers (WASM-based edge functions). A product manager proposes moving the payment processing logic to a Worker for lower latency. What architectural concerns would you raise, and what properties of the WASM execution model are relevant to the security and compliance requirements of payment processing?

3. Your team is adopting WASM for database UDFs in PostgreSQL (via the pg_wasm extension). A developer argues that since WASM is memory-safe, you don't need to worry about malicious UDFs accessing other users' data. Explain the specific WASM properties that provide isolation, and identify one vector they don't protect against.

## Canonical Sources

- WebAssembly specification (webassembly.github.io/spec) — the authoritative bytecode format reference
- WASI specification (wasi.dev) — WASI 0.2 component model and interface types
- Bytecode Alliance (bytecodealliance.org) — Wasmtime, wasm-tools, WASI reference implementations
- Lin Clark, "An Illustrated Guide to the WASM Component Model" (blog series, 2023)
- Bailey Hayes, "WASI 0.2 is Here" (Bytecode Alliance blog, 2024)
