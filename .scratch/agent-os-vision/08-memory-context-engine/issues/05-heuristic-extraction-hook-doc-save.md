---
Status: ready-for-agent
Triage: AFK
Pillar: 08-memory-context-engine
Blocked-by: [03-heuristic-extractor-core.md]
PRD: .scratch/agent-os-vision/prds/08-memory-context-engine.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 8 section)
Decisions: [Q16, C1]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Memory + Context rows)
Docs: PRD §Heuristic extractor — doc save hook (after_doc_save); cross-ref Pillar 7
---

## What to build

`@Injectable()` `AfterDocSaveMemoryHook` in `src/memory/hooks/after-doc-save-hook.ts`. Receives doc body + frontmatter (delivered by Pillar 7's doc-save event), resolves `HeuristicExtractor` through needle-di, and runs three extraction passes:

1. Frontmatter keys `decisions|blockers|links|status|tags` → one memory per value
2. Lists under `## Decisions` / `## Blockers` / `## Action Items` headings → one memory per bullet
3. Wikilinks in body → `kind='link'`

Persists `Memory` entities with `source='heuristic'`; persists `MemoryLink` entities with `target_kind='doc'` and `target_id=docId`. This pillar subscribes to the Pillar 7 doc-save event; it does not own the event emission.

## Acceptance criteria

- [ ] `AfterDocSaveMemoryHook.handle(docId: string, body: string, frontmatter: Record<string, unknown>, ctx): Promise<void>` exported
- [ ] Pass 1: frontmatter `{ decisions: ['use PGlite'] }` → memory `{ kind: 'decision', body: 'use PGlite', source: 'heuristic' }`
- [ ] Pass 2: `## Blockers\n- waiting on review` → memory `{ kind: 'blocker', importance: 'high' }`
- [ ] Pass 3: `[[My Doc]]` in body → memory `{ kind: 'link', body: 'My Doc' }`
- [ ] `MemoryLink` entity: `target_kind='doc'`, `target_id=docId` for every memory written
- [ ] Integration test: fixture doc → assert correct `Memory` + `MemoryLink` rows through repositories
- [ ] Idempotent: re-saving same doc body does not duplicate rows
- [ ] Hook is a no-op when body + frontmatter produce zero extractions
- [ ] `org_id` and `project_id` inferred from doc's owning project via context

## Blocked by

- `03-heuristic-extractor-core.md`
