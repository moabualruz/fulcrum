---
Status: implemented
ImplRuntime: claude
Triage: AFK
Pillar: 04-sandcastle-wrapper
Blocked-by: 10-iteration-loop-hard-cap
---

# Token budget tracking (gated) + session resumption on retry (gated)

## Parent: PRD `prds/04-sandcastle-wrapper.md`

## What to build (end-to-end)

Implement two gated features that extend the iteration loop. (1) **Token tracking** (`FULCRUM_FEATURES=token-tracking`): per-profile `tokenCountPattern` regex parses stdout lines for token counts; accumulates across all turns; enforces `FULCRUM_MAX_TOKENS_PER_RUN` cap; writes `agent_runs.token_used` to DB; NULL when flag off. (2) **Session resumption** (`FULCRUM_FEATURES=session-resume`, claude-code profile only): on retry, look up the prior run's `transcript_path`, pass it to Sandcastle `resumeSession`; cold-start fallback when flag off or prior transcript absent.

## Acceptance criteria

- [ ] Adapter / profile: `tokenCountPattern` field added to `AgentProfile` type; `claude-code.ts` profile sets a pattern matching Claude's token-usage stdout format.
- [ ] Lifecycle integration: when `token-tracking` flag on — token parser active per turn; `token_used` written to DB; when cap exceeded, `exitReason: 'token_cap'` set; when flag off, `token_used` remains NULL.
- [ ] Lifecycle integration: when `session-resume` flag on and retry run found — prior `transcript_path` passed to `sandcastle.resumeSession()`; when flag off or no prior transcript — cold start with no error.
- [ ] Surfaces parity: `fulcrum runs show <id> --json` includes `token_used` (null if not tracked); web run detail Summary tab shows token usage when available; TUI run overlay shows same.
- [ ] Tests: token-tracking test — stub agent stdout includes a known token-count line; assert `token_used` written correctly; cap-exceeded test → `exitReason: 'token_cap'`. Session-resume test — mock `sandcastle.resumeSession` called with correct JSONL path on retry; cold-start called when flag off.

## Blocked by

10-iteration-loop-hard-cap

## Notes

`tokenCountPattern` for `claude-code` likely parses a line like `Tokens used: 1234 input, 567 output` — verify against actual Claude CLI output before hardcoding. If Claude CLI doesn't emit token counts to stdout, document that `token_used` will remain NULL for that profile unless/until the CLI adds the output. Session resumption is claude-code only in this slice; other profiles can add `tokenCountPattern` and `resumeSession` support via profile-file additions without PRD change.
