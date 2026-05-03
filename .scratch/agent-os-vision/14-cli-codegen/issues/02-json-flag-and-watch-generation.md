---
Status: implemented
Triage: AFK
Pillar: cli-codegen
Blocked-by: [14/issues/01-codegen-scaffold.md]
PRD: .scratch/agent-os-vision/prds/14-cli-codegen.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 14 section)
Decisions: [Q-cli-shape, C4, D5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md ("Three surfaces, all shipped" row)
Docs: []
---

## Parent

Pillar 14 — CLI (Auto-Codegen from tRPC)

## What to build

Extend codegen to emit `--json` flag on every generated command and `--watch` flag on subscription procedures. `--json` behavior: write single JSON object/array to stdout, exit 0; on error write `{ "error": { "code": "<code>", "message": "<msg>" } }` to stdout + exit non-zero. `--watch` behavior: subscribe via tRPC WebSocket transport; stream JSON objects one per line to stdout; exit cleanly on `CTRL+C`. Error model: exit codes 0–7 defined and stable (see PRD error model table); documented in `docs/cli-exit-codes.md`. Error log: every command invocation appended to `~/.fulcrum/state/cli-history.jsonl`; crashes written to `~/.fulcrum/state/errors/YYYY-MM-DD.jsonl`.

- **Web**: not applicable.
- **CLI**: `fulcrum tasks list --json` → typed JSON; `fulcrum runs get <id> --watch` → streaming JSON lines.
- **TUI**: not applicable — TUI uses in-process tRPC.

## Acceptance criteria

- [ ] Every generated command: `--json` flag present in `--help` output; `--json` produces parseable JSON (validated with `jq .` in test).
- [ ] `--watch` generated for all `subscription` procedure types; `fulcrum runs get <id> --watch` streams JSON lines; `CTRL+C` exits without hang.
- [ ] Exit codes: unit test covers codes 0–7 with one case each; `--json` error shape consistent across all codes.
- [ ] CLI history log: `~/.fulcrum/state/cli-history.jsonl` appended per invocation; contains `command`, `args`, `exitCode`, `durationMs`.
- [ ] Crash handler: throw unhandled rejection → `errors/YYYY-MM-DD.jsonl` written; message printed; exit 1.
- [ ] `docs/cli-exit-codes.md` created listing all exit codes with condition + example.

## Blocked by

- 14/issues/01-codegen-scaffold.md

## Notes

P14.03–P14.04 + P14.35–P14.37 maps to this slice.
