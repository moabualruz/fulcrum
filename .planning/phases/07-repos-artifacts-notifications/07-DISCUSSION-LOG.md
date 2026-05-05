# Phase 7: Repos + Artifacts + Notifications - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-05
**Phase:** 7-Repos + Artifacts + Notifications
**Areas discussed:** Repository sync/dashboard, Artifact lifecycle, Notification delivery, Dependency policy, TDD/verification
**Mode:** `--all --auto` — all gray areas selected; recommended defaults auto-chosen.

---

## Repository Sync + Dashboard

| Option | Description | Selected |
|--------|-------------|----------|
| Verify existing watcher first | Keep current `node:fs.watch` path and prove 2s sync; add `chokidar` only if tests show flakiness | ✓ |
| Replace watcher now | Add `chokidar` immediately and rewrite watcher path | |
| Defer watcher proof | Trust existing implementation without platform proof | |

**User's choice:** Auto-selected recommended default.
**Notes:** Requirement says watcher already implemented; verification-first avoids unnecessary dependency and matches reuse-first policy.

---

## Artifact Lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Actions artifact UX | Detail shows run link, digest, preview/download, retention/expiration, delete/archive | ✓ |
| Minimal file list | Only list/download artifacts | |
| Full media pipeline | Add broad previews for many binary formats | |

**User's choice:** Auto-selected recommended default.
**Notes:** Narrow PNG/text preview keeps Phase 7 scoped while meeting ART-05.

---

## Notification Delivery

| Option | Description | Selected |
|--------|-------------|----------|
| Local-first Novu/Sentry-inspired pipeline | Event -> rule -> notification -> delivery rows -> channel workers | ✓ |
| Adopt Novu runtime | Add Novu as notification platform dependency | |
| Simple direct send | Send channels inline from event producers | |

**User's choice:** Auto-selected recommended default.
**Notes:** Existing entities/workers make platform adoption unnecessary. Inline sends would break reliability and quiet-hours retry.

---

## Dependency Policy

| Option | Description | Selected |
|--------|-------------|----------|
| Add only proven channel/watcher deps | `nodemailer` for SMTP, `web-push` for push, `chokidar` only if watcher proof fails | ✓ |
| Add broad notification platform | Pull in `@novu/*` packages | |
| Build all protocols manually | No dependencies even for SMTP/Web Push | |

**User's choice:** Auto-selected recommended default.
**Notes:** Minimizes custom protocol code without duplicating Fulcrum persistence.

---

## TDD / Verification

| Option | Description | Selected |
|--------|-------------|----------|
| RED tests for required risk points | LRU cron, watcher SLA, pruner, delivery handlers, quiet-hours retry, parity | ✓ |
| Implementation first | Add tests after features work | |
| Manual verification only | Rely on UI/manual checks | |

**User's choice:** Auto-selected recommended default.
**Notes:** TST-10 requires TDD woven into every phase.

---

## Agent Discretion

- Exact cron interval names and job payload schemas.
- Repo dashboard default layout: cards vs table.
- Exact delivery enum names if compatible with existing entities/tests.
- Whether push worker sends real Web Push immediately or records degraded state until VAPID config exists.

## Deferred Ideas

- Full notification workflow designer UI.
- Slack/Discord notification channels.
- General binary/media preview pipeline.
- Hosted remote repository cache service.
