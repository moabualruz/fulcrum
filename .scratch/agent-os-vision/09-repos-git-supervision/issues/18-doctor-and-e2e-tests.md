---
Status: implemented
Triage: AFK
Pillar: 09-repos-git-supervision
Blocked-by: [04-local-repo-registration-and-watcher, 05-sync-worker-local, 06-remote-repo-registration-and-sync, 08-cli-verbs, 09-web-repo-list-and-dashboard, 10-web-branches-and-commits, 11-web-file-tree-content-blame, 12-web-project-repos-scoped-view, 13-tui-repos-browser-pane]
PRD: .scratch/agent-os-vision/prds/09-repos-git-supervision.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 9 section)
Decisions: [C4, Q24]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Repo supervision row)
Docs: [Playwright e2e conventions, hyperfine for benchmarks]
---

## What to build

Pillar 9 capstone: `fulcrum doctor` repos section + full Playwright e2e test suite + performance benchmarks. Doctor reports repos count, sync errors, active watcher count, LRU queue depth, and mirror disk usage. E2e tests cover the "add local repo → sync → browse → branch create → three-surface parity" golden path. Benchmarks measure watcher startup time for 20 repos and `repo.sync.local` throughput.

## Acceptance criteria

- [ ] `fulcrum doctor --json` output includes a `repos` section: `{ totalRepos, syncErrors, activeWatchers, lruQueueDepth, mirrorDiskGb }`.
- [ ] `fulcrum doctor` exits non-zero when `syncErrors > 0` or `mirrorDiskGb > 10`.
- [ ] Playwright e2e — golden path: register local fixture repo → wait for sync badge to go idle → navigate `/repos/<id>/files` → open a file → assert syntax highlight → navigate `/repos/<id>/branches` → create branch (with `repo-write-ops` ON) → assert branch appears.
- [ ] Playwright e2e — three-surface parity: create branch via CLI (`fulcrum repo branch-create`) → reload Web branch list → assert new branch visible → navigate TUI → assert new branch listed.
- [ ] Playwright e2e — remote repo: register remote (local bare repo as test fixture) → sync → assert commits populated.
- [ ] `hyperfine` benchmark: `WatcherRegistry.startAll()` for 20 repos < 500 ms; result captured in `bench/repos-watcher-startup.json`.
- [ ] `hyperfine` benchmark: `repo.sync.local` on 1k-file fixture repo < 3 s; result in `bench/repos-sync-local.json`.
- [ ] `bun run ci` includes the Playwright repos suite; no skip markers.
- [ ] Search integration: after sync, `searchDocRepo.find({ sourceKind: 'repo_file' })` returns rows; FTS on filename returns correct repo.

## Blocked by

- 04-local-repo-registration-and-watcher
- 05-sync-worker-local
- 06-remote-repo-registration-and-sync
- 08-cli-verbs
- 09-web-repo-list-and-dashboard
- 10-web-branches-and-commits
- 11-web-file-tree-content-blame
- 12-web-project-repos-scoped-view
- 13-tui-repos-browser-pane
