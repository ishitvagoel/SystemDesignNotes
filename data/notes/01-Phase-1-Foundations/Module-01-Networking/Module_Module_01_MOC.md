# Module 01: Networking & Communication Protocols

*How machines talk to each other — from bits on the wire to application-layer semantics.*

## Why Start Here

Every distributed system is, at its core, machines sending messages over a network. Before you can reason about consistency, replication, or consensus, you need to understand what happens when one machine tries to talk to another: how names get resolved, how connections get established, how data flows, and how load gets distributed. Networking isn't just plumbing — the constraints of the network (latency, bandwidth, failure modes) shape every architectural decision you'll make in later modules.

## Notes in This Module

### DNS & Name Resolution
- [[01-Phase-1-Foundations__Module-01-Networking__DNS_Resolution_Chain]] — How a domain name becomes an IP address, the caching hierarchy, and why DNS is both the simplest and most fragile part of the internet
- [[01-Phase-1-Foundations__Module-01-Networking__Anycast_and_GeoDNS]] — Routing users to the nearest server using IP tricks and geography-aware resolution

### Transport Layer
- [[01-Phase-1-Foundations__Module-01-Networking__TCP_Deep_Dive]] — Congestion control, tuning, head-of-line blocking, and why TCP's guarantees come at a cost
- [[01-Phase-1-Foundations__Module-01-Networking__TCP_vs_UDP]] — When reliability should live in the application layer, not the transport layer

### Application Layer Protocols
- [[01-Phase-1-Foundations__Module-01-Networking__HTTP_Evolution_—_1.1_to_2_to_3]] — Multiplexing, QUIC, and the thirty-year journey to fix head-of-line blocking
- [[01-Phase-1-Foundations__Module-01-Networking__Connection_Pooling_and_Keep-Alive]] — Amortizing the cost of connection setup across many requests

### Load Balancing
- [[01-Phase-1-Foundations__Module-01-Networking__Load_Balancing_Fundamentals]] — L4 vs L7, algorithms, health checks, and how load balancers shape system behavior

### API Communication Paradigms
- [[01-Phase-1-Foundations__Module-01-Networking__gRPC_vs_REST_vs_GraphQL]] — Three models for service-to-service and client-to-server communication, and when each shines
- [[01-Phase-1-Foundations__Module-01-Networking__gRPC_Deep_Dive]] — Protobuf encoding efficiency, the four streaming patterns, deadline propagation, interceptor chains, and gRPC-Web limitations

## Prerequisites
None — this is where the vault begins.

## Where This Leads
- [[Module_Module_02_MOC]] — API Design & Contracts (builds directly on gRPC/REST/GraphQL and HTTP knowledge)
- [[Module_Module_06_MOC]] — Caching, Storage & CDN (CDN architecture depends on DNS and HTTP caching semantics)
- [[Module_Module_01_MOC]] → every later module — networking constraints (latency, partitions, bandwidth) are the "why" behind most distributed systems problems