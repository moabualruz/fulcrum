---
Status: ready-for-agent
Triage: AFK
Pillar: 07-docs-editor-collab
Blocked-by: [02-tiptap-svelte-binding-spike.md, 05-doc-crud-trpc.md]
PRD: .scratch/agent-os-vision/prds/07-docs-editor-collab.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 7 section)
Decisions: [C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Confluence-grade docs row)
Docs: [https://tiptap.dev/docs/editor/extensions/marks/comment]
---

# Comments + selection-anchored threads — doc_comments tRPC + CommentsPanel

## Parent
PRD: `.scratch/agent-os-vision/prds/07-docs-editor-collab.md` (issues lines P7-16, P7-39)

## What to build
Wire the TipTap Comment extension (MIT since May 2026) to `doc_comments` via tRPC.
Selecting text in the editor and clicking "Comment" anchors a thread (`anchor_range` jsonb
stores the ProseMirror selection). `CommentsPanel.svelte` in the editor sidebar shows all
open threads, highlights the anchored range in the editor on hover, supports inline
replies, and resolves/re-opens threads. Resolved threads collapse but are preserved.
tRPC: `docs.comments.list`, `docs.comments.create`, `docs.comments.update`,
`docs.comments.delete`, `docs.comments.resolve`.

## Acceptance criteria
- [ ] TipTap Comment extension wired: select text → toolbar "comment" button → new thread anchored to selection
- [ ] `doc_comments` row created: `anchor_range` jsonb stores TipTap comment mark reference, `body_md` not empty
- [ ] `CommentsPanel.svelte`: lists all non-resolved threads ordered by position in document; resolved threads collapsible
- [ ] Hover over thread in panel → highlights corresponding text range in editor
- [ ] Thread reply: `parent_comment_id` set; replies nested under parent in panel
- [ ] Resolve thread: `resolved=true`, thread collapses in panel, gutter indicator removed; data preserved in DB
- [ ] Re-open: resolved thread can be re-opened (sets `resolved=false`)
- [ ] `docs.comments.delete`: only author or org admin can delete; cascade deletes replies
- [ ] Tests: create comment → resolve → re-open lifecycle integration test on PGlite
- [ ] Tests: cascade — delete root comment, all replies removed
- [ ] Tests: `docs.comments.list` returns only non-resolved by default; `resolved=true` param returns resolved
- [ ] Web: `/docs/<slug>/edit` shows `CommentsPanel` as slide-in sidebar; gutter indicator dots on commented lines
- [ ] Web: `/docs/<slug>` read view shows comment count badge; comments panel read-only (no new anchoring from read view)
- [ ] CLI: `fulcrum docs comments list <slug> --json` returns `[{id, body_md, anchor_range, resolved, replies:[…]}]`
- [ ] TUI: no inline comment creation (TipTap unavailable); CLI fallback noted in TUI help text

## Blocked by
`02-tiptap-svelte-binding-spike.md`, `05-doc-crud-trpc.md`

## Notes / Tech-stack hints
- TipTap Comment extension stores comment mark as a decoration; `anchor_range` in DB should be `{from, to, text_preview}` for resilience when doc content shifts
- Comment mentions (`@user` in body_md) use same mention-extractor logic from slice 08 — reuse, don't duplicate
- Gutter indicators: absolute-positioned dots using ProseMirror `DecorationSet` on comment marks
