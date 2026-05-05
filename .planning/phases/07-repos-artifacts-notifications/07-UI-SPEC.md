# Phase 7: Repos + Artifacts + Notifications - UI Spec

**Date:** 2026-05-05
**Status:** Ready for planning

## Design Intent

Phase 7 UI must feel like an operational control room for local repos, run outputs, and delivery state. Screens prioritize status, freshness, failure visibility, and fast drill-down over marketing-style dashboards.

## Required Surfaces

### Multi-Repo Dashboard
- Default view: dense table with optional card summary row.
- Each repo row shows: name, local path/remote URL, branch, dirty/diverged indicator, last sync time, sync health, recent commit, open linked tasks count, manual sync action.
- Detail tabs: Overview, Branches, Commits, Files, Sync Log.
- Empty state: clear call to register repo; no decorative filler.
- Error state: stale sync/failed sync visible inline with retry action.

### Artifact List + Detail
- List filters: project, run, kind, mime, retention status, archived/pruned state.
- Detail page matches GitHub Actions artifact mental model: source run link, digest/checksum, size, mime, created time, retention policy, expiration/prune status, preview, download, archive/delete.
- Preview: PNG/image inline; text/markdown/code inline with sanitization; unsupported binaries show metadata and download.
- Run detail page must show produced artifacts via edges.

### Notifications Inbox + Rules
- Inbox shows last 50 notifications by default, unread state, source event, severity/type, created time, mark-read action, mute action.
- Bell badge counts unread user notifications only.
- Rules UI fields: event/trigger filter, recipient/user scope, channel selection, quiet hours, enabled flag, test/dry-run.
- Channels page shows delivery status for in-app, email, webhook, push, with degraded states when config missing.
- Webhook page shows endpoint, HMAC status, last delivery, attempts, response code/error excerpt, retry/resend action.

### TUI Parity
- TUI repos screen: repo list, selected status, branches/commits summary, sync action.
- TUI artifacts screen: list, filters, metadata preview summary, download path/action.
- TUI notifications screens: inbox, unread count, mark read, mute, rules list, quiet-hours display.

### CLI Parity UX
- All repo/artifact/notification commands support `--json`.
- Human output is compact table by default; JSON output uses stable keys matching tRPC response schemas.

## Interaction Behaviors

- Manual sync buttons enqueue jobs and immediately show queued/running state.
- Retention delete/prune actions require explicit confirmation in Web; CLI requires force flag for destructive delete.
- Notification rule dry-run shows matched sample events, target recipients, and delivery channels before save.
- Quiet-hours held deliveries show next retry time.
- Webhook failures expose retryable vs permanent failure status.

## Accessibility

- All tables support keyboard row focus and visible focus ring.
- Status colors must be paired with text labels/icons.
- Bell badge has accessible label containing unread count.
- Destructive artifact actions require labeled confirmation controls.

## Visual Direction

- Reuse existing shadcn-svelte/Bits UI primitives and project theme tokens.
- Avoid large chart-first dashboard; use compact operational panels with strong status hierarchy.
- Severity/status palette: healthy, stale, failed, queued, running, held, pruned. Use semantic tokens where available.

## Out of Scope

- Workflow designer UI for notifications.
- General binary preview pipeline.
- Slack/Discord channel management.
- Hosted repo cache management UI.

## Canonical Inputs

- `.planning/phases/07-repos-artifacts-notifications/07-CONTEXT.md`
- `.planning/phases/07-repos-artifacts-notifications/07-RESEARCH.md`
- `.planning/REQUIREMENTS.md` REP-01..07, ART-01..06, NTF-01..09
