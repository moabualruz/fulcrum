---
Status: ready-for-agent
Triage: AFK
Pillar: 07-docs-editor-collab
Blocked-by: [02-tiptap-svelte-binding-spike.md, 05-doc-crud-trpc.md]
PRD: .scratch/agent-os-vision/prds/07-docs-editor-collab.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 7 section)
Decisions: [C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Confluence-grade docs row)
Docs: [https://tiptap.dev/docs/editor/extensions/nodes/mention]
---

# Mention NodeView — @user / @agent / @task / @run chips + notification event emit

## Parent
PRD: `.scratch/agent-os-vision/prds/07-docs-editor-collab.md` (issues lines P7-25, P7-20)

## What to build
Custom TipTap `MentionNode` Svelte NodeView (~150 LOC) covering four mention types:
`@user`, `@agent`, `@task`, `@run`. Each type has a distinct chip color and hover card.
Autocomplete: `@` trigger opens type-narrowed dropdown (e.g. `@user:alice` or `@task:fix-bug`).
On save, `src/docs/mention-extractor.ts` parses mention nodes from `content_json` →
emits `doc.mention` events to the `events` table (consumed by Pillar 12 notifications).
No cross-pillar fan-out here — events table only (per PRD out-of-scope boundary).

## Acceptance criteria
- [ ] `MentionNode` extension: `@` typed in editor opens autocomplete dropdown with mention types
- [ ] `@user` autocomplete: queries `users` table by name/email; chip shows avatar initial + name; hover card shows email + role
- [ ] `@agent` autocomplete: queries agent registry; chip shows agent icon + model name
- [ ] `@task` autocomplete: queries `tasks` by title; chip shows task status badge + title
- [ ] `@run` autocomplete: queries `agent_runs` by id/title; chip shows run status + short id
- [ ] All chips: non-editable NodeView (click to navigate, not inline text edit)
- [ ] `mention-extractor.ts`: on save, for each mention node → inserts `events` row with `verb='doc.mention', subject_kind='doc', object_kind=<mention_type>, object_id=<mention_id>`
- [ ] `mention-extractor.ts`: no duplicate events — idempotent per `(doc_id, mention_id, version_num)` key
- [ ] Tests: extractor emits correct event shape for each of four mention types
- [ ] Tests: duplicate event prevention — run extractor twice on same doc version, event count unchanged
- [ ] Web: mention chips visible in `/docs/<slug>/edit` and `/docs/<slug>` read view
- [ ] Web: `@task` chip in read view is clickable → navigates to task detail
- [ ] CLI: `fulcrum docs show <slug> --json` `body_md` renders mentions as `@name` text
- [ ] TUI: reader panel shows `@name` mentions as plain text inline

## Blocked by
`02-tiptap-svelte-binding-spike.md`, `05-doc-crud-trpc.md`

## Notes / Tech-stack hints
- Mention type disambiguation: use `@user:`, `@agent:`, `@task:`, `@run:` prefixes in autocomplete; store as `{type, id, label}` in node attrs
- Pillar 9 (notifications) consumes `events` rows; this slice only writes them — no fan-out logic here
- Autocomplete should debounce 150 ms; max 8 results per type to keep popover scannable
