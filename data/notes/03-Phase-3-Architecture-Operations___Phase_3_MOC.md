# Phase 3: Architecture & Operations

*Building, operating, and evolving production systems.*

Phases 1–2 gave you the building blocks and the theory. Phase 3 is about assembling them into real systems and operating them reliably: architectural patterns, messaging, search, security, reliability, observability, deployment, multi-tenancy, geo-distribution, and cost.

## Operational Flywheel

```mermaid
graph TD
    subgraph "Phase 3: Building & Running"
        M12[M12: Architecture] --> M17[M17: Observability]
        M17 --> M16[M16: Reliability]
        M16 --> M12
        M13[M13: Messaging] --- M14[M14: Search]
        M15[M15: Security] --- M18[M18: Multi-Tenancy]
    end

    style M17 fill:var(--surface),stroke:var(--accent),stroke-width:2px;
    style M15 fill:var(--surface),stroke:#ff4d4d,stroke-width:2px;
```

## Senior Engineer's Architecture Heuristic

- **Blast Radius Management**: Good architecture isn't about preventing failure; it's about containing it. (Cells, Circuit Breakers).
- **Observability is not Optional**: If you can't see it, you can't run it. OpenTelemetry is as important as your database.
- **Security is not a Layer**: Build zero-trust from day one. Assume your internal network is already compromised.

## Modules

| Module | Focus | Key Question Answered |
|--------|-------|----------------------|
| [[_Module 12 MOC]] | Architectural Patterns | How do you structure a system of services? |
| [[_Module 13 MOC]] | Messaging & Data Pipelines | How do services communicate asynchronously? |
| [[_Module 14 MOC]] | Search Systems | How do you find things efficiently? |
| [[_Module 15 MOC]] | Security & Zero-Trust | How do you protect the system end to end? |
| [[_Module 16 MOC]] | Reliability Engineering & Testing | How do you design for failure and verify resilience? |
| [[_Module 17 MOC]] | Observability & Deployment | How do you see what's happening and ship changes safely? |
| [[_Module 18 MOC]] | Multi-Tenancy, Geo & Cost | How do you serve many customers globally without going broke? |
| [[03-Phase-3-Architecture-Operations__Module-24-Data-Privacy-Compliance|Module 24]] | Data Privacy & Compliance | How do you handle sensitive data and regulatory requirements? |

## After This Phase

You can design, build, deploy, monitor, and operate a production distributed system. Phase 4 adds the modern frontier: AI serving, RAG, agents, and platform engineering.