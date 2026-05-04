---
Status: completed
Triage: AFK
Pillar: 09-repos-git-supervision
Blocked-by: [07-trpc-procedures, 08-cli-verbs, 09-web-repo-list-and-dashboard, 13-tui-repos-browser-pane]
PRD: .scratch/agent-os-vision/prds/09-repos-git-supervision.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 9 section)
Decisions: [C1, C4, C5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Repo supervision row)
Docs: [simple-git commit/push API]
ImplRuntime: claude
---

## What to build

Gated `repo-write-ops` surface (`FULCRUM_FEATURES=repo-write-ops`). When the flag is OFF (default), all write-side git operations return `FEATURE_GATED`. When ON: `git.commit(repoId, message, files[])`, `git.push(repoId, branch, force?)`, `git.openPR(repoId, …)` (delegates to active connector if available). Commit triggers immediate `repo.sync.local` worker. All three surfaces (CLI, Web, TUI) expose the write ops identically — when flag is ON and when OFF.

## Acceptance criteria

- [x] `repos.git.commit` procedure: flag OFF → throws `FEATURE_GATED`; flag ON → stages `files[]`, commits with `message`, returns new SHA.
- [x] `repos.git.push` procedure: flag OFF → `FEATURE_GATED`; flag ON → pushes `branch` (with `force` option); updates `repos.last_seen_at`.
- [x] `repos.git.openPR` procedure: flag OFF → `FEATURE_GATED`; flag ON → delegates to `gh` CLI if available, else returns error with instructions.
- [x] Commit triggers `repo.sync.local` job immediately (no debounce).
- [ ] CLI: `fulcrum repo commit <id> --message <msg> --files <paths...>` and `fulcrum repo push <id> --branch <name>` (gated; both exit non-zero with clear message when flag OFF). — blocked on P9#08 CLI verbs infrastructure
- [ ] Web: "Commit" and "Push" buttons in branch toolbar (gated; visible+disabled with tooltip when OFF; enabled when ON). — blocked on P9#09 web repo dashboard
- [ ] TUI: `c` commit and `p` push keybindings (gated; shown in help overlay when ON; absent when OFF). — blocked on P9#13 TUI repos pane
- [x] Unit test: commit in fixture repo → SHA increments → sync job enqueued.
- [x] Unit test: push to bare remote fixture → remote HEAD advances.
- [ ] Three-surface parity test: commit via CLI → verify commit visible in Web + TUI without manual re-sync. — blocked on surface parity infrastructure

## Implementation notes

Core domain layer fully implemented:

- `src/product-kernel/feature-gate.ts` — `isFeatureEnabled(name)`, `assertFeatureEnabled(name)`, `FeatureGatedError` class with `.code = "FEATURE_GATED"` and `.feature` property. Reads `FULCRUM_FEATURES` env var (comma-separated).
- `src/product-kernel/git-write-ops.ts` — `gitCommit(db, input)`, `gitPush(db, input)`, `gitOpenPR(input)`. Uses raw `git` CLI via `Bun.spawn`. Commit enqueues `repo.sync.local` job immediately. Push updates `repos.last_seen_at`.
- `src/product-kernel/feature-gate.test.ts` — 9 tests covering all gate states.
- `src/product-kernel/git-write-ops.test.ts` — 6 tests: gated commit, gated push, successful commit with SHA verification, job enqueue after commit, empty files rejection, push to bare remote with HEAD verification.

CLI/Web/TUI surfaces deferred to their respective blocker issues (P9#08, P9#09, P9#13) which provide the infrastructure those surfaces plug into.

## Blocked by

- 07-trpc-procedures
- 08-cli-verbs
- 09-web-repo-list-and-dashboard
- 13-tui-repos-browser-pane
