---
Status: implemented
ImplRuntime: claude
Triage: AFK
Pillar: notifications-activity-audit
Blocked-by: [05-trpc-notify-procedures.md]
PRD: .scratch/agent-os-vision/prds/12-notifications-activity-audit.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 12 section)
Decisions: [Q26, Q-cli-shape, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Notifications / activity feed row)
Docs: []
---

# CLI notify commands: list/read/mark-read/mute/unmute + rules * + channels * — --json everywhere

## Parent
PRD: `.scratch/agent-os-vision/prds/12-notifications-activity-audit.md` (Issues T12-20, T12-21, T12-22)

## What to build
All `fulcrum notify <verb>` CLI commands via tRPC codegen (Q-cli-shape). `notify list [--unread] [--limit] [--offset] [--json]`; `notify read <id>`; `notify mark-read <id>|--all`; `notify mute <subject-kind> <subject-id> [--until <ISO>]`; `notify unmute <subject-kind> <subject-id>`; `notify rules list/get/create/update/delete` with `--pattern <json>`, `--channels <csv>`, `--enable`/`--disable` flags; `notify channels list/config/test` with `--url`, `--secret` flags. All `--json` returns typed JSON matching tRPC schema.

## Acceptance criteria
- [ ] Schema migration: N/A.
- [ ] tRPC procedure / module: codegen or thin wrappers; all procedures reachable.
- [ ] Web surface: N/A.
- [ ] CLI command: `fulcrum notify list --unread --json` returns `UserNotification[]`; `fulcrum notify mark-read --all` clears all; `fulcrum notify mute task <id> --until 2026-12-31 --json` returns mute row; `fulcrum notify rules create --name "test" --pattern '{"subject_kind":"task","verb":"created"}' --channels "in-app,email"` creates rule; `fulcrum notify channels test email` sends test delivery; all `--help` flags work.
- [ ] TUI screen: N/A.
- [ ] Tests: each command unit-tested with mock tRPC; `--json` schema validated; `--unread` flag filters; `--all` mark-read clears; mute `--until` parses ISO date; channels `--secret` masked in output; RED→GREEN.

## Blocked by
- `05-trpc-notify-procedures.md` — all `notify.*` procedures.

## Notes / Tech-stack hints
- `notify channels config email --url smtp://... --secret ...`: secret encrypted via `credentials` table before storage; never echoed in CLI output.
- `notify rules create --pattern`: validate JSON against rule pattern Zod schema before sending; show helpful error if invalid.
- Per Q-cli-shape: use codegen where possible; hand-write interactive flows (e.g. `channels test` which may show delivery status).
