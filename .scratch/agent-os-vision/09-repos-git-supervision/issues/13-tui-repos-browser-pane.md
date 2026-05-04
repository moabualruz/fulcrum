---
Status: completed
ImplRuntime: claude
Triage: AFK
Pillar: 09-repos-git-supervision
Blocked-by: [07-trpc-procedures, 08-cli-verbs]
PRD: .scratch/agent-os-vision/prds/09-repos-git-supervision.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 9 section)
Decisions: [Q-tui-lib, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Repo supervision row)
Docs: [OpenTUI — Bun-native TS TUI framework]
---

## What to build

TUI repos browser pane inside `fulcrum tui`. Layout: repo list (left column) | branches (top-right) + commit log (bottom-left) + file tree (bottom-right). Status bar shows branch + last sync + dirty indicator. All data via tRPC in-process. Keyboard ops: `n` new branch (gated), `x` delete branch (gated), `Enter` checkout / open file, `d` diff (scrollable ASCII patch buffer), `b` blame. `repo-write-ops` ON adds `c` commit + `p` push. Failure gate: if OpenTUI component library is insufficient, fall back to ratatui (Rust) per Q-tui-lib.

## Acceptance criteria

- [ ] `fulcrum tui` launches and shows a "Repos" nav entry.
- [ ] Repos pane opens with a list of all repos; arrow keys navigate.
- [ ] Selecting a repo populates: branches pane (top-right), commit log pane (bottom-left), file tree pane (bottom-right).
- [ ] `Enter` on a branch row: calls `repos.branches.checkout` (gated by `repo-write-ops`); current branch indicator updates.
- [ ] `d` on a commit row: opens scrollable ASCII diff view in an overlay.
- [ ] `b` on a file row: opens blame view (sha | author | line).
- [ ] `n` / `x` on branch pane: new-branch / delete-branch prompts (gated; show "FEATURE_GATED" tooltip when OFF).
- [ ] `c` / `p` keys available when `repo-write-ops` ON; invisible when OFF.
- [ ] Status bar: `[branch]  last-sync: <relative>  [dirty]`.
- [ ] Smoke-test checklist: launch tui → navigate to repos → open a repo → view a file → view blame → exit without crash.

## Blocked by

- 07-trpc-procedures
- 08-cli-verbs
