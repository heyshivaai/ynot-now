# AGENTIC-EVAL-STANDARD.md
## Universal Agentic AI Evaluation Framework (v1.0)

This document defines the evaluation standard for any agentic AI system — single-agent or multi-agent.  
It is applied at four lifecycle stages: **Design, Deployment, Runtime, Calibration**.

---

## 00 — Governance Dimensions (5V)

### V1 — Veracity
- Data sources must be verified and documented.
- Provenance from source → output must be traceable.
- Conflicts between sources must be detected and surfaced.
- Data currency (freshness) must be checked.

### V2 — Value
- Every data source must map to a user/business need.
- Outputs must be traceable to explicit goals.
- ROI claims must be evidence-backed.
- Diminishing returns on data must be detectable.

### V3 — Vulnerability
- Data in transit must be encrypted.
- Data at rest must be isolated per tenant/user.
- Access must be scoped to role, task, and duration.
- Deletion must be explicit, logged, and verifiable.

### V4 — Variability
- Same input → equivalent output quality over time.
- Drift in quality must be detectable and logged.
- Upstream source changes must be detected and handled.
- Confidence tiers must remain stable for routine tasks.

### V5 — Visibility
- Inputs used for any output must be inspectable.
- Processing steps must be explainable at a logical level.
- Outputs must be traceable back to inputs.
- Confidence and escalation must be visible to users.
- Audit logs must be complete, exportable, and human-readable.

---

## 01 — Agentic Architecture Standards

### A1 — Role Clarity
- Each agent has a single, clearly defined role.
- Role is expressible in one sentence.
- Out-of-scope behaviors are explicitly defined.

### A2 — Deterministic Orchestration
- Workflows are explicit (state machine / DAG).
- Max steps, timeouts, and cost ceilings are defined.
- Circuit breakers and fallbacks are implemented.

### A3 — Tool Governance
- Tools are typed (schemas for inputs/outputs).
- Tools are versioned and documented.
- Permissions are scoped per agent and per environment.
- Side-effectful tools are sandboxed where possible.

### A4 — Memory Architecture
- Memory layers: ephemeral, session, long-term, external knowledge.
- Access control per agent and per layer.
- Summarization and retention policies defined.

### A5 — Multi-Agent Protocols
- Messages are structured (role, intent, payload).
- Handoffs are explicit (who acts next, on what).
- Conflict resolution rules are defined (who wins, when).
- Shared state is governed (who can read/write what).

---

## 02 — Human Collaboration Standards

### H1 — Human Primacy
- Human judgment overrides agent output by design.
- Irreversible or high-stakes actions require human approval.

### H2 — Explainability
- Every output includes:
  - rationale (short reason),
  - confidence tier,
  - key inputs used.

### H3 — Intervention Points
- Named, specific, consequential checkpoints.
- The system cannot proceed past them without human input (in supervised flows).

### H4 — Audit Trail
- Every action is logged:
  - timestamp,
  - agent,
  - input summary,
  - output summary,
  - confidence,
  - escalation (if any).

### H5 — Clean Exit
- User can export their data and calibration corpus.
- Data can be deleted on request within a defined SLA.

---

## 03 — Ethical Red Lines

### R1 — No Silent Failures
- Missing or declined data must be surfaced in the output.
- Confidence must reflect data gaps.

### R2 — No Autonomous Material Decisions
- Agents may recommend, not commit, on legal/financial/regulatory actions without explicit human approval.

### R3 — No Unsupported Capability Claims
- All capability and ROI claims must be demonstrably achievable.

### R4 — No Undisclosed Conflicts
- Builders must disclose conflicts of interest where relevant.

### R5 — Calibration Data Ownership
- Calibration data belongs to the user/tenant.
- No cross-tenant pooling without explicit consent.

---

## 04 — Evaluation Gates (“The Bar”)

### Gate 01 — Role Clarity
- One-sentence role definition.
- Clear in-scope and out-of-scope behaviors.

### Gate 02 — Output Standard
- All outputs are named, structured, and reproducible.
- Triggers and frequency are defined.

### Gate 03 — User Experience
- Escalations are specific and minimal.
- Users are not spammed with unnecessary decisions.

### Gate 04 — Failure Handling
- Declined data, ambiguity, and scope changes handled explicitly.
- No hallucinated or fabricated data.

### Gate 05 — Calibration Architecture
- Feedback is captured in structured form.
- Corpus is referenced in future runs.
- Calibration improves performance over time.

---

## 05 — Technical Benchmarks (Optional but Recommended)

### T1 — Planning & Reasoning
- Use agentic benchmarks (e.g., GAIA, AgentBench, BIG-Bench Hard) where applicable.

### T2 — Tool Use
- Measure:
  - correct tool selection rate,
  - argument correctness,
  - side-effect safety.

### T3 — Trajectory Quality
- Measure:
  - step utility,
  - loop frequency,
  - plan coherence.

### T4 — Multi-Agent Coordination
- Measure:
  - message clarity,
  - arbitration effectiveness,
  - conflict resolution success.

### T5 — Cost & Latency
- Track:
  - tokens,
  - external API calls,
  - wall-clock time.

---

## 06 — Deployment Checklist

- [ ] All 5Vs passed.
- [ ] All 5 Gates passed.
- [ ] Ethical red lines respected.
- [ ] Human collaboration standards implemented.
- [ ] Tools typed, versioned, and permissioned.
- [ ] Memory layers defined and governed.
- [ ] Escalation paths tested.
- [ ] Outputs reproducible.
- [ ] Benchmarks (where applicable) run and logged.

---

## 07 — Runtime Health Signals

Each V emits a health state:

- **Green** — operating within expected bounds.
- **Amber** — degraded but safe; log + monitor.
- **Red** — halt + escalate.

Any **Red** on any V → pause relevant workflows and escalate to a human.

---

## 08 — Calibration Loop

Every engagement should:
1. Capture feedback (accept / partial / reject + reason).
2. Classify feedback into structured signals.
3. Update calibration corpus.
4. Reference corpus on next run.
5. Improve performance over time.

---

## 09 — Amendment Process

- Version number increments on change.
- Change log updated.
- All deployed agents re-evaluated against new version within a defined window.
