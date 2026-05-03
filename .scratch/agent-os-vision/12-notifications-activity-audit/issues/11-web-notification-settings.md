---
Status: implemented
ImplCommit: unavailable-sandbox-git-index-lock
ImplRuntime: codex
Triage: AFK
Pillar: notifications-activity-audit
Blocked-by: [05-trpc-notify-procedures.md, 07-quiet-hours.md]
PRD: .scratch/agent-os-vision/prds/12-notifications-activity-audit.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 12 section)
Decisions: [Q26, C4]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Notifications / activity feed row)
Docs: []
---

# Web /settings/notifications: rules CRUD + channel toggles + quiet-hours + mute list + channels config

## Parent
PRD: `.scratch/agent-os-vision/prds/12-notifications-activity-audit.md` (Issues T12-13, T12-14, T12-15, T12-16, T12-17)

## What to build
SvelteKit `/settings/notifications` page with 4 sub-sections:

1. **Rules list** — shows all rules (4 defaults + user-created); toggle enable/disable; delete; "Add rule" button.
2. **Rule create/edit form** — pattern builder (kind/verb/payload fields), channel multi-select (in-app always on), save.
3. **Quiet-hours panel** — tz picker, start/end hour sliders, days-of-week toggles, save + preview "Active now: yes/no".
4. **Mute list** — list of `notification_mutes`; "Mute until" date; remove mute.
5. **Channels config** (`/settings/notifications/channels`) — per-channel config: email verify (token sent, confirmed), webhook URL + masked secret, Slack URL, Discord URL, push subscribe button.

## Acceptance criteria
- [ ] Schema migration: N/A.
- [ ] tRPC procedure / module: all `notify.*` CRUD procedures consumed.
- [ ] Web surface: rules list shows 4 defaults; toggle enable/disable works; rule create form saves round-trip; quiet-hours save + load; mute list shows/remove mutes; channels config: email verify token → confirm → `email_verified`; webhook secret masked; push subscribe stores `push_subscriptions` row; Playwright: create rule, disable, delete.
- [ ] CLI command: N/A (settings page is Web UI).
- [ ] TUI screen: N/A (TUI settings in separate slice).
- [ ] Tests: rule CRUD unit tests; quiet-hours save/load round-trip; "Active now" indicator correct; channels email verify token flow (mock SMTP); push subscription stored; mute add/remove; RED→GREEN.

## Blocked by
- `05-trpc-notify-procedures.md` — all `notify.*` procedures.
- `07-quiet-hours.md` — quiet-hours logic.

## Notes / Tech-stack hints
- Pattern builder UI: shadcn-svelte `Select` for kind/verb; `Input` for payload path/value; `+` button adds more conditions.
- Channel multi-select: list of registered channels; in-app always checked (disabled toggle).
- Webhook secret: shown masked (first 4 chars + `***`); "Reveal" button decrypts via `credentials` table (Pillar 1).
- Email verify: sends link to user's email; confirm endpoint sets `email_verified=true` on `users` (Better-Auth).
