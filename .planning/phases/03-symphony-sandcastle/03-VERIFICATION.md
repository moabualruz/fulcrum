---
phase: 03-symphony-sandcastle
verified: 2026-05-05T01:00:00Z
status: gaps_found
score: 30/33 must-haves verified
overrides_applied: 0
gaps:
  - truth: "All 4 lifecycle hooks (after_create, before_run, after_run, before_remove) with timeout config"
    status: failed
    reason: "hooks.ts LifecycleHookName type defines before_run | after_run | before_remove | on_failure | on_cancel — after_create is absent from the type and from dispatchLifecycleHook dispatch logic. after_create appears only as a string field in workflow-runtime.ts WorkflowHooksSchema but is never dispatched by the hooks engine."
    artifacts:
      - path: "src/orchestration/symphony/hooks.ts"
        issue: "LifecycleHookName union missing after_create; only before_run | after_run | before_remove | on_failure | on_cancel defined"
      - path: "src/orchestration/symphony/workflow-runtime.ts"
        issue: "WorkflowHooksSchema declares after_create: z.string().optional() but no downstream dispatch caller"
    missing:
      - "Add after_create to LifecycleHookName type in hooks.ts"
      - "Dispatch after_create hook in createWorkspace or dispatch.ts when created_now=true (per SPEC §10.3)"
      - "Add conformance test asserting after_create is called only on new workspace creation"

  - truth: "Workspace safety: cwd == workspace_path enforced before agent launch, path inside root, key sanitized [A-Za-z0-9._-]"
    status: partial
    reason: "Key sanitization ([A-Za-z0-9._-]) is implemented and tested. app-server-client sets cwd=workspacePath correctly. assertWorkspacePathInOrgRoot exists in workspace.ts but is only called inside destroyWorkspace — NOT called before agent launch in createWorkspace or dispatchCandidate. The pre-launch path-inside-root guard required by SPEC §10.2 (cwd == workspace_path enforced before agent launch) is absent."
    artifacts:
      - path: "src/orchestration/symphony/workspace.ts"
        issue: "assertWorkspacePathInOrgRoot only called in destroyWorkspace (line 120), not in createWorkspace or before agent launch"
      - path: "src/orchestration/symphony/dispatch.ts"
        issue: "dispatchCandidate calls createWorkspace then dispatchToRunner with no path-inside-root assertion between them"
    missing:
      - "Call assertWorkspacePathInOrgRoot (or equivalent) in createWorkspace after computing workspacePath, before mkdir"
      - "Add conformance test: workspace path outside org root throws before agent launch"
---

# Phase 03: Symphony + Sandcastle Verification Report

