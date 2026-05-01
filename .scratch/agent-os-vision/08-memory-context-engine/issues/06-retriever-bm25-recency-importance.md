---
Status: ready-for-agent
Triage: AFK
Pillar: 08-memory-context-engine
Blocked-by: [01-schema-migration-core.md]
PRD: .scratch/agent-os-vision/prds/08-memory-context-engine.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 8 section)
Decisions: [Q17, Q15, C1]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Memory + Context rows)
Docs: PRD §Retriever — BM25 formula, recency decay, importance boost, UNION query, RetrieverOpts
---

## What to build

`src/memory/retriever.ts` — ~150 LOC, pure TS, no framework dependency. Single exported function `retrieve(query: string, opts: RetrieverOpts): Promise<Memory[]>`.

**Scoring formula (always-on):**
```
score = ts_rank_cd(body_tsv, plainto_tsquery('english', $query))
      + exp(-age_days / 30)
      + CASE WHEN importance = 'high' THEN 1.0 ELSE 0.0 END
```

**Scope:** single UNION SQL: project rows `(org_id=$1 AND project_id=$2 AND archived=false)` UNION global rows `(org_id=$1 AND global=true AND archived=false)`. Sort `score DESC`. Return top `opts.topK` (default 20). `includeArchived=true` drops the `archived=false` filter. `kinds` filter adds `AND kind = ANY($kinds)` when provided.

Zod schema `RetrieverOptsSchema` generated and exported for tRPC reuse.

## Acceptance criteria

- [ ] `retrieve(query, opts)` exported from `src/memory/retriever.ts`
- [ ] Fixed seed: 50 rows (2 projects + 5 globals), fixed query → identical top-20 list across 100 sequential calls (`retriever.determinism.test.ts`)
- [ ] Recency: newer memory beats 60-day-old memory with identical body on same query
- [ ] Importance boost: `high` memory beats `medium` memory with same body + same age by +1.0
- [ ] UNION: both project-scoped and global rows returned; no duplicates (UNION dedupes on `id`)
- [ ] Archived exclusion: archived rows absent by default; visible with `includeArchived: true`
- [ ] Org isolation: org A memories never appear in org B query results (`retriever.isolation.test.ts`)
- [ ] `kinds` filter: `retrieve(q, { kinds: ['decision'] })` returns only `kind='decision'` rows
- [ ] `RetrieverOptsSchema` is a valid Zod schema; round-trips through `tRPC` input validation
- [ ] All retriever tests in `src/memory/__tests__/retriever.test.ts` green

## Blocked by

- `01-schema-migration-core.md`
