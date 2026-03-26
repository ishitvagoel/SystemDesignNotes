# Common Decision Pitfalls

## Why This Exists

The hardest bugs in system design are not technical — they are cognitive. Smart, experienced engineers make systematically bad decisions not because they lack knowledge but because they have predictable reasoning biases. Naming these biases is the first step to catching them in real time.

This note catalogues 8 recurring anti-patterns in design reasoning, each with a physics or context analogy to make it memorable, and a practical detection test.

---

## 1. Resume-Driven Development

**What it looks like**: Choosing a technology because it is impressive, trending, or good for the engineer's career, not because it fits the problem.

> "We should use Kubernetes. It's what every serious company runs."

**Why it happens**: Engineers optimise for their own long-term career interests alongside the immediate project. This is not malicious; it is a natural incentive misalignment.

**Physics isomorphism**: Using a Formula 1 engine in a city car. The engine is genuinely impressive and genuinely fast — but the operating conditions are wrong. A Formula 1 engine requires constant high-RPM operation; driven at city speeds, it is inefficient, expensive to maintain, and prone to failure modes the driver isn't trained to handle.

**Detection test**: Can you write down the specific properties of this technology that solve a specific, numbered constraint in your constraint list? If the benefit is "it's what Netflix uses" and not a specific numbered constraint, you are in this pitfall.

**What to do instead**: Anchor every technology choice to a specific constraint. "We need Kubernetes because we have 40 services deployed by 8 teams with independent release cycles, and we need namespace-level resource isolation." That is a real reason.

---

## 2. Cargo Culting

**What it looks like**: Copying an architecture from a famous company without understanding the constraints that produced it.

> "Netflix uses microservices, so we should too."

**Why it happens**: Design decisions at large, respected companies are visible (via engineering blog posts, conference talks) and appear validated by success. The context — 2,000+ engineers, 200M+ users, 20 years of accumulated technical debt — is invisible.

**Physics isomorphism**: Cargo cult science (Feynman). Cargo cult practitioners replicated the *form* of scientific practice (runways, radio equipment) without the *function* (aircraft). The form without the function produces nothing. Copying a Netflix architecture with a 5-person team replicates the form (Kafka, Kubernetes, service mesh) without the function (managing independent release cycles across hundreds of services).

**Detection test**: Two questions: (1) What was the specific problem this company was solving when they made this architectural choice? (2) Do you have the same problem? If you cannot answer (1), or if the answer to (2) is "not really," you are cargo culting.

**What to do instead**: When reading about an architecture, look for the *constraint* that forced the decision, not the decision itself. Amazon moved to service-oriented architecture because shared database ownership was blocking team autonomy — does your team have that problem?

---

## 3. Premature Optimisation

**What it looks like**: Designing for a scale or performance requirement you do not currently have and may never reach.

> "We need sharding from day one. We could have a million users."

**Why it happens**: It feels responsible to plan ahead. "What if we succeed?" is a legitimate concern. But the cost of speculative optimisation is paid now (in complexity, development time, operational burden), while the benefit is contingent on future growth that may not materialise.

**Physics isomorphism**: Building a bridge rated for 100-ton trucks when only bicycles will cross. The bridge works — but the opportunity cost (money, time, concrete) spent on the over-engineering could have been spent on something that delivers value now. The bridge is *technically correct* but *economically wrong*.

**Detection test**: What is your current traffic/scale? What is the scale at which this optimisation becomes necessary (back-of-envelope it)? If the ratio is more than 100x, the optimisation is probably premature.

**What to do instead**: Design for the scale you are at. Build in *awareness* of future scaling bottlenecks (know where the phase transition is) without pre-building the solution. See [[00-Phase-0__Evolving_Designs_Over_Time]].

---

## 4. The "Best Practice" Trap

**What it looks like**: Applying a pattern labelled "best practice" without understanding the context that makes it best.

> "Best practice is to always use async messaging between services."

**Why it happens**: "Best practice" is a status shortcut. It transfers credibility from the source ("this is what the experts recommend") to the decision without requiring the decision-maker to understand the underlying reasoning.

**Physics isomorphism**: Dimensional analysis without physical context. "The formula for kinetic energy is ½mv²" is true — but applying it in a context where relativistic effects matter (v approaching c) gives dangerously wrong answers. The formula is correct within its domain; outside its domain, it fails.

**Detection test**: "Best practice for WHO, at WHAT scale, under WHAT constraints?" If you cannot answer all three, you are applying a formula outside its domain.

**What to do instead**: Treat every best practice as a conditional statement: "For systems with property X at scale Y, pattern Z performs well because of reason W." Evaluate whether your system has property X at scale Y.

