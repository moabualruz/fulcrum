---
Status: completed
Triage: AFK
Pillar: 09-repos-git-supervision
Blocked-by: [07-trpc-procedures]
PRD: .scratch/agent-os-vision/prds/09-repos-git-supervision.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 9 section)
Decisions: [C4, C5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Repo supervision row)
Docs: [shadcn-svelte, SvelteKit route conventions]
---

## What to build

Web routes `/repos` (repo list) and `/repos/<id>` (per-repo dashboard). The dashboard shows: repo name/slug/kind, current branch, sync status badge (spinner while syncing, error hover detail), last sync timestamp, recent commits (last 5), open task count, and recent agent run count. Add-repo action (modal form supporting `--path` and `--url` variants). All data loaded via tRPC.

## Acceptance criteria

- [ ] `/repos` lists all repos in the org with name, kind badge (local/remote), sync-status badge, and last-sync relative time.
- [ ] `/repos` has an "Add repo" button opening a modal with `Path` / `Remote URL` toggle, optional `Name` and `Project` fields.
- [ ] `/repos/<id>` dashboard renders: repo header, current branch chip, sync-status badge with error detail tooltip, "Sync now" button.
- [ ] Dashboard panels: recent commits (last 5, sha + subject + author + relative time), open task count linked to `/tasks?repo=<id>`, recent runs count.
- [ ] Sync-status badge is reactive: after "Sync now" click, badge shows spinner until `sync_status='idle'`.
- [ ] "Add repo" submission calls `repos.add` tRPC; on success, new row appears in list without full-page reload.
- [ ] Responsive layout (mobile ≥ 375 px).
- [ ] Playwright e2e: register a local fixture repo, verify it appears in list, click through to dashboard, assert commit count > 0.

## Blocked by

- 07-trpc-procedures
