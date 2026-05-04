---
Status: completed
Triage: AFK
Pillar: 08-memory-context-engine
Blocked-by: [08-context-bundle-assembler.md]
PRD: .scratch/agent-os-vision/prds/08-memory-context-engine.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 8 section)
Decisions: [Q18, C1]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Context engine row)
Docs: PRD §Out-of-scope — Pillar 3 owns before_run invocation; PRD §Context bundle assembler; cross-ref Pillar 3 (Symphony Orchestration)
---

## What to build

Wire `ContextAssembler.assemble()` into Symphony's `before_run` hook so the context bundle is injected into every agent run's workspace before the agent starts. This pillar implements the hook handler; Pillar 3 calls it.

`src/memory/hooks/before-run-hook.ts` exports `@Injectable() BeforeRunContextHook` with `handle(runId, taskId, agentType, ctx): Promise<ContextBundle>`. Symphony's `workspace.ts` calls this hook via `onWorktreeReady` (Pillar 4 Sandcastle adapter). The returned bundle is serialized and written to the worktree as `.fulcrum/context.json` so the agent can read it.

This is the integration slice — not new logic, just wiring assemble → hook → file write.

## Acceptance criteria

- [x] `BeforeRunContextHook` exported from `src/memory/hooks/before-run-hook.ts`
- [x] Resolves `ContextAssembler`, calls `assemble(taskId, { agentType })`, and returns the `ContextBundle`
- [x] Writes `ContextBundle` JSON to `<worktree>/.fulcrum/context.json` (path configurable via env)
- [x] `ContextSnapshot.runId` set to `runId` after hook completes
- [x] Integration test: mock Symphony `before_run` trigger → assert `.fulcrum/context.json` written with 5 slices
- [x] Hook failure (e.g. retriever DB error) is non-fatal: logs warning and writes a minimal bundle `{ slices: [], tokenCount: 0, error: '...' }` so the run still proceeds
- [ ] `fulcrum doctor --json` `context_assembly` subsystem: `ok` (outside this issue's allowed edit scope; Pillar 8 capstone issue 19 owns doctor aggregation)
- [x] No new `agent_runs` row written by this hook (snapshot row only)

## Implementation

- 2026-05-03 codex: implemented `BeforeRunContextHook`, wired Symphony `before_run` lifecycle dispatch to call it before user hooks, added RED/GREEN tests for bundle write, env path override, non-fatal fallback, and lifecycle ordering.

## Blocked by

- `08-context-bundle-assembler.md`
