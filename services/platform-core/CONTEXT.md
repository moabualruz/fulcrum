# Platform Core

Shared platform infrastructure for the Fulcrum agent OS: tenant settings, the skills registry, the job queue, the domain-event outbox, encrypted credentials, inference model cache, and the schema migration ledger. Every other bounded service builds on these primitives.

## Language

**TenantSetting**:
A per-org key/value record holding org-scoped configuration in a jsonb value.
_Avoid_: org config, preferences, options, kv-store entry

**ExperimentAssignment**:
A sticky assignment of a subject (user/org) to an experiment variant produced by the evaluation engine.
_Avoid_: bucket, cohort, A/B group

**FulcrumSkill**:
A registry entry naming a skill, its `SkillSource` (`upstream | local | package`), and the agents it is enabled for.
_Avoid_: plugin, command, prompt template, recipe

**SkillVersion**:
An immutable revision of a `FulcrumSkill` content body identified by hash; pointed at by sync runs.
_Avoid_: skill release, snapshot

**SkillConflict**:
A persisted record of an upstream merge clash or sha mismatch detected during skill sync, with `kind` and `status`.
_Avoid_: sync error, drift, sha failure

**Job**:
A queued unit of background work (`queue`, `kind`, `payload`, `status`, `scheduledFor`, `maxAttempts`) executed by the jobs runtime.
_Avoid_: task, ticket, work item, message

**DomainEventOutbox**:
A transactional outbox row (`verb`, `subjectKind`, `subjectId`, `eventKey`, `payload`) holding a domain event until a dispatcher marks `processedAt`.
_Avoid_: queue message, pending event, notification

**Event**:
The canonical append-only audit record of state change (`actor`, `verb`, `subjectKind`, `subjectId`, `fieldName`, `fromValue`, `toValue`).
_Avoid_: log entry, history row, change-feed item

**TelemetryEvent**:
An org-scoped product-analytics event (`kind`, `payload`, `occurredAt`) distinct from audit `Event`.
_Avoid_: metric, audit log, analytics row

**Credential**:
An encrypted secret blob (`encryptedValue` ciphertext + `algo` + `kdf`) owned by an (org, user) pair.
_Avoid_: secret, token, api key, password

**ModelCache**:
A row tracking a locally downloaded inference model (`modelId`, `kind` `embed|generate|classify`, `source`, `sha256`, `active`).
_Avoid_: model registry, weights record, download

**SchemaMigration**:
An audit row in `fulcrum_schema_migrations` recording an applied migration `version`, `name`, `checksum`, and `direction` (`up|down`).
_Avoid_: migration record, version row, ledger entry

**DatabaseRuntime**:
The selected product database execution mode: managed local PGlite under `FULCRUM_HOME` or PostgreSQL from `FULCRUM_DATABASE_URL` / `DATABASE_URL`, while keeping one TypeORM entity and migration set.
_Avoid_: database mode fork, schema branch, local-only database

**ComponentLedger**:
The SQLite store at `~/.fulcrum/state/global/components.db` recording component status, surfaces, artifacts, operations, and operation steps.
_Avoid_: install log, state file, db

**HookEnvelope**:
A JSON payload read on stdin by a `fulcrum hook <name>` subcommand; shape varies by event (`SessionStart | PreToolUse | PostToolUse | SessionEnd`).
_Avoid_: hook input, hook message, hook event

## Relationships

- An **Org** owns many **TenantSettings**, **FulcrumSkills**, **Jobs**, **Credentials**, **Events**, **TelemetryEvents**, **ModelCaches**, and **DomainEventOutbox** rows.
- Feature flag registry, evaluation, rollout policy, and experiments belong to the **feature-flags** service.
- A **FulcrumSkill** has many **SkillVersions** and zero-or-many **SkillConflicts** keyed by `slug`.
- A **Credential** belongs to exactly one (**Org**, **User**) pair and is uniquely named within it.
- A **Job** belongs to one **Org**, optional `projectId`, one `queue`, and one `kind`.
- A **DomainEventOutbox** row is dispatched once → produces a downstream effect → marked `processedAt`; an **Event** is appended for audit and never reprocessed.
- A **SchemaMigration** row exists per applied **TypeORM migration**; the ledger is append-only.
- A **DatabaseRuntime** selects the connection target only; it does not select a different schema, entity list, or migration list.
- The **ComponentLedger** records every install of a **Surface** (skill sync, hook registration, mcp entry, sentinel block, …).

## Example dialogue

> **Dev:** "When the agent fires a `pm-policy` **HookEnvelope** and we want to record it, do we write a **DomainEventOutbox** row or an **Event**?"
> **Domain expert:** "Neither directly — `audit-log` writes an **Event** for the shell command. **DomainEventOutbox** is only for state changes other services subscribe to; **TelemetryEvent** is for product analytics."
> **Dev:** "And the **FulcrumSkill** sync drift — that goes where?"
> **Domain expert:** "A **SkillConflict** row keyed by `slug`, plus a **ComponentLedger** entry for the sync operation. The skill itself stays at its current **SkillVersion**."

## Flagged ambiguities

- "skill" was used to mean both a **FulcrumSkill** registry row and an on-disk SKILL.md authored under `skills/<name>/` — resolved: the on-disk artifact is a *skill source*; a **FulcrumSkill** is the per-org registry binding with `enabledAgents`.
- "event" overlapped **Event** (audit), **DomainEventOutbox** (transactional dispatch), and **TelemetryEvent** (analytics) — resolved: three distinct entities, do not collapse. Audit is who-did-what; outbox is cross-service messaging; telemetry is product metrics.
- "job" vs "hook" vs "skill" — resolved: a **Job** is queued background work persisted in the DB; a **HookEnvelope** is a synchronous agent-runtime callback handled by a `fulcrum hook <name>` subcommand; a **FulcrumSkill** is an authored prompt/recipe surfaced to agents under a namespace.
