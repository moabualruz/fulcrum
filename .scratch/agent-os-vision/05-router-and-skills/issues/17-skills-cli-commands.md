---
Status: ready-for-agent
Triage: AFK
Pillar: 05-router-and-skills
Blocked-by: 16-skills-trpc-procedures
---

# CLI fulcrum skills * commands + daily cron install (gated)

## Parent: PRD `prds/05-router-and-skills.md`

## What to build

Implement all `fulcrum skills` CLI commands via tRPC bindings: `list`, `install`, `upgrade`, `uninstall`, `sync`, `conflicts list`, `conflicts resolve`. Add `--json` output to every command. Also implement the gated daily cron install: when `FULCRUM_FEATURES=skills-daily-sync` is ON, `fulcrum skills sync --daily --install-cron` writes an idempotent cron entry (macOS launchd plist or Linux cron line) that runs `fulcrum skills sync --fetch-upstream` daily. When flag is OFF, `--install-cron` flag is rejected.

## Acceptance criteria

- [ ] Schema / module: `src/cli/commands/skills.ts` implements all `fulcrum skills` subcommands
- [ ] Logic: `skills list --json` parses as valid `FulcrumSkill[]`
- [ ] Logic: `skills sync --fetch-upstream` calls `skills.sync` tRPC; prints merged/conflicts/errors counts
- [ ] Logic: `skills conflicts resolve <slug> --keep upstream` clears conflict; subsequent `conflicts list` omits the slug
- [ ] Logic: `skills conflicts list` shows slugs with pending conflicts; exits 0 with empty list when no conflicts
- [ ] Logic: `FULCRUM_FEATURES=skills-daily-sync` ON + `--install-cron` → writes cron entry; idempotent (running twice writes one entry)
- [ ] Logic: flag OFF + `--install-cron` → error message + exit 1
- [ ] Logic: cron entry absent when flag OFF (no prior install)
- [ ] Surfaces parity: `--json` outputs match tRPC schema identically to Web API responses
- [ ] Tests: `--json` output validation for `list`, `sync`, `conflicts list`
- [ ] Tests: cron entry idempotency test (write twice → one entry)
- [ ] Tests: `--install-cron` rejected when flag OFF

## Blocked by

- `16-skills-trpc-procedures`

## Notes

Cron implementation: macOS writes a `~/Library/LaunchAgents/com.fulcrum.skills-sync.plist`; Linux writes a line to `~/.config/cron/fulcrum-skills-sync` and calls `crontab -l | ... | crontab -`. Both idempotent by checking for existing entry before writing.