**Phase Goal:** Symphony orchestrator + Sandcastle run contract — workflow runtime, native tracker, orchestrator lifecycle, Codex JSONL client, sandbox providers, HTTP API, CLI/TUI/Web dispatch parity
**Verified:** 2026-05-05T01:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Explicit workflowPath wins over cwd WORKFLOW.md default (SYM-01) | VERIFIED | `workflow-runtime.ts` loadWorkflowRuntime; 3 conformance tests pass |
| 2 | Missing/invalid WORKFLOW.md throws WorkflowNotFoundError (SYM-02) | VERIFIED | WorkflowNotFoundError in workflow-runtime.ts; tests pass |
| 3 | Typed config with $VAR/~ expansion (SYM-03) | VERIFIED | WorkflowConfigError on missing var; tests pass |
| 4 | Invalid reload keeps last good config (SYM-04) | VERIFIED | createWorkflowRuntimeReloader with lastGood pattern; tests pass |
| 5 | Native tracker strict 12-field Issue model (SYM-05) | VERIFIED | SymphonyIssueSchema in schemas.ts; all 12 fields confirmed |
| 6 | External trackers ingest-only (SYM-06) | VERIFIED | linear-tracker.ts INGEST-ONLY comment; conformance tests assert no dispatch |
| 7 | Poll tick sequence reconcile→validate→fetch→sort→dispatch→notify (SYM-07) | VERIFIED | dispatch.ts exports reconcileRunningIssues, validateRuntimeConfig; tests pass |
| 8 | Issue orchestration states Unclaimed→Claimed→Running/RetryQueued→Released (SYM-08) | VERIFIED | State machine in dispatch.ts; conformance tests cover transitions |
| 9 | Run-attempt lifecycle states PreparingWorkspace→terminal (SYM-09) | VERIFIED | ATTEMPT_LIFECYCLE_STATES in states.ts; AgentRun.attemptLifecycleState; migration confirmed |
| 10 | Continuation retry at 1000ms fixed delay (SYM-10) | VERIFIED | scheduleContinuationRetry in retry.ts; conformance test asserts nextRetryAt == now+1000ms |
| 11 | Failure retry exponential formula min(10000*2^(attempt-1), cap) (SYM-11) | VERIFIED | calcRetryDelay + scheduleRetry in retry.ts; conformance test asserts [10000,20000,80000,300000] |
| 12 | Workspace safety: cwd==workspace_path before launch, path inside root, key sanitized (SYM-12) | PARTIAL | sanitizeWorkspaceKey and key sanitization work; cwd set via workspacePath in app-server-client; BUT assertWorkspacePathInOrgRoot not called before launch — only on destroy |
| 13 | All 4 lifecycle hooks after_create/before_run/after_run/before_remove with timeout (SYM-13) | FAILED | hooks.ts LifecycleHookName missing after_create; dispatch.ts never calls after_create; SPEC §10.3 requires it on new workspace creation |
| 14 | Strict prompt rendering unknown variables fail (SYM-14) | VERIFIED | UnknownVariableError via strict Liquid renderer; tests pass |
| 15 | Candidate sorting priority asc→created_at oldest→identifier lexicographic (SYM-15) | VERIFIED | fetchSymphonyIssues sorts correctly; conformance tests pass |
| 16 | Blocker rule: Todo state with non-terminal blockers = ineligible (SYM-16) | VERIFIED | tracker.ts filters based on blocker terminal status; tests pass |
| 17 | Per-state concurrency limits via max_concurrent_agents_by_state (SYM-17) | VERIFIED | resolvePerStateConcurrency in tracker.ts; conformance tests pass |
| 18 | Reconciliation per-tick: terminal→stop+cleanup, non-active→stop, active→snapshot (SYM-18) | VERIFIED | reconcileRunningIssues in dispatch.ts with injected callbacks; 3 conformance tests |
| 19 | Startup terminal workspace cleanup sweep (SYM-19) | VERIFIED | sweepTerminalWorkspaces in workspace.ts; conformance tests assert beforeRemove called |
| 20 | Codex app-server JSONL client with session startup, timeouts, thread/turn extraction (SYM-20) | VERIFIED | CodexAppServerClient in app-server-client.ts; 27 client tests pass |
| 21 | Codex launch command config codex.command default "codex app-server" (SYM-21) | VERIFIED | workflow-runtime.ts defaults; conformance test asserts "codex app-server" |
| 22 | Structured logs with issue_id, issue_identifier, session_id on every entry (SYM-22) | VERIFIED | logSymphonyEvent in telemetry.ts with session_id; tests pass |
| 23 | Token accounting cumulative from thread/tokenUsage/updated, keyed by thread_id (SYM-23) | VERIFIED | TokenUsageAggregator in token-tracking.ts; updateCumulative replaces not adds |
| 24 | Conformance tests pass for §17.1-17.7 (SYM-24) | VERIFIED | 80 conformance tests pass per 03-06-SUMMARY |
| 25 | HTTP server extension at all 4 endpoints (SYM-25) | VERIFIED | http-server.ts binds 127.0.0.1; routes GET /, GET /api/v1/state, GET /api/v1/:issue, POST /api/v1/refresh |
| 26 | Approval/sandbox posture documented (SYM-26) | VERIFIED | docs/symphony-conformance.md contains approval/sandbox section; D-09 implemented |
| 27 | Run-attempt lifecycle states implemented (SYM-27) | VERIFIED | Same as truth #9; entity + migration + states confirmed |
| 28 | noSandbox default with trust-boundary warning; AgentRun row created end-to-end (SND-01) | VERIFIED | sandbox-runner.ts; FULCRUM TRUST BOUNDARY in tests; 33 sandbox-runner tests pass |
| 29 | Artifact harvest via configured glob produces Artifact entities (SND-02) | VERIFIED | artifact-harvest-hook.ts; DEFAULT_ARTIFACT_GLOB; 8 harvest tests pass |
| 30 | Adapter-swap test: same AgentRunRequest/Result shape across providers (SND-03) | VERIFIED | resolveAgentRunConfig in resolve-agent-run-config.ts; adapter-swap tests for 5 agents |
| 31 | Doctor warns if Docker absent when sandbox-docker flag enabled (SND-04) | VERIFIED | doctor page server sandboxProviderDoctorChecks; sandbox-docker test |
| 32 | Session JSONL capture and resumeSession (SND-05) | VERIFIED | session-resume.ts exposes resumeVia: thread/resume | transcript-path | unsupported |
| 33 | Web + CLI + TUI can all dispatch agent runs through canonical tRPC path (SND-06) | VERIFIED | dispatchRun in orchestration.ts; CLI symphony.ts runs dispatch; TUI dispatch(); Web +page.server.ts action |

