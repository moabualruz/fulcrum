---
Status: in-progress
Triage: AFK
Pillar: 08-memory-context-engine
Blocked-by: [01-schema-migration-core.md]
Owner: codex-worker-p8-retriever
PRD: .scratch/agent-os-vision/prds/08-memory-context-engine.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 8 section)
Decisions: [Q17, Q15, C1]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Memory + Context rows)
Docs: PRD §Retriever — text-rank formula, recency decay, importance boost, repository criteria, RetrieverOpts
---

## What to build

`src/memory/retriever.ts` — needle-di `@Injectable()` service. Public method `retrieve(query: string, opts: RetrieverOpts): Promise<Memory[]>`; constructor injects `MemoryRepository` with `inject(MemoryRepository)`.

**Scoring formula (always-on):**
```
score = memory.textRank
      + memory.recencyBoost
      + memory.importanceBoost
```

`MemoryRepository.searchProjectAndGlobal(opts)` owns text-rank, recency, and importance calculation behind MikroORM repository methods. Scope fetches project rows and global rows for the same org through typed criteria, dedupes by `id`, sorts by `score DESC`, and returns `opts.topK` (default 20). `includeArchived=true` keeps archived rows. `kinds` filter applies a typed property filter.

Zod schema `RetrieverOptsSchema` generated and exported for tRPC reuse.

## Acceptance criteria

- [ ] `MemoryRetriever` is `@Injectable()` and exposes `retrieve(query, opts)`
- [ ] Fixed seed: 50 rows (2 projects + 5 globals), fixed query → identical top-20 list across 100 sequential calls (`retriever.determinism.test.ts`)
- [ ] Recency: newer memory beats 60-day-old memory with identical body on same query
- [ ] Importance boost: `high` memory beats `medium` memory with same body + same age by +1.0
- [ ] Scope merge: both project-scoped and global rows returned; no duplicates after repository dedupe by `id`
- [ ] Archived exclusion: archived rows absent by default; visible with `includeArchived: true`
- [ ] Org isolation: org A memories never appear in org B query results (`retriever.isolation.test.ts`)
- [ ] `kinds` filter: `retrieve(q, { kinds: ['decision'] })` returns only `kind='decision'` rows
- [ ] `RetrieverOptsSchema` is a valid Zod schema; round-trips through `tRPC` input validation
- [ ] All retriever tests in `src/memory/__tests__/retriever.test.ts` green

## Blocked by

- `01-schema-migration-core.md`

## EXECUTION-LOG

- 2026-05-02 codex-orchestrator: claimed for `codex-worker-p8-retriever`; prerequisite for B072 context bundle assembler because `src/memory/retriever.ts` is absent while B071 bundle status is stale/incomplete.
