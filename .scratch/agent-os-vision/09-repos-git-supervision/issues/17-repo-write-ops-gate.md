---
Status: ready-for-agent
Triage: AFK
Pillar: 09-repos-git-supervision
Blocked-by: [07-trpc-procedures, 08-cli-verbs, 09-web-repo-list-and-dashboard, 13-tui-repos-browser-pane]
PRD: .scratch/agent-os-vision/prds/09-repos-git-supervision.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 9 section)
Decisions: [C1, C4, C5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Repo supervision row)
Docs: [simple-git commit/push API]
---

## What to build

Gated `repo-write-ops` surface (`FULCRUM_FEATURES=repo-write-ops`). When the flag is OFF (default), all write-side git operations return `FEATURE_GATED`. When ON: `git.commit(repoId, message, files[])`, `git.push(repoId, branch, force?)`, `git.openPR(repoId, …)` (delegates to active connector if available). Commit triggers immediate `repo.sync.local` worker. All three surfaces (CLI, Web, TUI) expose the write ops identically — when flag is ON and when OFF.

## Acceptance criteria

- [ ] `repos.git.commit` tRPC procedure: flag OFF → throws `FEATURE_GATED`; flag ON → stages `files[]`, commits with `message`, returns new SHA.
- [ ] `repos.git.push` tRPC procedure: flag OFF → `FEATURE_GATED`; flag ON → pushes `branch` (with `force` option); updates `repos.last_touched_at`.
- [ ] `repos.git.openPR` tRPC procedure: flag OFF → `FEATURE_GATED`; flag ON → delegates to `connector-github|gitlab|bitbucket` if active, else returns error with instructions.
- [ ] Commit triggers `repo.sync.local` job immediately (no debounce).
- [ ] CLI: `fulcrum repo commit <id> --message <msg> --files <paths...>` and `fulcrum repo push <id> --branch <name>` (gated; both exit non-zero with clear message when flag OFF).
- [ ] Web: "Commit" and "Push" buttons in branch toolbar (gated; visible+disabled with tooltip when OFF; enabled when ON).
- [ ] TUI: `c` commit and `p` push keybindings (gated; shown in help overlay when ON; absent when OFF).
- [ ] Unit test: commit in fixture repo → SHA increments → `repo_commits` updated after sync.
- [ ] Unit test: push to bare remote fixture → remote HEAD advances.
- [ ] Three-surface parity test: commit via CLI → verify commit visible in Web + TUI without manual re-sync.

## Blocked by

- 07-trpc-procedures
- 08-cli-verbs
- 09-web-repo-list-and-dashboard
- 13-tui-repos-browser-pane
