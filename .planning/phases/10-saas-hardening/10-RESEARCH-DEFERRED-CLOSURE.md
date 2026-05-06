# Phase 10: Deferred Closure Research

**Researched:** 2026-05-06
**Purpose:** Import every explicit deferred item from Phases 2-9 into Phase 10 closure scope and map it to implementation plans.

## Closure Inventory

| ID | Source | Deferred item | Phase 10 handling |
|---|---|---|---|
| CLOSURE-01 | Phase 2 `02-CONTEXT.md` | BUG-17 local main sync/repo hygiene and final milestone merge readiness | Plan 10-10: repo hygiene report, merge readiness checks, no push to `main` without user request |
| CLOSURE-02 | Phase 2 `02-08-SUMMARY.md` | CLI interactive `login` and `logout` stubs | Plan 10-10: real session lifecycle or remove public stub surface |
| CLOSURE-03 | Phase 3 `03-CONTEXT.md` | External tracker dispatch parity for Linear/GitHub Issues | Plan 10-12: dispatch-capable adapters or explicit disabled ingest-only state |
| CLOSURE-04 | Phase 4 summaries | INF-02 Linux static proof and `z.any()` public schema gap | Plan 10-10: Docker/native Linux proof gate and public schema cleanup |
| CLOSURE-05 | Phase 6 `06-CONTEXT.md` | MEM-09 repo-state context bundle placeholder | Plan 10-10: use Phase 7 repo state in context bundles |
| CLOSURE-06 | Phase 6 `06-CONTEXT.md` | Named document version tags | Plan 10-11: git-like tags for doc versions |
| CLOSURE-07 | Phase 6 `06-CONTEXT.md` | AI-powered search/Q&A and optional Meilisearch backend | Plan 10-11: deterministic optional adapter plus gated Q&A, PGlite/Orama default |
| CLOSURE-08 | Phase 5 `05-CONTEXT.md` | Time tracking/time entries/timesheets | Plan 10-11: task time-entry model and Web/CLI/TUI parity |
| CLOSURE-09 | Phase 5 `05-CONTEXT.md` | Custom dashboard builder | Plan 10-11: widget dashboard builder with saved layout |
| CLOSURE-10 | Phase 5 `05-CONTEXT.md` | Scheduled email report delivery | Plan 10-11: graphile-worker schedule + notification delivery |
| CLOSURE-11 | Phase 5 `05-CONTEXT.md` | Multi-assignee per task | Plan 10-11: assignment join table plus watcher compatibility |
| CLOSURE-12 | Phase 5 `05-CONTEXT.md` | Chart export to PNG/PDF | Plan 10-11: report export workers and CLI/Web/TUI status |
| CLOSURE-13 | Phase 5 `05-CONTEXT.md` and `05-RESEARCH-GAPS.md` | Goals/OKRs, task merge, form-based templates, Email/Slack task creation | Plan 10-11 and 10-12: task/product closure features plus inbound channel adapters |
| CLOSURE-14 | Phase 7 `07-CONTEXT.md` | Notification workflow designer UI and Slack/Discord channels | Plan 10-12: workflow designer plus `@slack/bolt`/`discord.js` gated adapters |
| CLOSURE-15 | Phase 7 research/context | General binary/media previews, artifact signing/attestation, hosted repo cache, ntfy connector | Plan 10-12: preview pipeline, `sigstore`, remote cache, `ntfy` |
| CLOSURE-16 | Phase 8 `08-CONTEXT.md` | CLI framework migration, `--jq`, `--template`, Web design polish, hosted API gateway/tier billing | Plan 10-12 and 10-13: CLI decision/gates, billing/API gateway, Huashu Web/CLI/TUI gate |
| CLOSURE-17 | Phase 9 `09-CONTEXT.md` | Optional Sentry/Datadog/OTel, theme builder, representative l10n, SIEM export, encryption verification | Plan 10-12: local-first gated adapters and vault verification |
| CLOSURE-18 | Phase 8/9 UI specs | Final Web/CLI/TUI system design review | Plan 10-13: Huashu review score gates and source tests |

## Platform Patterns

| Domain | Platforms researched | Pattern to copy |
|---|---|---|
| CLI | GitHub CLI, Commander.js, oclif | Keep scriptable verbs, `--json`, optional `--jq`, optional template output, deterministic exit codes. |
| Slack task creation | Slack Bolt for JavaScript | App events/interactivity endpoint, signing-secret verification, explicit team/workspace mapping, task create from message/thread shortcut. |
| Discord task creation | Discord application commands | Slash commands and interaction payload verification; avoid message scraping as primary UX. |
| Billing/API gateway | Stripe Billing, Sentry/Jira rate limits | Local entitlement model first, Stripe adapter behind config, per-org/API-key quotas with response headers. |
| Search scale | Meilisearch, Orama, PGlite FTS | PGlite/Orama remains default; Meilisearch optional adapter for larger hosted deployments. |
| Artifact provenance | npm provenance, Sigstore | Store and verify signed provenance/attestation metadata without requiring signing for local-only artifacts. |
| Observability/SIEM | OpenTelemetry, Sentry/Datadog, JSON/CSV audit export | Local ErrorLog/audit remains source of truth; exporters are opt-in adapters. |
| Push/self-host channels | ntfy | Gated self-host push adapter with topic auth and delivery status. |
| Inbound email | Cloudflare Email Workers, Postmark inbound webhook | Accept normalized inbound email payloads, verify provider signature where available, convert to task intake forms. |