**Score:** 31/33 truths verified (SYM-12 partial, SYM-13 failed)

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/orchestration/symphony/workflow-runtime.ts` | VERIFIED | loadWorkflowRuntime, createWorkflowRuntimeReloader, all 3 error types |
| `src/orchestration/symphony/schemas.ts` | VERIFIED | SymphonyIssueSchema, BlockedByRefSchema exported |
| `src/orchestration/symphony/tracker.ts` | VERIFIED | TrackerBlockerResolutionError, refreshRunningIssues, resolvePerStateConcurrency |
| `src/orchestration/symphony/dispatch.ts` | VERIFIED | reconcileRunningIssues, validateRuntimeConfig, dispatchCandidate sequence |
| `src/orchestration/symphony/retry.ts` | VERIFIED | scheduleContinuationRetry, scheduleRetry, calcRetryDelay |
| `src/orchestration/symphony/stall.ts` | VERIFIED | scanForStalledRuns with lastCodexTimestamp override |
| `src/orchestration/symphony/workspace.ts` | PARTIAL | sanitizeWorkspaceKey, createWorkspace, sweepTerminalWorkspaces — but assertWorkspacePathInOrgRoot not called pre-launch |
| `src/orchestration/symphony/hooks.ts` | PARTIAL | before_run/after_run/before_remove/on_failure/on_cancel — after_create MISSING from type and dispatch |
| `src/orchestration/symphony/app-server-protocol.ts` | VERIFIED | parseMessage, thread/tokenUsage/updated, all protocol schemas |
| `src/orchestration/symphony/app-server-client.ts` | VERIFIED | CodexAppServerClient, bash -lc spawn, thread/start, thread/resume |
| `src/orchestration/symphony/http-server.ts` | VERIFIED | 127.0.0.1 default, /api/v1/state, /api/v1/refresh |
| `src/orchestration/symphony/telemetry.ts` | VERIFIED | logSymphonyEvent with session_id |
| `src/orchestration/token-tracking.ts` | VERIFIED | TokenUsageAggregator exported |
| `src/agents/resolve-agent-run-config.ts` | VERIFIED | resolveAgentRunConfig merges WORKFLOW.md over profile |
| `src/orchestration/sandbox-runner.ts` | VERIFIED | DEFAULT_ARTIFACT_GLOB, SandboxProviderUnavailableError |
| `src/orchestration/session-resume.ts` | VERIFIED | resumeVia + capability fields; unsupported branch |
| `src/trpc/routers/orchestration.ts` | VERIFIED | dispatchRun with permissionedProcedure |
| `src/cli/symphony.ts` | VERIFIED | runs dispatch subcommand with --json |
| `src/tui/screens/orchestration.ts` | VERIFIED | dispatch() method via caller abstraction |
| `src/web/src/routes/orchestration/+page.server.ts` | VERIFIED | dispatch action calls tRPC dispatchRun |
| `src/db/entities/orchestration/AgentRun.ts` | VERIFIED | attemptLifecycleState, lastCodexTimestamp, threadId fields |
| `src/orchestration/__tests__/symphony-conformance.test.ts` | VERIFIED | 80 tests covering §17.1-17.7 |
| `docs/symphony-conformance.md` | VERIFIED | Generated; contains workflow path selection, reload, approval/sandbox posture |
| `scripts/ci.ts` | VERIFIED | symphony:conformance stage present |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `dispatch.ts dispatchCandidate` | `app-server-client.ts` | dispatchToRunner injected dep | VERIFIED |
| `dispatch.ts` | `tracker.ts fetchCandidateIssues` | fetchAndSortCandidates | VERIFIED |
| `tRPC dispatchRun` | `AgentRun entity` | MikroORM EM | VERIFIED |
| `CLI symphony.ts` | `tRPC dispatchRun` | SymphonyCaller.dispatchRun | VERIFIED |
| `TUI orchestration.ts` | `tRPC dispatchRun` | caller.orchestration.dispatch | VERIFIED |
| `Web +page.server.ts` | `tRPC dispatchRun` | caller.orchestration.dispatchRun | VERIFIED |
| `http-server.ts` | `createHttpApiRoutes` | product-kernel/symphony/http-api.ts | VERIFIED |
| `hooks.ts dispatchLifecycleHook` | `after_create hook` | LifecycleHookName | FAILED — after_create not in type |
| `workspace.ts createWorkspace` | `assertWorkspacePathInOrgRoot` | pre-launch path check | FAILED — only called in destroyWorkspace |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `tracker.ts fetchCandidateIssues` | SymphonyIssue[] | DB via MikroORM task query + blocker batch | Yes | FLOWING |
| `token-tracking.ts TokenUsageAggregator` | cumulativeByThread Map | thread/tokenUsage/updated events from app-server | Yes (replace semantics) | FLOWING |
| `http-server.ts GET /api/v1/state` | state JSON | getState() callback injected by caller | Yes (callback-based) | FLOWING |
| `AgentRun lastCodexTimestamp` | lastCodexTimestamp | updated on each app-server event | Yes | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED — requires running server/real Codex binary. No runnable entry points testable without external deps.

### Requirements Coverage

| Requirement | Plan | Status | Evidence |
|-------------|------|--------|----------|
| SYM-01 | 03-01 | SATISFIED | loadWorkflowRuntime; explicit path wins |
| SYM-02 | 03-01 | SATISFIED | WorkflowNotFoundError thrown |
| SYM-03 | 03-01 | SATISFIED | $VAR/~ expansion + WorkflowConfigError |
| SYM-04 | 03-01 | SATISFIED | createWorkflowRuntimeReloader lastGood |
| SYM-05 | 03-02 | SATISFIED | SymphonyIssueSchema 12 fields |
| SYM-06 | 03-02 | SATISFIED | ingest-only posture enforced |
| SYM-07 | 03-03 | SATISFIED | tick sequence exported functions |
| SYM-08 | 03-02/03 | SATISFIED | state machine with compare-and-swap |
| SYM-09 | 03-03 | SATISFIED | AttemptLifecycleState + entity field |
| SYM-10 | 03-03 | SATISFIED | scheduleContinuationRetry 1000ms |
| SYM-11 | 03-03 | SATISFIED | calcRetryDelay exponential formula verified |
| SYM-12 | 03-03 | PARTIAL | Key sanitized, cwd set — pre-launch path-inside-root assertion missing |
| SYM-13 | 03-03 | BLOCKED | after_create not in LifecycleHookName; not dispatched on workspace creation |
| SYM-14 | 03-01 | SATISFIED | strict Liquid renderer UnknownVariableError |
| SYM-15 | 03-02 | SATISFIED | fetchSymphonyIssues sort order |
| SYM-16 | 03-02 | SATISFIED | blocker terminal check |
| SYM-17 | 03-02 | SATISFIED | resolvePerStateConcurrency |
| SYM-18 | 03-03 | SATISFIED | reconcileRunningIssues 3-branch |
| SYM-19 | 03-03 | SATISFIED | sweepTerminalWorkspaces |
| SYM-20 | 03-04 | SATISFIED | CodexAppServerClient JSONL |
| SYM-21 | 03-01/04 | SATISFIED | codex app-server default |
| SYM-22 | 03-04 | SATISFIED | logSymphonyEvent with session_id |
| SYM-23 | 03-04/05 | SATISFIED | TokenUsageAggregator replace-not-add |
| SYM-24 | 03-01..06 | SATISFIED | 80 conformance tests green |
| SYM-25 | 03-06 | SATISFIED | http-server.ts 4 routes |
| SYM-26 | 03-01 | SATISFIED | approval/sandbox posture documented |
| SYM-27 | 03-03 | SATISFIED | lifecycle states + migration |
| SND-01 | 03-05 | SATISFIED | noSandbox dispatch + AgentRun row |
| SND-02 | 03-05 | SATISFIED | artifact glob harvest + entity |
| SND-03 | 03-05 | SATISFIED | adapter-swap 5-agent test |
| SND-04 | 03-05 | SATISFIED | doctor sandbox-docker check |
| SND-05 | 03-05 | SATISFIED | session-resume capability state |
| SND-06 | 03-06 | SATISFIED | Web+CLI+TUI canonical dispatch |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `src/orchestration/symphony/workflow-runtime.ts:78` | `after_create: z.string().optional()` declared in schema but no downstream hook dispatch | WARNING | after_create silently no-ops at runtime; schema creates false expectation |
| REQUIREMENTS.md lines 82-86,92 | 6 requirements marked `[ ]` unchecked despite implementation existing (SYM-09,10,11,12,13,19) | INFO | Stale checkbox state; SYM-09/10/11/19 are actually implemented and tested; SYM-12/13 are real gaps |

### Human Verification Required

None — all checkable items verified programmatically.

### Gaps Summary

Two blockers prevent full SYM-01..27 conformance:

**BLOCKER 1 — SYM-13: after_create hook not implemented.**
The SPEC §10.3 requires after_create to run only on new workspace creation (created_now=true). The workflow-runtime schema accepts the config field but `hooks.ts` LifecycleHookName type excludes after_create entirely — it cannot be dispatched. Fix: add after_create to LifecycleHookName, call it from dispatch flow after createWorkspace when workspace was newly created.

**BLOCKER 2 — SYM-12: Pre-launch path-inside-root assertion absent.**
SPEC §10.2 requires cwd==workspace_path enforced BEFORE agent launch and path must be inside org root. `assertWorkspacePathInOrgRoot` exists but is only called in destroyWorkspace. createWorkspace computes the path inside orgRoot by construction but never asserts it. Fix: call assertWorkspacePathInOrgRoot inside createWorkspace after computing workspacePath, before mkdir; add conformance test for out-of-root path rejection.

**Note on REQUIREMENTS.md checkbox state:** SYM-09, SYM-10, SYM-11, and SYM-19 are marked `[ ]` in REQUIREMENTS.md but implementations and tests are fully present and passing. These checkboxes appear to be stale documentation rather than implementation gaps. The actual implementation gaps are only SYM-12 and SYM-13.

---

_Verified: 2026-05-05T01:00:00Z_
_Verifier: Claude (gsd-verifier)_
