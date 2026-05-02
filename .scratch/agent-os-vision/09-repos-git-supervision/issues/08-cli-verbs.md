---
Status: ready-for-agent
Triage: AFK
Pillar: 09-repos-git-supervision
Blocked-by: [07-trpc-procedures]
PRD: .scratch/agent-os-vision/prds/09-repos-git-supervision.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 9 section)
Decisions: [Q-cli-shape, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Repo supervision row)
Docs: []
---

## What to build

Full `fulcrum repo <verb>` CLI surface — all 16 verbs from the PRD — auto-generated from tRPC schema (Q-cli-shape) with `--json` output on every command. Three verb groups: registration/lifecycle (`add`, `remove`, `list`, `show`, `sync`, `status`), branch ops (`branches`, `branch-create`, `checkout`, `branch-delete`), and read-side exploration (`commits`, `diff`, `blame`, `files`, `cat`, `stash-list`). Write-side verbs (`commit`, `push`) gated by `repo-write-ops` flag.

## Acceptance criteria

- [ ] `fulcrum repo add --path <dir>` and `fulcrum repo add --url <remote>` both work; `--project-id` and `--name` optional.
- [ ] `fulcrum repo list [--project-id] [--json]` returns typed JSON array matching `RepoSchema[]`.
- [ ] `fulcrum repo show <id|slug>` returns repo detail including `branches`, `lastSync`, `openTaskCount`.
- [ ] `fulcrum repo sync <id|slug>` triggers sync and exits 0 on success.
- [ ] `fulcrum repo branches <id>`, `branch-create`, `checkout`, `branch-delete` all wired.
- [ ] `fulcrum repo commits <id> [--branch] [--page] [--limit]` paginated, `--json` valid.
- [ ] `fulcrum repo diff <id> <sha>` prints unified diff to stdout.
- [ ] `fulcrum repo blame <id> <file> [--branch]` prints blame table.
- [ ] `fulcrum repo files <id> [--path] [--branch]` prints file tree.
- [ ] `fulcrum repo cat <id> <file> [--branch]` prints file content to stdout.
- [ ] `fulcrum repo status <id>` prints working-tree status.
- [ ] `fulcrum repo stash-list <id>` prints stash list.
- [ ] `fulcrum repo remove <id> [--unregister-only|--delete-mirror]` removes registration (and optionally mirror).
- [ ] Every command: `--json` flag returns output matching tRPC procedure Zod schema.
- [ ] Integration test: run each verb against a test fixture repo; assert non-zero exit on unknown id.

## Blocked by

- 07-trpc-procedures
