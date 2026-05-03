---
Status: in-progress
Triage: AFK
Pillar: 04-sandcastle-wrapper
Blocked-by: 05-agent-profile-type-registry
---

# sandbox-runner.ts noSandbox happy path + worktree lifecycle

## Parent: PRD `prds/04-sandcastle-wrapper.md`

## What to build (end-to-end)

Implement the core `runAgent()` function in `src/orchestration/sandbox-runner.ts`. This is the always-on noSandbox path: `createWorktree()` per run → Sandcastle `sandcastle.run({ sandbox: noSandbox(), agent: ... })` → capture `AgentRunResult` → teardown worktree. Input signature: `(worktree, agentProfile, prompt, contextBundle, timeout, opts)`. Output: `{ transcript, exitCode, filesChanged, artifacts, durationMs, iterationCount, tokenUsed? }`. A trust-boundary warning must be logged whenever `noSandbox()` is used. Verify with a smoke test against an `echo` CLI stub.

## Acceptance criteria

- [ ] Adapter / profile: `src/orchestration/sandbox-runner.ts` exports `runAgent(req: AgentRunRequest): Promise<AgentRunResult>`; `AgentRunRequest` and `AgentRunResult` types exported from `src/orchestration/types.ts`.
- [ ] Lifecycle integration: `createWorktree()` called at run start; worktree torn down in `finally` block on success; `FULCRUM_KEEP_WORKTREE_ON_FAILURE=1` preserves worktree on error.
- [ ] Lifecycle integration: `logger.warn(TRUST_BOUNDARY_WARNING)` emitted before every `noSandbox()` invocation; semgrep rule blocks `noSandbox()` call without adjacent warning in CI.
- [ ] Surfaces parity: `sandbox_mode: 'host'` written to `agent_runs` DB row after run; `exitCode`, `durationMs` written.
- [ ] Tests: unit test with stub agent (`echo "COMPLETE"`) — asserts `AgentRunResult` shape returned; `exitCode: 0`; trust-boundary warning emitted; worktree torn down after run; worktree preserved when `FULCRUM_KEEP_WORKTREE_ON_FAILURE=1` and run throws.

## Blocked by

05-agent-profile-type-registry

## Notes

Effect imports are allowed in this file (it is inside `src/orchestration/`). No Effect imports may leak into files outside this boundary. The Sandcastle `before_run` / `after_run` Symphony integration (context bundle in, transcript/artifacts out) is handled in slice 10 — this slice only establishes the base adapter shape.
