---
Status: completed
Triage: AFK
Pillar: 07-docs-editor-collab
Blocked-by: [02-tiptap-svelte-binding-spike.md, 03-frontmatter-schemas.md, 05-doc-crud-trpc.md]
PRD: .scratch/agent-os-vision/prds/07-docs-editor-collab.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 7 section)
Decisions: [Q13, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Confluence-grade docs row)
Docs: [https://zod.dev, https://nodeca.github.io/js-yaml/]
---

# Frontmatter form UI + raw YAML toggle — Zod-driven per doc_type

## Parent
PRD: `.scratch/agent-os-vision/prds/07-docs-editor-collab.md` (issues lines P7-31..P7-32)

## What to build
Two Svelte components backed by the Zod schemas from slice 03:

1. `FrontmatterForm.svelte` — renders per-`doc_type` form (derived from Zod schema): string fields as `<Input>`, enum fields as `<Select>` (options derived from Zod `.enum()`), array fields (`attendees`, `action_items`) as tag inputs. Required fields have `*` indicator; missing field blocks `docs.update` call (Zod `.safeParse` inline before submit). Zod errors shown inline next to each field.
2. `FrontmatterYaml.svelte` — raw YAML editor via `js-yaml`; reads from / writes to same `docs.frontmatter` jsonb. Toggle button switches form ↔ YAML. Form→YAML→Form round-trip is lossless. Unknown keys (passthrough types) preserved in both directions.

Both components accept `docType: DocTypeEnum` + `value: Frontmatter` props and emit `on:change`.

## Acceptance criteria
- [ ] `FrontmatterForm.svelte`: renders correct fields for each of 9 doc_types (derived from Zod schema, no hardcoded field lists)
- [ ] Required fields marked `*`; submitting with a missing required field shows inline Zod error and blocks `docs.update`
- [ ] Enum fields render as `<Select>` with options matching the Zod `.enum()` definition
- [ ] `attendees` / `action_items` array fields render as tag inputs (add / remove tags)
- [ ] `FrontmatterYaml.svelte`: renders current `frontmatter` as YAML; invalid YAML shows error banner, does NOT save
- [ ] Toggle form ↔ YAML: switching preserves all values; unknown keys from passthrough schemas present in YAML survive toggle back to form
- [ ] Round-trip lossless: form→YAML→form for ADR with all 4 required fields — no data loss
- [ ] Tests: ADR — missing `consequences` → `ZodError` with correct path `.consequences`
- [ ] Tests: YAML toggle — `{status:'proposed', decision:'d', context:'c', consequences:'co', extra:'preserved'}` survives form→YAML→form
- [ ] Tests: invalid YAML string in `FrontmatterYaml` → error shown, previous valid value not overwritten
- [ ] Web: `/docs/<slug>/edit` shows frontmatter panel as slide-in; form rendered by default; YAML toggle button visible
- [ ] Web: saving with incomplete required fields shows toast "Missing required fields: [field names]"
- [ ] CLI: `fulcrum docs edit <slug> --frontmatter '{"status":"proposed"}' --json` merges partial frontmatter and validates; returns error JSON on Zod failure
- [ ] TUI: `Ctrl+F` opens frontmatter YAML popup in textarea; `Ctrl+S` saves; Zod error shown in popup

## Blocked by
`02-tiptap-svelte-binding-spike.md`, `03-frontmatter-schemas.md`, `05-doc-crud-trpc.md`

## Notes / Tech-stack hints
- Derive `<Select>` options from Zod schema introspection: `(schema as z.ZodEnum<[string,...string[]]>)._def.values`
- `FrontmatterForm` should be doc_type-agnostic — driven entirely by the exported Zod schema, not switch/case per type
- `js-yaml` `load()` + `dump()` for round-trip; `dump` options: `lineWidth: 80, noRefs: true`
