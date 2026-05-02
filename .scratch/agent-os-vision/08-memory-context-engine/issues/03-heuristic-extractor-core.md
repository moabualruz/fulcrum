---
Status: implemented
Triage: AFK
Pillar: 08-memory-context-engine
Blocked-by: [01-schema-migration-core.md]
Owner: codex-worker-p8-heuristic-extractor
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

- [x] `HeuristicExtractor` is `@Injectable()` and resolved through needle-di
- [x] `HeuristicExtractor.extractMemories(text)` is deterministic with no DB writes or I/O
- [x] Pass 1: fixture transcript with `"[wrote] src/foo.ts"` → row `{ kind: 'file_ref', body: 'src/foo.ts', source: 'heuristic' }`
- [x] Pass 2: `"decided: use PGlite"` and `"## Decision\nuse PGlite"` each → `{ kind: 'decision', importance: 'high' }`; covers 5 decision-pattern variants
- [x] Pass 3: `"## Summary"` and `"### Details"` → `{ kind: 'section_anchor' }`
- [x] Pass 4: `"blocked by issue #12"` and `"waiting on review"` → `{ kind: 'blocker', importance: 'high' }`
- [x] Pass 5: `"[[Foo Bar]]"` → `{ kind: 'link', body: 'Foo Bar' }`; bare URL `https://example.com` → `{ kind: 'link' }`
- [x] Fixture transcript with all patterns → ≥1 row of each `kind`
- [x] Empty string input returns `[]`
- [x] No cross-pass duplicates for same span (span-tracking prevents double-extraction)
- [x] Unit tests in `src/memory/__tests__/extractor-heuristic.test.ts` all green

## Blocked by

- `01-schema-migration-core.md`

## EXECUTION-LOG

- 2026-05-02 codex-worker-p8-heuristic-extractor: RED `bun test src/memory/__tests__/extractor-heuristic.test.ts` → missing `../extractor-heuristic.ts`, 0 pass / 1 fail / 1 error.
- 2026-05-02 codex-worker-p8-heuristic-extractor: implemented `src/memory/extractor-heuristic.ts` as pure needle-di service with ordered file_ref, decision, section_anchor, blocker, link passes and overlap span guard.
- 2026-05-02 codex-worker-p8-heuristic-extractor: GREEN `bun test src/memory/__tests__/extractor-heuristic.test.ts` → 10 pass / 0 fail / 16 expect.
- 2026-05-02 codex-worker-p8-heuristic-extractor: `bun run lint` blocked by unrelated untracked `tests/skills/upstream-sync.test.ts` importing missing `../../src/skills/upstream-sync.ts`.
- 2026-05-02 codex-worker-p8-heuristic-extractor: `bun run ci` later passed install/typecheck/symphony-lock and failed in unrelated inference UI/TUI tests: `tui.pullInferenceModel is not a function`; settings inference page missing expected `Download`.
