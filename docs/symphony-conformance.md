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
