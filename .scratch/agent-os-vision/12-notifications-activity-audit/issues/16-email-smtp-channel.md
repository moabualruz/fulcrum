---
Status: completed
ImplRuntime: claude
Triage: AFK
Pillar: notifications-activity-audit
Blocked-by: [04-fanout-worker.md, 07-quiet-hours.md]
PRD: .scratch/agent-os-vision/prds/12-notifications-activity-audit.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 12 section)
Decisions: [C1, Q26, D5]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Notifications / activity feed row)
Docs: []
---

# Gated: notify-email SMTP channel — nodemailer + Eta template + delivery row + rate limiter + email verify

## Parent
PRD: `.scratch/agent-os-vision/prds/12-notifications-activity-audit.md` (Issues T12-29, T12-30, T12-31)

## What to build
When `FULCRUM_FEATURES=notify-email` ON: register `notify-deliver-email` graphile-worker task; `@Injectable()` `EmailNotificationDispatcher` (needle-di) sends via `nodemailer` transport with Eta v3 template; persists `NotificationDelivery` with `status='sent'|'failed'`; rate limiter (>N/hr → `status='suppressed'`); email verify flow: token generated on settings save, confirm link sets `email_verified=true` on user, unverified → delivery suppressed. Flag OFF → no SMTP calls.

## Acceptance criteria
- [ ] Schema migration: reads `NotificationDelivery`; reads/writes `User.emailVerified`.
- [ ] tRPC procedure / module: `notify-deliver-email` graphile-worker task + `@Injectable()` transport factory in `src/notifications/channels/email.ts`; `notify.channels.config` for SMTP settings.
- [ ] Web surface: channels config page shows email verify status; confirm link in email sets `email_verified`; unverified badge shown.
- [ ] CLI command: `fulcrum notify channels test email` sends test email when flag ON; shows delivery status.
- [ ] TUI screen: Settings channels section shows email config + verify status.
- [ ] Tests: flag OFF → no nodemailer calls; ON → email sent via mock transport; `status='sent'`; SMTP failure → `status='failed'` + `last_error`; rate limit >5/hr → `status='suppressed'`; unverified → suppressed; verify token → confirm → `email_verified=true`; quiet-hours respected (delivery held); RED→GREEN.

## Blocked by
- `04-fanout-worker.md` — fan-out enqueues `notify-deliver-email`.
- `07-quiet-hours.md` — quiet-hours suppression.

## Notes / Tech-stack hints
- Failure gate: `nodemailer` TLS/auth issues → `emailjs` (MIT) drop-in; transport factory pattern in `email.ts`.
- Rate limiter: `notificationDeliveryRepo.countRecent({ user, channel: 'email', since: oneHourAgo })`; if >N → `status='suppressed'`.
- Eta v3 template: `src/notifications/templates/email.eta` with `{{it.title}}`, `{{it.body}}`, entity link.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` env vars; validated on channel config save.
