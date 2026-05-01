---
Status: ready-for-agent
Triage: AFK
Pillar: 08-memory-context-engine
Blocked-by: [01-schema-migration-core.md]
PRD: .scratch/agent-os-vision/prds/08-memory-context-engine.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 8 section)
Decisions: [Q16, C1]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Memory + Context rows)
Docs: PRD §Heuristic extractor — five regex/parser passes
---

## What to build

`src/memory/extractor-heuristic.ts` — needle-di `@Injectable()` service (~200 LOC) with method `extractMemories(text: string): HeuristicMemory[]`. Constructor uses `inject(MemoryRepository)` default-param syntax for later write-path reuse, while this method remains deterministic and side-effect free. Runs five regex/parser passes in sequence over an agent run transcript or doc body:

1. **file-touched** — `[read|wrote|created|deleted] <path>` → `kind='file_ref'`
2. **decision lines** — `decided:` / `decision:` / `## Decision` headings → `kind='decision'`, `importance='high'`
3. **heading detection** — H2/H3 markdown headings → `kind='section_anchor'`
4. **blocker patterns** — `blocked by` / `waiting on` / `need .* to proceed` → `kind='blocker'`, `importance='high'`
5. **link extraction** — `[[wikilink]]` / bare URLs → `kind='link'`

All output rows carry `source='heuristic'`. No DB writes here — this is a pure extraction function tested with fixtures.

## Acceptance criteria

- [ ] `HeuristicExtractor` is `@Injectable()` and resolved through needle-di
- [ ] `HeuristicExtractor.extractMemories(text)` is deterministic with no DB writes or I/O
- [ ] Pass 1: fixture transcript with `"[wrote] src/foo.ts"` → row `{ kind: 'file_ref', body: 'src/foo.ts', source: 'heuristic' }`
- [ ] Pass 2: `"decided: use PGlite"` and `"## Decision\nuse PGlite"` each → `{ kind: 'decision', importance: 'high' }`; covers 5 decision-pattern variants
- [ ] Pass 3: `"## Summary"` and `"### Details"` → `{ kind: 'section_anchor' }`
- [ ] Pass 4: `"blocked by issue #12"` and `"waiting on review"` → `{ kind: 'blocker', importance: 'high' }`
- [ ] Pass 5: `"[[Foo Bar]]"` → `{ kind: 'link', body: 'Foo Bar' }`; bare URL `https://example.com` → `{ kind: 'link' }`
- [ ] Fixture transcript with all patterns → ≥1 row of each `kind`
- [ ] Empty string input returns `[]`
- [ ] No cross-pass duplicates for same span (span-tracking prevents double-extraction)
- [ ] Unit tests in `src/memory/__tests__/extractor-heuristic.test.ts` all green

## Blocked by

- `01-schema-migration-core.md`
