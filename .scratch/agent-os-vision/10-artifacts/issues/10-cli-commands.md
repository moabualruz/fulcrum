---
Status: completed
ImplRuntime: claude
Triage: AFK
Pillar: artifacts
Blocked-by: [06-trpc-procedures.md]
PRD: .scratch/agent-os-vision/prds/10-artifacts.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 10 section)
Decisions: [Q-cli-shape, C4, D5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Artifacts row)
Docs: []
---

# CLI artifacts commands: all verbs, --json everywhere, auto-generated from tRPC schema

## Parent
PRD: `.scratch/agent-os-vision/prds/10-artifacts.md` (Surfaces: CLI; issues 10-08)

## What to build
Wire all `fulcrum artifacts <verb>` CLI commands via tRPC codegen (per Q-cli-shape). Commands: `list`, `show`, `upload`, `download`, `attach`, `detach`, `archive`, `unarchive`, `delete`, `prune`. All support `--json` flag outputting typed JSON matching tRPC output schema. `prune` adds `--dry-run` and `--project-id` flags; requires `--confirm` for >100 MB/100 files. `delete` adds `--hard` flag. `download` adds `--out <path>` flag. All use `fulcrum artifacts` namespace in the auto-generated command tree.

## Acceptance criteria
- [ ] Schema migration: N/A.
- [ ] tRPC procedure / module: all procedures callable via CLI; codegen emits correct flag types from Zod schemas.
- [ ] Web surface: N/A (CLI-only slice).
- [ ] CLI command: `fulcrum artifacts list --json` returns `ArtifactRow[]`; `fulcrum artifacts prune --dry-run` prints candidates; `fulcrum artifacts download <id> --out /tmp/x` writes file; all commands print help with `--help`; `--json` on every command outputs machine-parseable JSON.
- [ ] TUI screen: N/A.
- [ ] Tests: each CLI command unit-tested with mock tRPC client; `--json` output validated against Zod schema; `prune` confirm gate unit-tested (>100 files → requires `--confirm`); `download` streams correct bytes to `--out` path; RED→GREEN.

## Blocked by
- `06-trpc-procedures.md` — tRPC procedures as source of truth for codegen.
- Pillar 14 (CLI codegen) — auto-codegen pipeline; can hand-wire thin wrappers if Pillar 14 not yet complete.

## Notes / Tech-stack hints
- Per Q-cli-shape: codegen reads tRPC + Zod → emits `fulcrum artifacts <verb>` command tree. Until Pillar 14 lands, hand-write thin wrappers calling `trpcClient.artifacts.<verb>()`.
- `--json` flag should set `process.env.FULCRUM_JSON=1` or be passed through to tRPC client formatter.
- `detach` and `attach` flags: `--from-task|--from-run|--from-doc` and `--to-task|--to-run|--to-doc` with `<target-id>`.
- All `delete` operations default to soft (archived); `--hard` sends `{ hard: true }` to procedure.
