# Design Doc: Content Expansion - Cloud-Native, FinOps, and Privacy

## Goal
Expand the System Design Vault to cover three critical modern topics: Cloud-Native/Serverless, FinOps/Cost Engineering, and Data Privacy/Compliance.

## New Modules

### M22: Cloud-Native & Serverless
- **ID**: `03-Phase-3-Architecture-Operations__Module-22-Cloud-Native-Serverless`
- **Focus**:
  - FaaS (AWS Lambda, GCP Functions) vs Managed K8s (EKS/GKE) vs Raw VMs (EC2).
  - The "Cold Start" problem: causes, mitigations (provisioned concurrency, warm-ups).
  - Event-driven serverless architecture (EventBridge, SQS, SNS).
  - Serverless-first databases: DynamoDB, PlanetScale, Neon, Upstash.
  - Concurrency limits and throttling in serverless environments.

### M23: FinOps & Cost Engineering
- **ID**: `03-Phase-3-Architecture-Operations__Module-23-FinOps-Cost-Engineering`
- **Focus**:
  - The Cloud Bill: Compute vs Storage vs Networking (Egress).
  - Networking Cost Optimization: Single-AZ vs Multi-AZ traffic, VPC endpoints.
  - Compute Optimization: Spot Instances, Graviton (ARM), Right-sizing.
  - Storage Tiers: S3 Intelligent Tiering, EBS vs EFS vs S3 costs.
  - Architecting for a budget: TTLs on data, aggressive caching to save egress.

### M24: Data Privacy & Compliance
- **ID**: `03-Phase-3-Architecture-Operations__Module-24-Data-Privacy-Compliance`
- **Focus**:
  - Regulatory Frameworks: GDPR (Europe), HIPAA (US Healthcare), CCPA (California).
  - Data Residency and Sovereignty: Local-only storage, cross-border data transfer.
  - PII Masking & Tokenization: Handling sensitive data at the application layer.
  - Immutable Audit Logs: Designing for traceability and non-repudiation.
  - Right to be Forgotten: Designing for efficient data deletion (Tombstones, soft-deletes).

## Impact on Existing Data

### 1. Updated 20-Week Study Plan
The current 20-week plan will be updated to include these modules.
- **Weeks 12-18 (Phase 3)**: Modules will be slightly condensed or the plan extended to **22 Weeks**.
- **New Week 17**: M22: Cloud-Native + M23: FinOps.
- **New Week 18**: M24: Privacy + M18: Multi-Tenancy (synergy with Data Sovereignty).

### 2. New Quests (`quests.json`)
- **q6: The Cost of Growth**: "Your cloud bill is $100k/mo. Reduce it by 40% without sacrificing availability." (Focus on M23).
- **q7: GDPR Hammer**: "A user requests all their data be deleted. Implement 'Right to be Forgotten' across 5 sharded databases." (Focus on M24).

### 3. New Scenarios (`scenarios.json`)
- **serverless_cold_start_crisis**: "Your Lambda-based checkout service is timing out during peak load. Mitigate the cold start."
- **egress_cost_explosion**: "Your inter-region data transfer is costing more than your compute. How will you optimize?"
- **pii_data_leak_prevention**: "An auditor found PII in your debug logs. What is your immediate fix?"

## Implementation Steps
1. Create new Markdown files in `data/notes/` for each module.
2. Update `data/notes/00-Meta__How_to_Study_This_Vault.md` with the new study plan.
3. Update `data/quests.json` and `data/scenarios.json`.
4. Run `scripts/rebuild-data.js` to refresh the search index and graph.
