---
Status: implemented
Triage: AFK
Pillar: 08-memory-context-engine
Blocked-by: [06-retriever-bm25-recency-importance.md]
Owner: codex-worker-p8-context-assembler
PRD: .scratch/agent-os-vision/prds/08-memory-context-engine.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 8 section)
Decisions: [Q18, Q17, C1, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Context engine row)
Docs: PRD §Context bundle assembler — 5 slices, token budget, weights, context_snapshots write
---

## What to build

`src/context/assemble.ts` — needle-di `@Injectable()` `ContextAssembler` called by Symphony's `before_run` hook. Returns `ContextBundle` and writes a `ContextSnapshot` entity.

```typescript
@Injectable()
export class ContextAssembler {
  constructor(
    private memRepo = inject(MemoryRepository),
    private docRepo = inject(DocRepository),
    private runRepo = inject(AgentRunRepository),
    private snapshotRepo = inject(ContextSnapshotRepository),
  ) {}
}
```

**5 slices (priority order for proportional truncation):**
1. Memories — top-N from `retrieve()` with query derived from task title + description
2. Linked docs — one-hop wikilinks from task description; each doc truncated to first paragraph / 200 tokens; max 5 docs
3. Recent agent runs — last 3 same-task + last 2 sibling-task runs; status + summary only unless budget allows full transcript
4. Repo state snapshot — current branch + last 5 commits + depth-2 directory tree from `RepoRepository` cached state (Pillar 9 data)
5. Skill prompts — SKILL.md description + triggers for chosen agent (Pillar 5 skills registry)

**Token budget:** default 8192 (overridable via `context.tokenBudget` project setting). Proportional weights `[0.35, 0.20, 0.20, 0.15, 0.10]`. Naive token estimate: `text.split(' ').length * 1.3`.

**`ContextSnapshot` entity** written on every call: `bundleBlob` = full JSON, `tokenCount`, `sliceSizes` breakdown.

`context.preview` tRPC procedure: assembles bundle for a task without writing an `agent_runs` row; returns `ContextBundle` with per-slice token counts.

## Acceptance criteria

- [x] `ContextAssembler` is `@Injectable()` and exposes `assemble(taskId, opts): Promise<{ bundle: ContextBundle, snapshotId: string }>`
- [x] Returns exactly 5 slices; each slice non-null (empty slice = `{ content: '', tokenCount: 0 }`)
- [x] Total `tokenCount` ≤ configured budget (`assembler.unit.test.ts`)
- [x] `ContextSnapshot` entity written on every `assemble()` call; `bundleBlob` byte-identical to returned JSON
- [x] Re-hydrating from `ContextSnapshot.bundleBlob` (no repository calls) produces byte-identical JSON (`assembler.replay.test.ts`)
- [x] Slice 1 uses `retrieve()` with query = `"${task.title} ${task.description}"`
- [x] Slice 2 resolves max 5 wikilinks; each truncated at 200-token boundary
- [x] Slice 3 includes last 3 same-task runs + last 2 sibling runs; transcript dropped when budget is tight
- [x] Slice 4 present when repo data available; gracefully empty (`{ content: '', tokenCount: 0 }`) when no repo linked
- [x] Slice 5 present when skills registry has entry for agent type; gracefully empty otherwise
- [ ] `context.preview` tRPC procedure returns bundle without writing `agent_runs` row
- [x] Proportional truncation: each slice allocated `budget * weight[i]`; slice text clipped at its allocation

## Blocked by

- `06-retriever-bm25-recency-importance.md`

## EXECUTION-LOG

- 2026-05-02 codex-orchestrator: claimed for `codex-worker-p8-context-assembler` after retriever lane accepted on main (`906b533b`, `bf268055`).
- 2026-05-02 codex-worker-p8-context-assembler: implemented service core in `src/context/assemble.ts` with `@Injectable()` `ContextAssembler`, `ContextSnapshotRepository` wrapper, 5-slice bundle assembly, default 8192 budget, weights `[0.35,0.20,0.20,0.15,0.10]`, proportional truncation, replay helper, and tests in `src/context/__tests__/assembler.test.ts`.
- 2026-05-02 codex-worker-p8-context-assembler: deferred `context.preview` tRPC acceptance to API/router gate. Root/shared tRPC router is frozen by active P1 gate, and lane write set excludes router-wide surfaces.
- 2026-05-02 codex-worker-p8-context-assembler: verification passed: `bun test src/context/__tests__/assembler.test.ts src/memory/__tests__/retriever.test.ts src/memory/__tests__/extractor-heuristic.test.ts`; `bun run lint`.
