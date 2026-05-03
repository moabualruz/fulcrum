# Symphony SPEC Conformance Trace

Maps OpenAI Symphony SPEC sections to Fulcrum implementation files.

## Sync

### Daily Job

| SPEC Section | Implementation | Notes |
|---|---|---|
| Submodule pin | `src/cli/symphony/sync.ts` — `updateSubmodule()` | `git submodule update --remote vendor/openai-symphony` |
| SPEC hash lock | `src/cli/symphony/sync.ts` — `computeSpecHash()`, `readLockHash()`, `writeLockHash()` | SHA-256 of `SPEC.md` stored in `.symphony-spec.lock` |
| Drift detection | `src/cli/symphony/sync.ts` — `detectDrift()` | Compares current hash vs lock; writes report on mismatch |
| Drift report | `src/cli/symphony/sync.ts` — `writeDriftReport()` | Written to `.fulcrum/reports/symphony-drift-<date>.md` |
| Conformance run | `src/cli/symphony/sync.ts` — `runConformanceSuite()` | Delegates to P3#14 conformance test suite |
| LLM narration | `src/cli/symphony/sync.ts` — `appendLlmNarration()` | Gated: `FULCRUM_FEATURES=router-llm` |
| Daily cron | `src/cli/symphony/sync.ts` — `DAILY_SYNC_JOB` | `symphony:daily-sync` at `0 4 * * *` |
| CLI surface | `src/cli/symphony/sync.ts` — `run()` | `fulcrum symphony sync [--daily] [--json]` |

## Connector Adapter

### Linear connector (optional, gated)

| SPEC Section | Implementation | Notes |
|---|---|---|
| Tracker adapter interface | `src/orchestration/symphony/tracker-adapter.ts` | Shared `TrackerAdapter` interface for Fulcrum-native and connector adapters |
| Linear tracker adapter | `src/orchestration/symphony/linear-tracker.ts` | `createLinearTrackerAdapter()` — wraps `LinearConnector`; gated `FULCRUM_FEATURES=connector-linear` |
| fetchCandidateIssues | `src/orchestration/symphony/linear-tracker.ts` — `fetchCandidateIssues()` | Maps Linear issues (unstarted/backlog) to `CandidateIssue` shape |
| fetchIssuesByStates | `src/orchestration/symphony/linear-tracker.ts` — `fetchIssuesByStates()` | Delegates run-state queries to Fulcrum-native tracker (Linear doesn't track runs) |
| Bidirectional sync | `src/orchestration/symphony/linear-tracker.ts` — `sync()`, `pushStateChange()` | Pull: Linear → tasks rows; Push: task state → Linear issue update |
| Conflict resolution | `src/orchestration/symphony/linear-tracker.ts` — `resolveConflict()` | Last-write-wins with `updatedAt` comparison; conflict row written to events |
| CLI surface | `src/cli/commands/symphony.ts` — `runConnector()` | `fulcrum symphony connector linear sync [--json]` |
| Web surface | `src/web/src/routes/settings/integrations/linear/` | `/settings/integrations/linear` — API key input, team selection, sync status |
| TUI surface | `src/tui/screens/orchestrator-pane.ts` — `connectorLinearStatusLine()` | Integration status line in orchestration pane |
