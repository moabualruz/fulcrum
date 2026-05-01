---
Status: ready-for-agent
Triage: AFK
Pillar: 08-memory-context-engine
Blocked-by: [06-retriever-bm25-recency-importance.md]
PRD: .scratch/agent-os-vision/prds/08-memory-context-engine.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 8 section)
Decisions: [Q18, Q17, C1, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Context engine row)
Docs: PRD §Context bundle assembler — 5 slices, token budget, weights, context_snapshots write
---

## What to build

`src/context/assemble.ts` — assembles the 5-slice context bundle called by Symphony's `before_run` hook. Returns `ContextBundle` and writes a `context_snapshots` row.

**5 slices (priority order for proportional truncation):**
1. Memories — top-N from `retrieve()` with query derived from task title + description
2. Linked docs — one-hop wikilinks from task description; each doc truncated to first paragraph / 200 tokens; max 5 docs
3. Recent agent runs — last 3 same-task + last 2 sibling-task runs; status + summary only unless budget allows full transcript
4. Repo state snapshot — current branch + last 5 commits + depth-2 directory tree from `repos` table cached state (Pillar 9 data)
5. Skill prompts — SKILL.md description + triggers for chosen agent (Pillar 5 skills registry)

**Token budget:** default 8192 (overridable via `context.tokenBudget` project setting). Proportional weights `[0.35, 0.20, 0.20, 0.15, 0.10]`. Naive token estimate: `text.split(' ').length * 1.3`.

**`context_snapshots` row** written on every call: `bundle_blob` = full JSON, `token_count`, `slice_sizes` breakdown.

`context.preview` tRPC procedure: assembles bundle for a task without writing an `agent_runs` row; returns `ContextBundle` with per-slice token counts.

## Acceptance criteria

- [ ] `assemble(taskId, opts): Promise<{ bundle: ContextBundle, snapshotId: string }>` exported
- [ ] Returns exactly 5 slices; each slice non-null (empty slice = `{ content: '', tokenCount: 0 }`)
- [ ] Total `tokenCount` ≤ configured budget (`assembler.unit.test.ts`)
- [ ] `context_snapshots` row written on every `assemble()` call; `bundle_blob` byte-identical to returned JSON
- [ ] Re-hydrating from `context_snapshots.bundle_blob` (no DB queries) produces byte-identical JSON (`assembler.replay.test.ts`)
- [ ] Slice 1 uses `retrieve()` with query = `"${task.title} ${task.description}"`
- [ ] Slice 2 resolves max 5 wikilinks; each truncated at 200-token boundary
- [ ] Slice 3 includes last 3 same-task runs + last 2 sibling runs; transcript dropped when budget is tight
- [ ] Slice 4 present when repo data available; gracefully empty (`{ content: '', tokenCount: 0 }`) when no repo linked
- [ ] Slice 5 present when skills registry has entry for agent type; gracefully empty otherwise
- [ ] `context.preview` tRPC procedure returns bundle without writing `agent_runs` row
- [ ] Proportional truncation: each slice allocated `budget * weight[i]`; slice text clipped at its allocation

## Blocked by

- `06-retriever-bm25-recency-importance.md`
