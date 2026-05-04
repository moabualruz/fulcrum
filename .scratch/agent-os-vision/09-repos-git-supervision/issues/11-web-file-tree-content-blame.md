---
Status: completed
ImplRuntime: claude
Triage: AFK
Pillar: 09-repos-git-supervision
Blocked-by: [09-web-repo-list-and-dashboard]
PRD: .scratch/agent-os-vision/prds/09-repos-git-supervision.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 9 section)
Decisions: [C4, C5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Repo supervision row)
Docs: [shadcn-svelte, Shiki v1, diff2html]
---

## What to build

Web routes for file-tree browsing, file content viewing, and blame: `/repos/<id>/files` (root tree), `/repos/<id>/files/*` (lazy-load recursive tree + file content), `/repos/<id>/blame` (per-line blame view). File content is MIME-aware: images rendered inline, text syntax-highlighted via Shiki, binary files show a download link. Blame view has SHA nav (click SHA → commit detail).

## Acceptance criteria

- [ ] `/repos/<id>/files` renders DB-first tree from `repo_files_index`; directory nodes are expandable (lazy-load children via `repos.files.tree` on click).
- [ ] File node click loads `/repos/<id>/files/<path>` showing content in Shiki-highlighted read-only viewer.
- [ ] Branch selector (dropdown) at tree root changes branch context; URL param `?branch=<name>` persists.
- [ ] Binary file: download link rendered; no attempt to decode as text.
- [ ] Image files (PNG, JPEG, GIF, SVG, WebP): rendered inline `<img>`.
- [ ] `/repos/<id>/files/<path>?blame=1` renders `<BlameView>`: each line shows SHA chip, author, date; SHA chip navigates to `/repos/<id>/commits/<sha>`.
- [ ] Blame view supports `?branch=<name>` param.
- [ ] `<TreeNode>` component is recursive and handles depth > 5 without stack overflow.
- [ ] Playwright e2e: register fixture repo, navigate files, open a `.ts` file, assert syntax-highlighted content, open blame, assert SHA chips.

## Blocked by

- 09-web-repo-list-and-dashboard
