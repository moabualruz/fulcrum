---
Status: ready-for-agent
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [16-web-shell-rebuild/issues/01-v0-teardown-and-sveltekit-scaffold.md, 07-docs-editor-collab/issues/01-tiptap-core-and-schema.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [Q11, Q13, Q14, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (rows: "Confluence-grade docs", "Top-class editor")
Docs: https://tiptap.dev/docs, https://kit.svelte.dev/docs
---

# Doc routes — /docs, /docs/global, /docs/[id] reader, /docs/[id]/edit, /docs/[id]/history

## What to build

Five doc routes. `/docs` + `/docs/global`: sidebar tree navigation (project tree + global tree) with expand/collapse, breadcrumbs, "New Doc" button with `doc_type` selector. `/docs/[id]` reader: TipTap read-only render (remark+unified+shiki+DOMPurify), frontmatter header (type badge, status, scope), backlinks sidebar from `doc_links`. `/docs/[id]/edit`: TipTap editable with all extensions from Pillar 7 (StarterKit, wikilinks, @agent mention, KaTeX, Mermaid, image, file); frontmatter form (Zod-validated TipTap block) + raw YAML toggle (round-trip stable); autosave 1000ms debounce. `/docs/[id]/history`: version timeline (version number, author, timestamp); click version → diff view (jsondiffpatch rendered); "Restore" button.

Cuts through: `docs.list(projectId)` tRPC → tree rendered → click → `docs.get(id)` → TipTap JSON loaded → edit → autosave → `doc_versions` delta written → history shows new version.

## Acceptance criteria

- [ ] Tree: project + global tree expand/collapse; breadcrumb updates on navigate; drag-to-reorder updates `parent_id`.
- [ ] Reader: headings / code blocks / math / wikilinks render correctly; wikilinks navigate to target doc; backlinks sidebar shows docs linking in.
- [ ] Editor: type → 1000ms debounce → `docs.update` called → "Saved" indicator; wikilink `[[` autocomplete works; `@agent` mention shows agent picker.
- [ ] Frontmatter: form fields (type, status, assignees) validate via Zod; "Edit YAML" toggle → raw YAML; save → round-trip identical JSON.
- [ ] History: 5 versions visible; diff shows added/removed text highlighted; Restore rolls back `tiptap_content` without data loss.
- [ ] Failure gate: TipTap ProseMirror DOM breaks Svelte 5 → dynamic import via `onMount` portal pattern.
- [ ] Playwright: create doc → open editor → type content → save → history shows version → restore.
- [ ] CLI: `fulcrum doc list --json`; `fulcrum doc get <id> --json`.
- [ ] TUI: doc browser + plain editor (Pillar 15).

## Blocked by

- Issue 01 (scaffold) — layout needed.
- Pillar 7 issue 01 (TipTap core) — editor extensions must be built.
