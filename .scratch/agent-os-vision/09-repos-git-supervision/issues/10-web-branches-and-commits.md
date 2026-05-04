---
Status: completed
Triage: AFK
Pillar: 09-repos-git-supervision
Blocked-by: [09-web-repo-list-and-dashboard]
PRD: .scratch/agent-os-vision/prds/09-repos-git-supervision.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 9 section)
Decisions: [C4, C5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Repo supervision row)
Docs: [shadcn-svelte, diff2html]
---

## What to build

Web routes for branch management and commit exploration: `/repos/<id>/branches` (branch list + create/checkout/delete behind `repo-write-ops`), `/repos/<id>/commits` (paginated log), `/repos/<id>/commits/<sha>` (diff view using `diff2html` unified/split toggle). All mutations guarded by feature flag; flag-off state shows "Write operations disabled" banner.

## Acceptance criteria

- [ ] `/repos/<id>/branches` lists branches with name, head SHA (truncated), `is_current` indicator, `is_default` badge.
- [ ] Branch list has "New branch" button (gated: visible + disabled when `repo-write-ops` OFF; enabled when ON).
- [ ] Branch row has "Checkout" and "Delete" actions (same gate).
- [ ] Flag-off state: write actions show a `FEATURE_GATED` banner with instructions to enable `repo-write-ops`.
- [ ] `/repos/<id>/commits` shows paginated commit log (20/page default): SHA chip, subject, author avatar/name, relative time, parent links.
- [ ] Pagination: "Load more" / page controls; URL param `?page=N` persists state.
- [ ] `/repos/<id>/commits/<sha>` renders diff via `diff2html` with unified/split toggle; stat summary (files changed, insertions, deletions) in header.
- [ ] Diff view: Shiki syntax highlight applied to code lines in diff (shared instance from Pillar 7 if available, else local Shiki).
- [ ] Playwright e2e: navigate to commits, click a commit, assert diff renders with at least one file changed.

## Blocked by

- 09-web-repo-list-and-dashboard
