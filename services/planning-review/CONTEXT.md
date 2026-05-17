# Planning & Review

Workflows for turning a freeform user request into an approved technical plan, breaking that plan into tasks/docs/artifacts, and conducting line-level code review of the resulting diffs and PRs. Owns workflow logic and prompt orchestration only; persisted entities (tasks, docs, artifacts, events) live in other services.

## Language

**Plan**:
A markdown document describing a proposed change submitted by an agent and held for user decision in a review UI.
_Avoid_: Proposal, spec, blueprint, RFC.

**PlanSubmission**:
A single call that hands a Plan (inline text or absolute `.md` path) to the review UI and awaits a decision.
_Avoid_: Plan request, plan upload.

**PlanDecision**:
The user's verdict on a PlanSubmission — approved, approved with notes, or denied with feedback.
_Avoid_: Plan response, plan result, plan answer.

**ApprovedPlanBreakdown**:
The deterministic decomposition of an approved Plan's markdown into docs, prototype/boilerplate Artifacts, SuccessCriteria, TaskDrafts, and dependency edges.
_Avoid_: Plan expansion, plan explosion, decomposition.

**TaskDraft**:
A pre-materialization task derived from a Plan, keyed by a `clientKey` so dependency edges resolve before persisted task IDs exist.
_Avoid_: Pending task, candidate task, task stub.

**SuccessCriterion**:
A single acceptance bullet attached to either the Plan as a whole or one TaskDraft (`scope: "plan" | "task"`).
_Avoid_: Acceptance criterion (the generic term), DoD, completion check.

**Artifact (planning)**:
A `prototype` or `boilerplate` file path declared in an approved Plan that will be materialized as a workflow-coordination Artifact during breakdown.
_Avoid_: Asset, attachment, output (those mean other things in workflow-coordination).

**Annotation**:
A line-scoped or file-scoped review note on a diff, optionally carrying a Conventional Comments label, decoration, and a suggested code block.
_Avoid_: Comment, remark, finding (we reserve "comment" for the rendered output sent to the PR host).

**ReviewWorkbench**:
The interactive surface that loads a diff plus its Annotations and produces feedback markdown, GitHub-shaped fileComments, and orphan groupings.
_Avoid_: Review UI, code review tool, diff viewer.

**FinalQaReport**:
The aggregate verdict over a project's tasks, runs, and artifacts that gates the handoff to UAT or code review.
_Avoid_: QA result, project status, release report.

**UatCodeReviewHandoff**:
The prompt + decision options presented after a passing FinalQaReport, offering UAT, code review, change requests, or auto-approval.
_Avoid_: Handover, approval gate.

**WorkflowMode**:
The runtime policy controlling who may call `submit_plan` — `manual`, `user-managed`, `plan-agent`, or `all-agents`.
_Avoid_: Plan mode (overloaded with editor "plan mode"), review mode.

## Relationships

- A **Plan** is wrapped by exactly one **PlanSubmission**, which yields one **PlanDecision**.
- An approved **Plan** produces one **ApprovedPlanBreakdown** containing many **TaskDraft**s, many planning **Artifact**s, and many **SuccessCriterion**s.
- A **TaskDraft** carries zero or more **SuccessCriterion**s (`scope: "task"`); the **Plan** itself carries the `scope: "plan"` criteria.
- A **TaskDraft** has zero or more `blockedByClientKeys` referencing other **TaskDraft**s in the same breakdown.
- A **ReviewWorkbench** session holds one diff (many files) plus many **Annotation**s; it emits one feedback markdown and one or more PR-shaped submission targets.
- A passing **FinalQaReport** produces exactly one **UatCodeReviewHandoff**; the user's choice on the handoff produces a new feedback run, an E2E regression artifact, or an approval event.
- **WorkflowMode** gates whether a given agent's `submit_plan` call is accepted or rejected with a redirect message.

## Example dialogue

> **Dev:** "When the user approves a **Plan** with notes, do we materialize the **TaskDraft**s immediately?"
> **Domain expert:** "No — the **PlanDecision** carries the feedback back to the submitting agent. Materialization runs separately via the breakdown command, which is when **TaskDraft**s and planning **Artifact**s become real tasks and workflow-coordination artifacts."
> **Dev:** "And the **Annotation**s on the resulting PR live where?"
> **Domain expert:** "Inside the **ReviewWorkbench** session. They're not entities here yet — the workbench renders them into GitHub fileComments and a feedback markdown blob that the integration-hub posts."

## Flagged ambiguities

- **Plan vs Prototype vs Spec** — _Plan_ is the markdown submitted via `submit_plan` for approval. _Prototype_ (and _boilerplate_) are file-path entries inside an approved Plan's `## Artifacts` section. _Spec_ is the knowledge-workspace doc type used when persisting an approved Plan as a doc; planning-review never uses "spec" as a synonym for Plan.
- **ReviewRequest vs PullRequest** — planning-review has no `ReviewRequest` entity. A code review is driven by a **ReviewWorkbench** session over a diff; submission targets are real upstream **PullRequest**s (owned by integration-hub). Do not say "ReviewRequest" for the workbench session.
- **Annotation vs ReviewComment** — _Annotation_ is the in-workbench finding (line- or file-scoped, may carry a suggestion). _ReviewComment_ is the rendered PR-host comment produced from an Annotation at submission time. They are not interchangeable.
- **Approval vs PlanDecision vs UatCodeReviewDecision** — three distinct decision points: the Plan-level user verdict (**PlanDecision**), the post-QA handoff decision (**UatCodeReviewDecision** with values `start_uat | start_code_review | request_changes | approve_without_manual_review`), and the FinalQa pass/fail. Reserve "Approval" for the post-QA path and never for the Plan stage.
- **SuccessCriterion scope** — `scope: "plan"` criteria belong to the Plan as a whole; `scope: "task"` criteria belong to a single TaskDraft via `taskClientKey`. A criterion is never shared across tasks.
- **WorkflowMode `plan-agent` vs editor "plan mode"** — `plan-agent` is the policy here (only the `plan` agent may call `submit_plan`). OpenCode's editor "plan mode" is a separate concept inside that runtime and is not owned by this service.
- **No owned entities (yet)** — per CONTEXT-MAP, this service runs workflows over entities owned elsewhere: tasks (work-management), docs (knowledge-workspace), artifacts/audit (workflow-coordination), events (platform-core). Adding a persisted Plan or ReviewSession entity here requires a new ADR and a CONTEXT-MAP update.
