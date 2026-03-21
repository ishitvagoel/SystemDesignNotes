# Service Decomposition and Bounded Contexts

## Why This Exists

The hardest microservices decision isn't "should we decompose?" — it's "where do we draw the boundaries?" Wrong boundaries create tightly coupled services that must be deployed together, share data, and fail together — a distributed monolith with none of the benefits of either architecture.

Domain-Driven Design (DDD) provides the primary tool: **bounded contexts**. A bounded context is a boundary within which a particular domain model is defined and applicable. The same real-world concept (e.g., "Customer") may have different representations in different contexts (billing sees payment methods, shipping sees addresses, marketing sees preferences). Each bounded context becomes a candidate service boundary.


## Mental Model

A hospital has departments: cardiology, neurology, orthopedics. Each department has its own vocabulary, its own patient records format, and its own internal workflows. A "patient" means something different to billing (an account with insurance info) than to the ER (a person with symptoms and vitals). A bounded context is a department boundary — inside it, one model rules and everything is consistent. Between departments, you need explicit translation (the patient's ER record is mapped to a billing record at the boundary). Service decomposition is the art of finding these natural department boundaries in your software, where the internal language changes.

## How to Find Boundaries

### Step 1: Identify Domain Concepts

Map your domain's nouns (entities), verbs (operations), and their relationships. Event storming (a collaborative workshop technique) is effective: stakeholders write domain events on sticky notes, cluster them, and identify aggregates and boundaries.

### Step 2: Group by Cohesion

Concepts that change together, are queried together, and are owned by the same team belong in the same bounded context. Concepts that can evolve independently belong in separate contexts.

**High cohesion within a context**: Order, OrderItem, and OrderStatus change together and are always queried together. They belong in the same service.

**Low coupling between contexts**: The Order service needs the customer's name for display, but it doesn't need to know the customer's billing details. It stores a customer ID and fetches the name when needed — or caches a denormalized copy.

### Step 3: Align with Team Ownership

**Conway's Law**: "Organizations which design systems are constrained to produce designs which are copies of the communication structures of these organizations." This isn't a warning — it's a design tool. Align service boundaries with team boundaries. One team owns one or more services. No service is owned by multiple teams.

**Inverse Conway Maneuver**: If your team structure doesn't match the desired architecture, reorganize teams to match. If you want separate Order and Inventory services, create separate Order and Inventory teams. The organizational structure will drive the technical structure.

### Communication Between Contexts

**Synchronous (request-response)**: Service A calls Service B's API. Simple, but creates runtime coupling — if B is down, A's request fails. Use for queries where the caller needs an immediate response.

**Asynchronous (events)**: Service A publishes an event ("OrderCreated"). Service B subscribes and reacts. Decoupled — A doesn't know or care about B. Use for reactions, notifications, and data propagation.

**Shared nothing**: Each service owns its data store exclusively. No shared databases. If Service B needs data from Service A, it either calls A's API or subscribes to A's events and maintains a local copy (denormalized). This is the fundamental rule of microservice data ownership.

## Anti-Context Mapping Patterns

**Shared Kernel**: Two contexts share a small, jointly-owned data model. Use sparingly — it creates coupling. Acceptable for core domain types that are truly shared (e.g., a Currency type).

**Customer-Supplier**: One context (supplier) provides data/services that another (customer) depends on. The supplier's team must consider the customer's needs. Typical upstream/downstream relationship.

**Anti-Corruption Layer (ACL)**: When integrating with a legacy system or external service, build a translation layer that converts the external model into your internal model. This prevents external schema changes from leaking into your domain.

## Trade-Off Analysis

| Decomposition Strategy | Risk of Wrong Boundaries | Speed to Implement | Refactoring Cost if Wrong | Best For |
|----------------------|-------------------------|-------------------|--------------------------|----------|
| By domain / bounded context (DDD) | Low — aligns with business language | Slow — requires domain analysis | Moderate — clear conceptual boundaries | Mature teams with domain expertise |
| By team / Conway's Law | Low — aligns with communication | Fast — follow existing structure | High — reorg requires rearchitecture | Organizations with stable team structure |
| By data ownership | Low — clear data boundaries | Medium | High — data migrations are expensive | Data-intensive systems, privacy/compliance |
| By verb / use case | Medium — use cases cross domains | Fast | Low — small, replaceable services | API gateways, BFF (Backend for Frontend) |
| By technical layer | High — creates distributed monolith | Fast | Very high — cross-cutting changes touch everything | Almost never recommended for microservices |

**The distributed monolith trap**: If every service change requires coordinated deployment of multiple other services, you've built a distributed monolith — you have all the complexity of microservices with none of the benefits. The test: can a team deploy their service independently without coordinating with other teams? If not, your boundaries are wrong.

## Failure Modes

**Distributed monolith**: Services are decomposed by technical layer (API service, data service, business logic service) instead of by domain. Every feature change requires coordinated deployments across all three services. You have all the complexity of microservices with none of the independent deployability. Solution: decompose by business capability or bounded context, not by technical layer. Each service should own its data, logic, and API for a specific domain.

**Shared database coupling**: Two "independent" microservices share a database and read each other's tables directly. Schema changes in one service break the other. The services can't be deployed independently because they're coupled at the data layer. Solution: each service owns its database. Cross-service data access goes through APIs. If you can't separate the database yet, you have a modular monolith, not microservices.

**Anemic domain services**: Services are decomposed too finely — a service per entity rather than per business capability. An "order" operation touches the User service, Product service, Pricing service, Inventory service, and Order service, each making synchronous calls. One slow service cascades latency to all. Solution: align services with business capabilities that can be completed with minimal cross-service calls. An order service should contain everything needed to place an order.

**Context boundary leakage**: The "Customer" concept means different things in Sales (a lead with contact info), Billing (an account with payment methods), and Support (a ticket history). Forcing all three to share a single Customer service creates a god service with conflicting requirements. Solution: each bounded context has its own representation of customer, and they synchronize via events. Sales publishes "LeadConverted," Billing creates its own Customer record.

**Data duplication consistency drift**: Each service maintains its own copy of shared data (customer name, product price). Over time, these copies drift — Billing has the old name, Support has the new name. Solution: define a single source of truth for each data element, propagate changes via CDC or domain events, and audit for drift periodically.

## Connections

- [[Monolith vs Microservices]] — Bounded contexts define where to draw service boundaries
- [[Saga Pattern]] — Cross-context operations require saga coordination
- [[gRPC vs REST vs GraphQL]] — Inter-service communication paradigm choice; GraphQL Federation aligns with bounded context ownership
- [[Strangler Fig and Migration Patterns]] — Extracting bounded contexts from a monolith

## Reflection Prompts

1. You're decomposing an e-commerce monolith. The "Product" concept appears in Catalog (name, description, images), Inventory (stock levels, warehouse locations), Pricing (base price, discounts, taxes), and Recommendations (user affinity, click-through rates). Should "Product" be one service or four? What are the consequences of each choice?

2. Two teams independently own the Orders service and the Payments service. A new feature requires showing "order status with payment details" on a single page. Team A wants to add a REST call from Orders to Payments. Team B wants to publish payment events that Orders consumes. A third engineer suggests a BFF (Backend for Frontend). How do you evaluate these options, and what does each reveal about the coupling between these bounded contexts?

3. Your team identified a bounded context boundary, built a new service, and deployed it. Three months later, you realize the boundary was wrong — the new service constantly needs data from two other services to fulfill its core function. Every request requires 2-3 synchronous calls. What's your recovery strategy, and what would you do differently to validate boundaries before committing to decomposition?

## Canonical Sources

- *Building Microservices* by Sam Newman (2nd ed) — Chapters 1–3 cover bounded contexts, Conway's Law, and decomposition strategies
- Eric Evans, *Domain-Driven Design* (2003) — the original source for bounded contexts, aggregates, and domain modeling
- *Team Topologies* by Skelton & Pais — aligning team structure with architecture using Conway's Law
- *Software Architecture: The Hard Parts* by Neal Ford & Mark Richards — detailed trade-off analysis for decomposition decisions