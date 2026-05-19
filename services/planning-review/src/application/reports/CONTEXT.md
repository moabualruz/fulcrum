# Reports

Post-execution report and handoff workflows for a project: assembling the **FinalQaReport**, gating it through the automated feedback loop, prompting the user for UAT or code review, recording the decision, applying tenant-configured auto-decisions, and running accepted generated UAT E2E regression suites.

## Language

**FinalQaCheck**:
A single per-task verdict line (latest review verdict, run status, artifact presence) rolled up into the FinalQaReport.
_Avoid_: QA item, status row.

**FinalQaNextAction**:
The instruction emitted by the report telling the caller what to do next (`continue_automated_feedback`, `prompt_user_for_uat_code_review`, `manual_review_required`).
_Avoid_: Recommendation, hint, next step.

**FinalQaFeedbackGate**:
The pass that runs the FinalQaReport, optionally invokes the automated feedback loop, and re-runs the report before user handoff.
_Avoid_: Auto-fix pass, retry loop.

**UatCodeReviewSession**:
A per-task review work item (UAT or code) generated for the user when the FinalQaReport is ready.
_Avoid_: Review ticket, QA task.

**UatCodeReviewFeedbackRun**:
The agent run dispatched when the user picks `request_changes` on the handoff.
_Avoid_: Rework run, fix run.

**UatCodeReviewAutoDecisionConfig**:
The tenant setting (`reports.uatCodeReviewAutoDecision`) that decides the handoff for the user without prompting.
_Avoid_: Auto-approve flag, policy toggle.

**GeneratedE2eRegressionRunner**:
The runtime selected to execute accepted generated UAT E2E specs (`bun`, `node`, `playwright`).
_Avoid_: Test runner (ambiguous), executor.

**GeneratedE2eRunnerPlan**:
The resolved command, cwd, CI command, and CI env for a chosen runner over a materialized set of generated E2E spec files.
_Avoid_: Run config, exec plan.

## Relationships

- A **FinalQaReport** is composed of many **FinalQaCheck**s and exactly one **FinalQaNextAction**.
- A **FinalQaFeedbackGate** wraps one initial **FinalQaReport**, zero-or-one automated feedback loop, and one final **FinalQaReport**.
- A passing **FinalQaReport** seeds many **UatCodeReviewSession**s inside the **UatCodeReviewHandoff**.
- A `request_changes` **UatCodeReviewDecision** produces one **UatCodeReviewFeedbackRun** per affected task.
- A **UatCodeReviewAutoDecisionConfig** drives at most one **UatCodeReviewDecision** per handoff, bypassing the user prompt.
- A **GeneratedE2eRegressionRunner** plus accepted generated E2E artifacts yields one **GeneratedE2eRunnerPlan** and one regression run output.

## Example dialogue

> **Dev:** "If the **FinalQaFeedbackGate** fixes everything on the second pass, do we still prompt the user?"
> **Domain expert:** "Yes — the gate only short-circuits the automated loop. A `passed` **FinalQaReport** still hands off to the **UatCodeReviewHandoff**, unless a **UatCodeReviewAutoDecisionConfig** is enabled for the tenant."

## Flagged ambiguities

- **FinalQaNextAction vs UatCodeReviewDecision** — `nextAction` is what the system tells the caller to do; `decision` is what the user (or auto-config) picks on the handoff. Don't conflate.
- **GeneratedE2eRegressionRunner vs runner string** — the domain enum is the canonical name; the CLI/HTTP layers may accept a raw string but must normalize before reaching these actions.
- **UatCodeReviewAutoDecisionConfig vs WorkflowMode** — auto-decision config governs the post-QA handoff only; **WorkflowMode** governs `submit_plan` at the planning stage and is unrelated here.
