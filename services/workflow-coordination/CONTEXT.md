# Workflow Coordination

Owns the workflow spine that ties freeform docs, plans, tasks, runs, reviews, UAT, and generated regression tests together. Holds the **Artifact** catalog, the immutable **AuditEntry** stream, and the **WorkflowCycle** orchestration that drives a single piece of work from intent to acceptance.

## Language

**WorkflowCycle**:
One end-to-end pass from freeform intent through guided planning, approved plan materialization, dependency execution, QA, UAT/code review, and generated E2E regression.
_Avoid_: pipeline, workflow run, journey, flow.

**Stage**:
A named segment of a **WorkflowCycle** — `freeform`, `guidedPlanning`, `planMaterialization`, `dependencyRun`, `qaReview`, `finalQa`, `uatHandoff`, `generatedE2e`.
_Avoid_: step, phase, milestone.

**TraceSpine**:
The set of linked references (workspace, project, workItem, doc, run, artifact, audit, memory, …) that every **CycleEvent** carries so a single `traceId` walks the whole **WorkflowCycle**.
_Avoid_: lineage, breadcrumbs, correlation chain.

**Artifact**:
A first-class, durable output produced by a cycle — prototype, plan markdown, generated E2E test, regression report — stored with `kind`, `bodyPath`, optional `checksumSha256`, and joined to a `traceId`.
_Avoid_: file, output, document, attachment, blob.

**AuditEntry**:
A single append-only record `(verb, subjectKind, subjectId, payload, orgId, userId, createdAt)` describing one mutation observed on a domain subject.
_Avoid_: log line, event, history row, change record.

**Verb**:
The action half of an **AuditEntry** (`created`, `approved`, `dispatched`, `superseded`, …) — the canonical past-tense name of the mutation.
_Avoid_: action, op, command, type.

**Subject**:
The thing an **AuditEntry** is about, addressed by `(subjectKind, subjectId)` where `subjectKind` is e.g. `task`, `plan`, `artifact`, `review_session`, `uat_session`.
_Avoid_: target, entity, object, resource.

**CycleEvent**:
A **Stage** transition emitted by the cycle orchestrator (`PlanningPreviewService`, `DependencyRunService`, `ReviewWorkbenchService`) — carries `traceId`, **Stage** identity, and the lifecycle status that produced it.
_Avoid_: workflow event, stage event, transition log, lifecycle log.

**RetentionPolicy**:
A per-org / per-project rule (`retainDays`) that bounds how long **AuditEntry** rows are queryable before pruning.
_Avoid_: TTL, expiry, retention window.

**Outbox**:
The transactional buffer that captures domain mutations alongside their **AuditEntry** rows so audit + integration events publish atomically with the underlying write.
_Avoid_: queue, event bus, dispatcher.

## Relationships

- A **WorkflowCycle** is composed of an ordered set of **Stages**; each **Stage** emits one or more **CycleEvents** and one or more **AuditEntries**.
- A **WorkflowCycle** is identified by exactly one `traceId`; every **CycleEvent**, **AuditEntry**, and **Artifact** it produces carries the same `traceId` via the **TraceSpine**.
- A **Stage** can produce zero-or-more **Artifacts** (e.g. `planMaterialization` → plan markdown **Artifact**; `generatedE2e` → regression test **Artifact**).
- An **AuditEntry** points to exactly one **Subject** via `(subjectKind, subjectId)` and exactly one **Verb**.
- An **Artifact** belongs to exactly one project and is addressable as a `subjectKind=artifact` **Subject** by **AuditEntries**.
- A **RetentionPolicy** governs zero-or-many **AuditEntries** scoped by `(orgId, projectId?)`.
- The **Outbox** carries one row per domain mutation and produces exactly one **AuditEntry** plus zero-or-more integration events.

## Example dialogue

> **Dev:** "When `materializeApprovedPlan` runs, do we get an **Artifact** for the plan markdown and an **AuditEntry**, or just one?"
> **Domain expert:** "Both — but only one **CycleEvent**. The plan markdown is an **Artifact** of kind `plan`, the **Verb** on the **AuditEntry** is `materialized`, and the **CycleEvent** marks the `planMaterialization` **Stage** complete on this `traceId`."
> **Dev:** "And if UAT rejects, does that start a new **WorkflowCycle**?"
> **Domain expert:** "No — same `traceId`, same **WorkflowCycle**. We emit a new **CycleEvent** on the `uatHandoff` **Stage** with **Verb** `changes_requested` and route back to `dependencyRun`. A new **WorkflowCycle** only starts when a fresh freeform doc opens with a new `traceId`."

## Flagged ambiguities

- "Artifact" vs "Document" vs "Output" — resolved: **Artifact** is the durable, addressable thing this service catalogs (prototype, plan markdown, generated E2E test). A **Document** is a freeform/markdown input owned by `knowledge-workspace`. "Output" is informal — do not use as a domain term.
- "Audit log" vs "Audit event" vs "Audit entry" — resolved: each row is an **AuditEntry**. The stream of them is the audit log (lowercase, not a domain term). "Audit event" is forbidden — it conflicts with **CycleEvent** and with platform event-emitter usage.
- "Cycle" vs "Run" vs "Pipeline" — resolved: **WorkflowCycle** is the end-to-end orchestration here. A **Run** (agent run / dependency run) is a single execution inside the `dependencyRun` **Stage** and is owned by `execution-orchestration`. "Pipeline" is not a domain term.
- "Stage" vs "Phase" vs "Step" — resolved: **Stage** only. Reserve "phase" for project-tracker planning phases and never for cycle segments.
- "Verb" vs "Action" — resolved: **Verb** on the wire and in code (`recordAuditEvent({ action })` is a legacy input field name; the persisted column is `verb`). New code uses `verb` throughout.
- "Subject" vs "Target" vs "Entity" — resolved: **Subject** is the audit term. "Target" belongs to lifecycle-event payloads (`targetKind`, `targetId`); they may refer to the same row but the audit vocabulary is **Subject**.
- "Trace" vs "Lineage" — resolved: **TraceSpine** (and its `traceId`) is the canonical term. "Lineage" is used informally in payload field names (`taskLineageId`) but is not a domain term in its own right.
