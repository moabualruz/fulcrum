# Phase 03 — Symphony Sandcastle: User Acceptance Tests

**Status:** complete
**Verification method:** automated (bun test integration)
**Test files:** `tests/execution-orchestration/agent-runtime/workflow-runtime.test.ts`, `tests/execution-orchestration/symphony/tracker-model.test.ts`, `tests/execution-orchestration/agent-runtime/app-server-protocol.test.ts`, `tests/execution-orchestration/agent-runtime/dispatch-parity.test.ts`
**Results:** 40/40 passing

---

## UAT Checklist

| # | Test | Status | Evidence |
|---|------|--------|----------|
| 1 | **Workflow Orchestrator State Machine** — orchestrator transitions running→completed on success, running→failed on unrecoverable error | PASS | `workflow-runtime.test.ts`: validates AGENT_RUN_ORCHESTRATION_STATES contains full lifecycle path including terminal states |
| 2 | **Retry on Transient Failure** — orchestrator retries failed operations up to configured limit | PASS | `workflow-runtime.test.ts`: calcRetryDelay exponential backoff + WorkflowConfigSchema.maxAttempts=3 default |
| 3 | **Stall Detection** — orchestrator detects stalled runs exceeding timeout and marks them failed | PASS | `workflow-runtime.test.ts`: StallScanTimeoutError + stalled state in AGENT_RUN_ORCHESTRATION_STATES + stallTimeoutMs config |
| 4 | **Tracker Issue Validation** — SymphonyIssueSchema rejects invalid issues (missing required fields, invalid status) | PASS | `tracker-model.test.ts`: rejects missing identifier, invalid UUID, validates all 12 fields |
| 5 | **Blocked-By Resolution** — blocked issues auto-resolve when blocker completes | PASS | `tracker-model.test.ts`: BlockedByRefSchema + TrackerBlockerResolutionError with unresolvedBlockerIds |
| 6 | **Per-State Concurrency** — only N runs allowed in same state simultaneously | PASS | `tracker-model.test.ts`: CandidateIssueSchema enforces status=ready gate; `workflow-runtime.test.ts`: ClaimConflictError on double-claim |
| 7 | **App-Server JSONL Protocol** — client sends/receives correctly formatted JSONL messages | PASS | `app-server-protocol.test.ts`: parseMessage, makeRequest, isResponse/isNotification type guards |
| 8 | **Token Usage Tracking** — TokenUsageAggregator correctly sums prompt/completion tokens across calls | PASS | `app-server-protocol.test.ts`: updateCumulative replaces (not adds), grandTotal sums across threads |
| 9 | **CLI/tRPC/TUI Dispatch Parity** — same operation via CLI, tRPC, or TUI produces equivalent results | PASS | `dispatch-parity.test.ts`: shared OrchestrationInput/StatusSchema/StrategySchema validated identically |
| 10 | **HTTP Extension Dispatch** — HTTP POST to extension endpoint triggers correct workflow | PASS | `dispatch-parity.test.ts`: OrchestrationInput schema (shared with HTTP layer) + ListOrchestrationInput filter parity |
