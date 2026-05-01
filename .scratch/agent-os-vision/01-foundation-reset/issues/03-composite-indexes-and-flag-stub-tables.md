---
Status: needs-review
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: 02-events-org-id-backfill
Owner: claude-orchestrator
ClaimedAt: 2026-05-01T04:30:00Z
ReviewVerdict: PENDING — P1#03 follow-up applied: EXPLAIN Index Scan assertions (Finding 1), C11 citation (Finding 2), C10 column trim for WebhookSubscription + NotificationRule (Finding 3). Supersedes d24eb47.
---

# Composite (org, …) index decorators + flag-stub entities (two migration classes)

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Two MikroORM migration classes applied in order:

**`Migration<timestamp>_composite_indexes.ts`** — emitted from `@Index({ properties: ['org', ...] })` decorators added to all tenant-scoped entities (`Task`, `Document`, `Memory`, `AgentRun`, `Artifact`, `Repo`, `Job`, `SearchDocument`). Pure decorator diff — no `addSql` body needed; MikroORM emits the DDL automatically.

**`Migration<timestamp>_flag_stubs.ts`** — emitted from new entities under `src/db/entities/flags/`: `CasbinRule`, `WebhookSubscription`, `NotificationRule`. All three are inert by default; rows are written only when their respective feature flags (`casbin-policies`, `outbound-webhooks`, `notify-email`/`notify-webhook`/`notify-slack`) are enabled by a later pillar at runtime via repository calls.

Cuts through: entity decorator updates → `mikro-orm migration:create` × 2 → migrator runs → EXPLAIN tests via QueryBuilder → entity-metadata + repo-count tests.

## Acceptance criteria
- [ ] Entities: composite `@Index({ properties: [...], name: '...' })` decorators present on `Task`, `Document`, `Memory`, `AgentRun`, `Artifact`, `Repo`, `Job`, `SearchDocument` per PRD list. `CasbinRule`, `WebhookSubscription`, `NotificationRule` entities decorated with `@Entity`, `@PrimaryKey`, `@Property`, `@ManyToOne`, `@Index` per PRD schema section.
- [ ] Migration classes: both classes auto-generated; `migrator.up()` runs both idempotently on PGlite + Postgres. Stub entity tables (`casbin_rule`, `webhook_subscriptions`, `notification_rules`) exist with zero rows on fresh install.
- [ ] Server action / migration runner: `MikroORM.getMigrator().up()` applies both classes.
- [ ] Web surface: N/A — pure schema.
- [ ] CLI command: N/A — pure schema.
- [ ] TUI screen: N/A — pure schema.
- [ ] Tests: `tests/db/migrations/composite-indexes.test.ts` — for each tenant-scoped entity, build a QueryBuilder with `org` predicate, run `em.getConnection().execute('explain ' + qb.getQuery())`, assert plan uses Index Scan (not Seq Scan). `tests/db/migrations/flag-stubs.test.ts` — assert `em.getMetadata().get(CasbinRule)` / `WebhookSubscription` / `NotificationRule` registered with correct property count; assert `casbinRuleRepo.count() === 0`, `webhookSubscriptionRepo.count() === 0`, `notificationRuleRepo.count() === 0` post-seed. RED → GREEN.

## Blocked by
- `02-events-org-id-backfill` (all earlier entities must exist before adding indexes to them).

## Notes
`CasbinRule` is consumed by Pillar 5 (Permissions) via the `FulcrumCasbinAdapter` (custom node-casbin adapter implementing the 5-method interface against `EntityRepository<CasbinRule>`, ~200 LOC, registered as `@Injectable()`). `WebhookSubscription` + `NotificationRule` are consumed by Pillar 10 (Notifications/Webhooks). Stub entities live here so those pillars never need a schema migration of their own for the base tables.
