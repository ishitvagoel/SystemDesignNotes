# Module 01: Networking & Communication Protocols

*How machines talk to each other — from bits on the wire to application-layer semantics.*

## Why Start Here

Every distributed system is, at its core, machines sending messages over a network. Before you can reason about consistency, replication, or consensus, you need to understand what happens when one machine tries to talk to another: how names get resolved, how connections get established, how data flows, and how load gets distributed. Networking isn't just plumbing — the constraints of the network (latency, bandwidth, failure modes) shape every architectural decision you'll make in later modules.

## Notes in This Module

### DNS & Name Resolution
- [[DNS Resolution Chain]] — How a domain name becomes an IP address, the caching hierarchy, and why DNS is both the simplest and most fragile part of the internet
- [[Anycast and GeoDNS]] — Routing users to the nearest server using IP tricks and geography-aware resolution

### Transport Layer
- [[TCP Deep Dive]] — Congestion control, tuning, head-of-line blocking, and why TCP's guarantees come at a cost
- [[TCP vs UDP]] — When reliability should live in the application layer, not the transport layer

### Application Layer Protocols
- [[HTTP Evolution — 1.1 to 2 to 3]] — Multiplexing, QUIC, and the thirty-year journey to fix head-of-line blocking
- [[Connection Pooling and Keep-Alive]] — Amortizing the cost of connection setup across many requests

### Load Balancing
- [[Load Balancing Fundamentals]] — L4 vs L7, algorithms, health checks, and how load balancers shape system behavior

### API Communication Paradigms
- [[gRPC vs REST vs GraphQL]] — Three models for service-to-service and client-to-server communication, and when each shines
- [[gRPC Deep Dive]] — Protobuf encoding efficiency, the four streaming patterns, deadline propagation, interceptor chains, and gRPC-Web limitations

## Prerequisites
None — this is where the vault begins.

## Where This Leads
- [[_Module 02 MOC]] — API Design & Contracts (builds directly on gRPC/REST/GraphQL and HTTP knowledge)
- [[_Module 06 MOC]] — Caching, Storage & CDN (CDN architecture depends on DNS and HTTP caching semantics)
- [[_Module 01 MOC]] → every later module — networking constraints (latency, partitions, bandwidth) are the "why" behind most distributed systems problems