---

## 5. Anchoring Bias

**What it looks like**: Evaluating all options relative to the first option you considered, or over-weighting the technology you already know.

> "I know Postgres well, so let me think about how to solve this with Postgres."

**Why it happens**: The first anchor sets the reference frame for all subsequent evaluation. Familiarity creates cognitive ease, which the brain interprets as correctness.

**Detection test**: In your last three technical decisions, were all options within the same technology family as what you already knew? If so, you are anchoring.

**What to do instead**: Force yourself to seriously consider at least one option outside your comfort zone before deciding. You do not have to choose it — but genuinely evaluating it calibrates your anchoring. The goal is not to switch technologies; it is to make the choice consciously.

---

## 6. Consistency Theater

**What it looks like**: Claiming strong consistency in the system design while the application layer has race conditions that undermine it.

> "We use a relational database with ACID transactions, so our data is consistent." *(While the application reads, modifies, and writes in separate HTTP requests with no locking.)*

**Why it happens**: Database-level consistency guarantees are visible and legible (ACID, transaction isolation levels). Application-layer race conditions are invisible — they live in the code paths between transactions, in the assumptions about concurrent access.

**Detection test**: Can you trace a race condition in the application layer that would produce an inconsistent state even if the database provides ACID guarantees? Common scenarios: check-then-act without a lock; read-modify-write across multiple transactions; distributed state split across multiple services without a coordination mechanism.

**What to do instead**: Map the full consistency boundary, not just the database boundary. For every "update" operation: what happens if two requests execute the update concurrently? What state does the system end up in?

---

## 7. Symmetry Bias

**What it looks like**: Applying equal analytical rigor to all decisions regardless of their reversibility or impact.

> Spending two weeks choosing between Redis and Memcached while spending two hours deciding on the primary data model.

**Why it happens**: Analysis feels productive. All decisions look symmetrical when viewed as items on a backlog. The distinction between one-way and two-way doors (see [[00-Phase-0__Reasoning_Through_Trade-Offs]]) is not visible from a ticket title.

**Detection test**: For each decision in your current design process, classify it as one-way or two-way door. Is your analysis time proportional to irreversibility? If you are spending more time on a two-way door than a one-way door, you have symmetry bias.

**What to do instead**: Explicitly classify decisions at the start of each design discussion. One-way doors get deep analysis, prototyping, adversarial review. Two-way doors get a timebox (30 minutes, pick, move on — you can change it later).

---

## 8. Premature Abstraction

**What it looks like**: Building a general-purpose framework, platform, or abstraction layer to solve a problem you currently have exactly once.

> "Let's build a general notification framework that any service can plug into." *(When there is one service that needs to send one type of notification.)*

**Why it happens**: Abstraction is intellectually satisfying. It feels like planning ahead and thinking architecturally. But every generalisation has a cost: more interface surface area, more configuration, more documentation required, more edge cases to handle.

**Physics isomorphism**: Building a factory to produce one widget. The factory costs more than the widget itself. The factory makes sense when you will produce many widgets; for one widget, manufacture it directly.

**Detection test**: Does this abstraction have more than one concrete user right now? If the answer is "no, but it will soon," ask: "what is the cost of refactoring when the second use case actually arrives?" If refactoring is cheap (two-way door), build the specific thing now and generalise later. If refactoring is expensive (one-way door), abstract — but only to the level required by the concrete cases you can see.

**What to do instead**: Apply the Rule of Three: do not abstract until you have at least three concrete use cases. The first use case is a specific solution; the second is two specific solutions; the third reveals the actual pattern worth abstracting.

---

## Connections

- [[00-Phase-0__Reasoning_Through_Trade-Offs]] — the framework these pitfalls subvert
- [[00-Phase-0__Evolving_Designs_Over_Time]] — the antidote to premature optimisation
- [[00-Phase-0__First_Principles_Thinking]] — the anchor against cargo culting and best-practice traps
- [[Phase_0_MOC]] — phase overview

## Reflection Prompts

- Which of these 8 pitfalls do you recognise most readily in yourself? In your team?
- Think of a technical decision that went badly. Which pitfall was it? What was the detection test you missed?
- How do you create team conditions that make it safe to name these pitfalls in a design review without it feeling like a personal attack?

## Canonical Sources

- Feynman, "Cargo Cult Science" (1974 Caltech commencement address) — the original cargo cult science framing
- Fowler, "Yagni" (martinfowler.com) — on premature abstraction and the cost of speculative generality
- Kahneman, *Thinking, Fast and Slow*, Ch. 11 — on anchoring bias
- MacNicol & Loftesnes, "Resume-Driven Development" — naming and framing the career incentive problem
