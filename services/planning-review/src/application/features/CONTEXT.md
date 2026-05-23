# Features

Application-layer feature modules that classify Plans and apply gating decisions before review work begins. Holds the risk-scoring and override-validation logic that turns a raw Plan submission into a PlanningTriage outcome.

## Language

**PlanSignal**:
A pattern-detected tag (`security-sensitive`, `architecture-or-service-boundary`, `prototype-or-ui`, `lightweight-change`, `uncategorized-low-risk`) extracted from a Plan's title, markdown, and changed paths.
_Avoid_: Tag, marker, hint.

**RequiredReviewType**:
A review gate enumerated as `security_review`, `code_review`, `prototype_review`, `uat`, or `lightweight_approval` that a Plan must satisfy before execution.
_Avoid_: Review kind, gate type, check.

**PlanningEvidenceRequirement**:
The named artifact (e.g. `prototype-drift-proof`, `security-review-notes`) that must accompany each RequiredReviewType.
_Avoid_: Proof, attachment, receipt.

**PlanningRisk**:
The `low | medium | high` bucket derived from the union of PlanSignals on a Plan.
_Avoid_: Severity, score, priority.

**TriageDecision**:
The `allowed` verdict over a triage output and the reviewer's selected gates, including any missing gates and the matched PlanningTriageOverride.
_Avoid_: Triage result (reserved for the classifier output), gate response.

## Relationships

- A **ClassifyPlanningTriageInput** produces one **PlanningTriageOutput** containing many **PlanSignal**s, one **PlanningRisk**, and many **RequiredReviewType**s.
- Each **RequiredReviewType** maps to exactly one **PlanningEvidenceRequirement**.
- An **ApplyPlanningTriageDecisionInput** combines one **PlanningTriageOutput** with selected **RequiredReviewType**s and an optional **PlanningTriageOverride** to yield one **TriageDecision**.
- A **TriageDecision** with `risk: "high"` and missing `code_review` or `uat` is denied unless a valid **PlanningTriageOverride** is present.

## Example dialogue

> **Dev:** "If the Plan markdown mentions `oauth`, what **RequiredReviewType**s come back?"
> **Domain expert:** "The `security-sensitive` **PlanSignal** fires, which adds `security_review`, `code_review`, and `uat`. **PlanningRisk** lifts to `high`, so a **TriageDecision** without those gates is denied unless a **PlanningTriageOverride** waives them with an approver and reason."

## Flagged ambiguities

- **PlanningTriageOutput vs TriageDecision** — the classifier returns a **PlanningTriageOutput** (signals + required gates + evidence). The decision step returns a **TriageDecision** (allowed/denied + missing gates). They are not interchangeable.
- **PlanSignal vs PlanningRisk** — a **PlanSignal** is a single detected pattern; **PlanningRisk** is the aggregate bucket derived from all signals on a Plan.
- **lightweight_approval vs no review** — `lightweight_approval` is still a **RequiredReviewType** with its own **PlanningEvidenceRequirement** (approval note). A Plan never has zero required gates.
