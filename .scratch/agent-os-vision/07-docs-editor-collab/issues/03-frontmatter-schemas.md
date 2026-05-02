---
Status: completed
Owner: codex-orchestrator
Triage: AFK
Pillar: 07-docs-editor-collab
Blocked-by: [01-docs-schema-foundation.md]
PRD: .scratch/agent-os-vision/prds/07-docs-editor-collab.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 7 section)
Decisions: [Q13]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Confluence-grade docs row)
Docs: [https://zod.dev]
---

# Frontmatter Zod schemas — all 9 doc_types + round-trip validation

## Parent
PRD: `.scratch/agent-os-vision/prds/07-docs-editor-collab.md` (issues lines P7-03)

## What to build
`src/docs/frontmatter-schemas.ts` exports one Zod schema per doc_type plus a
discriminated-union `FrontmatterSchema` keyed by `doc_type`. Required fields per PRD:
ADR (`status/decision/context/consequences`), postmortem
(`impact/timeline/root_cause/action_items`), RFC (`status/summary`), runbook
(`service/severity_level`), meeting (`date/attendees`), spec (`status`).
wiki/note/scratch have no required fields but accept arbitrary extra keys (passthrough).
Schemas used by tRPC procedures (validation on `docs.update`) and by the frontmatter
form/YAML components built in slices 13-14.

## Acceptance criteria
- [ ] `src/docs/frontmatter-schemas.ts` exports `FrontmatterSchemaMap` record keyed by `DocTypeEnum` values
- [ ] `FrontmatterSchema` discriminated union used as the `frontmatter` Zod type in tRPC procedures
- [ ] ADR schema: `.parse({status:'proposed', decision:'...', context:'...', consequences:'...'})` passes; missing any of the four required keys throws `ZodError`
- [ ] Postmortem schema: all four required fields present to pass; `action_items` typed as `string[]`
- [ ] RFC schema: `status` enum `['draft','review','accepted','rejected']`; `summary` required string
- [ ] Runbook schema: `service` string required; `severity_level` enum `['p0','p1','p2','p3']` required
- [ ] Meeting schema: `date` ISO-8601 string required; `attendees` `string[]` required
- [ ] Spec schema: `status` enum `['draft','review','approved','deprecated']` required
- [ ] wiki/note/scratch schemas: passthrough — unknown keys preserved, no required fields
- [ ] Tests: each doc_type — valid shape passes, missing required field fails, extra unknown keys preserved for passthrough types
- [ ] Tests: round-trip — `JSON.parse(JSON.stringify(parsed))` matches original for all types (no date coercion loss)
- [ ] Tests: discriminated union `FrontmatterSchema.parse({doc_type:'adr', status:'proposed', ...})` selects correct sub-schema

## Blocked by
`01-docs-schema-foundation.md` — needs `DocTypeEnum` from schema

## Notes / Tech-stack hints
- Use `z.passthrough()` for wiki/note/scratch so custom user keys survive form→YAML→form round-trip
- `status` fields should be Zod `.enum()` not `.string()` so the form component can derive a select input with no extra config
- Export individual schemas (`AdrFrontmatterSchema`, etc.) so components can import just what they need without loading all 9