## Dependency Decisions

| Package | Version verified | Decision |
|---|---:|---|
| `@slack/bolt` | 4.7.2 | Adopt behind Slack connector flag for task creation and notifications. |
| `discord.js` | 14.26.4 | Adopt behind Discord connector flag for slash-command task creation and notifications. |
| `commander` | 14.0.3 | Preferred CLI framework if migration chosen because current CLI can move incrementally. |
| `@oclif/core` | 4.11.0 | Keep as alternative only if plugin-style CLI architecture is needed; larger migration. |
| `stripe` | 22.1.0 | Adopt only for hosted billing adapter; local entitlements work without Stripe. |
| `meilisearch` | 0.58.0 | Optional server-side search adapter. |
| `@meilisearch/instant-meilisearch` | 0.31.1 | Optional Web search integration if hosted Meilisearch UI path selected. |
| `sigstore` | 4.1.0 | Adopt for artifact attestation verify/sign operations. |
| `@opentelemetry/api` | 1.9.1 | Adopt for API-level spans if needed; avoid SDK as default dependency. |
| `argon2` | 0.44.0 | Adopt only if vault verification requires migration away from PBKDF2. |
| `@cloudflare/workers-types` | 4.20260506.1 | Use for optional inbound-email adapter types/tests, not core runtime. |
| `@sendgrid/mail` | 8.1.6 | Keep optional; existing SMTP/nodemailer path remains default outbound delivery. |

## Integration Map

| Flow | Producer | Shared service/API | Consumers |
|---|---|---|---|
| Slack/Discord/email task creation | Connector webhook/interaction handler | `TaskService.createFromIntake()` + form-template validation | Web inbox, CLI intake status, TUI inbox, audit events |
| Goals/OKRs progress | Task/project events + metrics rollup | `GoalService` + `metrics_snapshots` | Web goals tree, CLI goals JSON, TUI goals panel, reports |
| Multi-assignee | Task mutation | assignment repository + watcher compatibility | Board/list/table/card, CLI task update, TUI task detail, notifications |
| Time entries | Timer/manual entry mutation | `TimeEntryService` + reports | Web timesheet, CLI time commands, TUI timer/status, scheduled reports |
| Artifact attestation | Artifact harvest/sign/verify | `ArtifactAttestationService` | Web artifact detail, CLI artifacts verify, TUI artifact status, SIEM export |
| Hosted billing/API quotas | API gateway middleware | `EntitlementService`, `UsageMeterService`, `BillingAdapter` | Web billing/settings, CLI billing/status, TUI quota panel, API headers |
| Huashu UX gate | Route/source/test inspection | `10-UI-SPEC.md` contracts | Web e2e/a11y, CLI snapshot tests, TUI FakeTTY tests |

## Files That Must Not Break

- `scripts/ci.ts` — remains local CI source of truth.
- `src/trpc/router.ts`, `src/server/trpc/**` — shared API contract, no surface-only business logic.
- `src/cli/index.ts`, `src/cli/commands/**` — every added command must preserve `--json`.
- `src/tui/**` — keyboard/plain-text behavior and no direct DB imports from screens.
- `src/web/src/routes/**` — operational console vocabulary, no marketing route patterns.
- `src/notifications/**`, `src/artifacts/**`, `src/repos/**`, `src/search/**`, `src/memory/**` — existing local-first behavior remains default.

## Sources

- Slack Bolt: https://docs.slack.dev/tools/bolt-js/creating-an-app
- Slack Web API reference: https://docs.slack.dev/tools/bolt-js/reference/
- Discord interactions/application commands: https://docs.discord.com/developers/interactions/application-commands
- Commander.js: https://www.npmjs.com/package/commander
- Stripe Subscriptions API: https://docs.stripe.com/api/subscriptions/object
- Meilisearch JavaScript SDK: https://www.meilisearch.com/docs/getting_started/sdks/javascript
- Sigstore: https://docs.sigstore.dev/
- npm provenance: https://docs.npmjs.com/generating-provenance-statements
- OpenTelemetry JavaScript: https://opentelemetry.io/docs/languages/js/
- ntfy API: https://docs.ntfy.sh/subscribe/api/
- Cloudflare Email Workers: https://developers.cloudflare.com/email-routing/email-workers/
- Postmark inbound webhook: https://postmarkapp.com/developer/webhooks/inbound-webhook
