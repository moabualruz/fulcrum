---
Status: completed
Triage: AFK
Pillar: 16-web-shell-rebuild
Blocked-by: [16-web-shell-rebuild/issues/01-v0-teardown-and-sveltekit-scaffold.md, 09-repos-git-supervision/issues/01-repo-schema-and-watcher.md]
PRD: .scratch/agent-os-vision/prds/16-web-shell-rebuild.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 16 section)
Decisions: [Q24, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (row: "Repo supervision — no git integration")
Docs: https://kit.svelte.dev/docs
---

# Repos browser — /repos, /repos/[id], /repos/[id]/files, /repos/[id]/commits

## What to build

Four repo routes. `/repos`: global repo list table (name, remote URL, branch count, last_synced_at, stale badge) + "Sync" button per row → `repos.sync(id)` tRPC. `/repos/[id]`: repo detail — branch list (active/stale badges), recent commits (SHA, message, author, date), open tasks linked to this repo. `/repos/[id]/files`: file tree browser (lazy-load directories on expand) + file content viewer (syntax highlighted via shiki, read-only). `/repos/[id]/commits`: paginated commit log (SHA link, message, author avatar, date, diff stat).

Cuts through: `repos.list` tRPC → repo list → click → `repos.get(id)` → branch list → click file tree → lazy load dirs → click file → content viewer.

## Acceptance criteria

- [ ] Repo list: 3 repos rendered; sync button → `repos.sync` called; list updates `last_synced_at`; stale badge shows when `stale_since` > 24h.
- [ ] Repo detail: branches listed; recent 10 commits shown; tasks linked via `edges(from_kind='repo', to_kind='task')` shown as task chips.
- [ ] File tree: root dirs expand lazily; click file → content pane shows shiki-highlighted content; binary files show "Binary file" placeholder.
- [ ] Commit log: pagination works at 50+ commits; SHA is monospace; author avatar from `users` table if matched.
- [ ] Playwright: expand file tree folder → child items appear; commit pagination works.
- [ ] CLI: `fulcrum repo list --json`; `fulcrum repo status <id> --json`; `fulcrum repo sync <id>`.
- [ ] TUI: repo browser screen (Pillar 15).

## Blocked by

- Issue 01 (scaffold) — layout needed.
- Pillar 9 issue 01 (repo schema + watcher) — `repos` table and `repos.*` tRPC.
