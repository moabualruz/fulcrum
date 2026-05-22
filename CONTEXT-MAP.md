# Context Map

> Index of bounded contexts. One `CONTEXT.md` per bounded service (`services/<name>/`) and per surface app (`apps/<name>/`). Each context owns its vocabulary, invariants, public surface, and ADRs. Cross-context coupling happens through service modules composed by `apps/server` (NestJS `AppModule` + tRPC `AppRouter`), invoked by surface apps via in-process `AppCaller` (CLI/TUI/desktop) or HTTP/tRPC (web).
>
> Conventions for keeping this map honest: see [docs/agents/domain.md](./docs/agents/domain.md) and [AGENTS.md](./AGENTS.md) §Conventions. Each `CONTEXT.md` follows the [grill-with-docs CONTEXT format](./docs/agents/domain.md) — Language / Relationships / Example dialogue / Flagged ambiguities.

## Contexts

### Service Contexts (DDD bounded services)

Owned domain logic + persistence. Each composes into `apps/server` as a NestJS module + tRPC sub-router.

| Service | Path | Responsibility | Owns Entities |
|---|---|---|---|
| [platform-core](./services/platform-core/CONTEXT.md) | `services/platform-core/` | Shared infra: DB config, events, skills, jobs, platform ops, credentials | SkillDefinition, Job, TenantSetting, SchemaMigration, Credential, PlatformEvent |
| [feature-flags](./services/feature-flags/CONTEXT.md) | `services/feature-flags/` | Feature flag registry, evaluation, rollout storage, experiments, and public flag APIs | FeatureFlag, FeatureFlagEvaluation, FeatureFlagRollout, ExperimentAssignment |
| [identity-access](./services/identity-access/CONTEXT.md) | `services/identity-access/` | Auth, orgs, users, sessions, invitations | User, Org, OrgMember, Session, Account, Verification, Invitation, Passkey, FeatureFlag (identity-scoped) |
| [work-management](./services/work-management/CONTEXT.md) | `services/work-management/` | Tasks, projects, sprints, custom fields, views, templates, automations | Task, Project, Sprint, Module, CustomFieldDef, SavedView, Template, Automation, Dependency |
| [knowledge-workspace](./services/knowledge-workspace/CONTEXT.md) | `services/knowledge-workspace/` | Documents, memory, search | Document, Page, Revision, Wikilink, Backlink, Comment, MemoryEntry, SearchIndex, SavedSearch |
| [execution-orchestration](./services/execution-orchestration/CONTEXT.md) | `services/execution-orchestration/` | Agent runs, routing, sandbox | AgentRun, Attempt, RoutingRule, RoutingDecision, Sandbox, Workspace, Transcript, Artifact |
| [integration-hub](./services/integration-hub/CONTEXT.md) | `services/integration-hub/` | Repos, connectors, webhooks, data portability | Repo, Connector, ConnectorAdapter, Importer, FieldMap, SyncResult, Webhook, WebhookDelivery |
| [notification-center](./services/notification-center/CONTEXT.md) | `services/notification-center/` | Notifications, deliveries, push, webhooks | Event, NotificationRule, Notification, Delivery, Channel, PushSubscription, QuietHours |
| [workflow-coordination](./services/workflow-coordination/CONTEXT.md) | `services/workflow-coordination/` | Artifacts, audit, workflow cycles, trace spine | WorkflowCycle, Stage, TraceSpine, Artifact, AuditEntry, CycleEvent, Outbox |
| [planning-review](./services/planning-review/CONTEXT.md) | `services/planning-review/` | Planning, prototyping, review workflows | Plan, PlanSubmission, PlanDecision, ApprovedPlanBreakdown, TaskDraft, Annotation, ReviewWorkbench |
| [agent-client-protocol](./services/agent-client-protocol/CONTEXT.md) | `services/agent-client-protocol/` | ACP bridge, session management, transports | AcpSession, SavedSession, AcpClientBridge, ToolCall, PermissionRequest, Transport, Capabilities |
| [inference-runtime](./services/inference-runtime/CONTEXT.md) | `services/inference-runtime/` | Rust inference engine (embedding, classification, generation) | (Rust, not TypeORM) RuntimeServer, Model, ModelManager, CacheStore |

### Surface Contexts (invocation/visualization layers)

Call service APIs via HTTP, tRPC, or in-process `AppCaller`. Do not own business logic or persistence. Each defines its own surface-level vocabulary (screens, panes, palettes, chrome). `apps/web` is pure HTTP/tRPC invocation and must never open a local DB runtime.

| Surface | Path | Responsibility | Key Surface Terms |
|---|---|---|---|
| [server](./apps/server/CONTEXT.md) | `apps/server/` | NestJS runtime — `AppModule` composes service modules; mounts HTTP controllers + tRPC `AppRouter`; exposes `AppCaller` for in-process callers | NestApplication, AppModule, AppRouter, AppCaller, TrpcContext, ZodValidationPipe, OpenApiDocument |
| [web](./apps/web/CONTEXT.md) | `apps/web/` | SvelteKit web surface — pure HTTP/tRPC invocation layer for workflow-stage IA (Capture/Plan/Build/Review/Ship/Operate), no local DB runtime | WorkflowStage, Step, Scope, StageRail, ScopeBar, StatusFooter, AcpDrawer, CommandPalette, TraceBadge, ModeAffordance |
| [tui](./apps/tui/CONTEXT.md) | `apps/tui/` | OpenTUI surface — screens mirror web stages; `:` palette + `Space` menu + stage chord | TuiScreen, ColonPalette, SpaceMenu, StatusFooter, StageChord, ChatPane, ModePicker, TraceYank |
| [cli](./apps/cli/CONTEXT.md) | `apps/cli/` | Bun-compiled `fulcrum` binary — subcommands organized by workflow stage; JSON envelope `fulcrum.cli.v1` | Command, Subcommand, Envelope, ExitCode, JsonOutput, TraceId, ConfigPrecedence |
| [desktop](./apps/desktop/CONTEXT.md) | `apps/desktop/` | Tauri v2 shell — single window hosts web surface; feature-gated by `FULCRUM_FEATURES=desktop-app` | DesktopShell, MainProcess, RendererProcess, IpcCommand, DesktopWindow, TauriPlugin, FeatureGate, FulcrumHome |
| [daemon](./apps/daemon/CONTEXT.md) | `apps/daemon/` | Background process host — long-running supervisor/scheduler for agent runs and jobs outside an interactive surface | DaemonProcess, Supervisor, Scheduler, JobRunner, Heartbeat |

### Package Contexts (cross-cutting shared libraries)

Packages hold cross-cutting shared code with **no domain ownership and no runnable entrypoint** — consumed by ≥2 apps/services. A package with zero importers is dead scaffolding and must be wired+adopted or deleted (see the AGENTS.md `packages/` rule).

| Package | Path | Responsibility | Consumers |
|---|---|---|---|
| [@fulcrum/ui-kit](./packages/ui-kit/CONTEXT.md) | `packages/ui-kit/` | The only UI primitive source — OKLCH-tokened Svelte primitives (Button, Input, Select, Dialog, Sheet, Badge, Card, StageRail, ScopeBar, StatusFooter, AcpDrawer, …) | `apps/web`, `apps/desktop` |
| [@fulcrum/shared-dto](./packages/shared-dto/CONTEXT.md) | `packages/shared-dto/` | Cross-surface DTO/value types not owned by a single bounded service — workflow-stage / run / trace / status vocabulary | `apps/web`, `apps/cli`, `apps/tui` |
| [@fulcrum/test-fixtures](./packages/test-fixtures/CONTEXT.md) | `packages/test-fixtures/` | Cross-service test factories + fixtures (fishery-style) | `tests/**`, service `*.test.ts` |

### Sub-context Docs

Nested `CONTEXT.md` under a service's `src/application/<area>/` define area-specific vocabulary that sharpens its parent service's glossary. Listed for discoverability; do not duplicate terms upward. **All 96 application sub-areas are covered.**

#### agent-client-protocol

| Area | Path |
|---|---|
| Transports | [`services/agent-client-protocol/src/application/transports/CONTEXT.md`](./services/agent-client-protocol/src/application/transports/CONTEXT.md) |

#### execution-orchestration

| Area | Path |
|---|---|
| Agent Catalog | [`services/execution-orchestration/src/application/agent-catalog/CONTEXT.md`](./services/execution-orchestration/src/application/agent-catalog/CONTEXT.md) |
| Agent Catalog / Profiles | [`services/execution-orchestration/src/application/agent-catalog/profiles/CONTEXT.md`](./services/execution-orchestration/src/application/agent-catalog/profiles/CONTEXT.md) |
| Agents | [`services/execution-orchestration/src/application/agents/CONTEXT.md`](./services/execution-orchestration/src/application/agents/CONTEXT.md) |
| Orchestration | [`services/execution-orchestration/src/application/orchestration/CONTEXT.md`](./services/execution-orchestration/src/application/orchestration/CONTEXT.md) |
| Runs | [`services/execution-orchestration/src/application/runs/CONTEXT.md`](./services/execution-orchestration/src/application/runs/CONTEXT.md) |

#### identity-access

| Area | Path |
|---|---|
| Admin | [`services/identity-access/src/application/admin/CONTEXT.md`](./services/identity-access/src/application/admin/CONTEXT.md) |
| Auth | [`services/identity-access/src/application/auth/CONTEXT.md`](./services/identity-access/src/application/auth/CONTEXT.md) |
| Orgs | [`services/identity-access/src/application/orgs/CONTEXT.md`](./services/identity-access/src/application/orgs/CONTEXT.md) |
| Permissions | [`services/identity-access/src/application/permissions/CONTEXT.md`](./services/identity-access/src/application/permissions/CONTEXT.md) |

#### integration-hub

| Area | Path |
|---|---|
| Connectors | [`services/integration-hub/src/application/connectors/CONTEXT.md`](./services/integration-hub/src/application/connectors/CONTEXT.md) |
| Connectors / Bitbucket | [`services/integration-hub/src/application/connectors/bitbucket/CONTEXT.md`](./services/integration-hub/src/application/connectors/bitbucket/CONTEXT.md) |
| Connectors / Github | [`services/integration-hub/src/application/connectors/github/CONTEXT.md`](./services/integration-hub/src/application/connectors/github/CONTEXT.md) |
| Connectors / Gitlab | [`services/integration-hub/src/application/connectors/gitlab/CONTEXT.md`](./services/integration-hub/src/application/connectors/gitlab/CONTEXT.md) |
| Data Exchange | [`services/integration-hub/src/application/data-exchange/CONTEXT.md`](./services/integration-hub/src/application/data-exchange/CONTEXT.md) |
| External Connectors | [`services/integration-hub/src/application/external-connectors/CONTEXT.md`](./services/integration-hub/src/application/external-connectors/CONTEXT.md) |
| Import Export | [`services/integration-hub/src/application/import-export/CONTEXT.md`](./services/integration-hub/src/application/import-export/CONTEXT.md) |
| Importers | [`services/integration-hub/src/application/importers/CONTEXT.md`](./services/integration-hub/src/application/importers/CONTEXT.md) |
| Importers / Field Mapping | [`services/integration-hub/src/application/importers/field-mapping/CONTEXT.md`](./services/integration-hub/src/application/importers/field-mapping/CONTEXT.md) |
| Importers / Sources | [`services/integration-hub/src/application/importers/sources/CONTEXT.md`](./services/integration-hub/src/application/importers/sources/CONTEXT.md) |
| Project Connectors | [`services/integration-hub/src/application/project-connectors/CONTEXT.md`](./services/integration-hub/src/application/project-connectors/CONTEXT.md) |
| Repo Files | [`services/integration-hub/src/application/repo-files/CONTEXT.md`](./services/integration-hub/src/application/repo-files/CONTEXT.md) |
| Repos | [`services/integration-hub/src/application/repos/CONTEXT.md`](./services/integration-hub/src/application/repos/CONTEXT.md) |
| Repos / Workers | [`services/integration-hub/src/application/repos/workers/CONTEXT.md`](./services/integration-hub/src/application/repos/workers/CONTEXT.md) |
| Webhooks | [`services/integration-hub/src/application/webhooks/CONTEXT.md`](./services/integration-hub/src/application/webhooks/CONTEXT.md) |

#### knowledge-workspace

| Area | Path |
|---|---|
| Collaboration | [`services/knowledge-workspace/src/application/collaboration/CONTEXT.md`](./services/knowledge-workspace/src/application/collaboration/CONTEXT.md) |
| Context | [`services/knowledge-workspace/src/application/context/CONTEXT.md`](./services/knowledge-workspace/src/application/context/CONTEXT.md) |
| Doc Links | [`services/knowledge-workspace/src/application/doc-links/CONTEXT.md`](./services/knowledge-workspace/src/application/doc-links/CONTEXT.md) |
| Docs | [`services/knowledge-workspace/src/application/docs/CONTEXT.md`](./services/knowledge-workspace/src/application/docs/CONTEXT.md) |
| Docs / Collaboration | [`services/knowledge-workspace/src/application/docs/collaboration/CONTEXT.md`](./services/knowledge-workspace/src/application/docs/collaboration/CONTEXT.md) |
| Memory | [`services/knowledge-workspace/src/application/memory/CONTEXT.md`](./services/knowledge-workspace/src/application/memory/CONTEXT.md) |
| Memory / Hooks | [`services/knowledge-workspace/src/application/memory/hooks/CONTEXT.md`](./services/knowledge-workspace/src/application/memory/hooks/CONTEXT.md) |
| Memory / Retrieval | [`services/knowledge-workspace/src/application/memory/retrieval/CONTEXT.md`](./services/knowledge-workspace/src/application/memory/retrieval/CONTEXT.md) |
| Search | [`services/knowledge-workspace/src/application/search/CONTEXT.md`](./services/knowledge-workspace/src/application/search/CONTEXT.md) |
| Search / Indexers | [`services/knowledge-workspace/src/application/search/indexers/CONTEXT.md`](./services/knowledge-workspace/src/application/search/indexers/CONTEXT.md) |

#### notification-center

| Area | Path |
|---|---|
| Delivery Runtime | [`services/notification-center/src/application/delivery-runtime/CONTEXT.md`](./services/notification-center/src/application/delivery-runtime/CONTEXT.md) |
| Delivery Runtime / Delivery Handlers | [`services/notification-center/src/application/delivery-runtime/delivery-handlers/CONTEXT.md`](./services/notification-center/src/application/delivery-runtime/delivery-handlers/CONTEXT.md) |
| Notifications | [`services/notification-center/src/application/notifications/CONTEXT.md`](./services/notification-center/src/application/notifications/CONTEXT.md) |

#### planning-review

| Area | Path |
|---|---|
| Features | [`services/planning-review/src/application/features/CONTEXT.md`](./services/planning-review/src/application/features/CONTEXT.md) |
| Reports | [`services/planning-review/src/application/reports/CONTEXT.md`](./services/planning-review/src/application/reports/CONTEXT.md) |
| Reviews | [`services/planning-review/src/application/reviews/CONTEXT.md`](./services/planning-review/src/application/reviews/CONTEXT.md) |
| Reviews / File Tree | [`services/planning-review/src/application/reviews/file-tree/CONTEXT.md`](./services/planning-review/src/application/reviews/file-tree/CONTEXT.md) |
| Reviews / Shared | [`services/planning-review/src/application/reviews/shared/CONTEXT.md`](./services/planning-review/src/application/reviews/shared/CONTEXT.md) |

#### platform-core

| Area | Path |
|---|---|
| Agent Hooks | [`services/platform-core/src/application/agent-hooks/CONTEXT.md`](./services/platform-core/src/application/agent-hooks/CONTEXT.md) |
| Backup | [`services/platform-core/src/application/backup/CONTEXT.md`](./services/platform-core/src/application/backup/CONTEXT.md) |
| Cli Tui | [`services/platform-core/src/application/cli-tui/CONTEXT.md`](./services/platform-core/src/application/cli-tui/CONTEXT.md) |
| Component Lifecycle | [`services/platform-core/src/application/component-lifecycle/CONTEXT.md`](./services/platform-core/src/application/component-lifecycle/CONTEXT.md) |
| Component Lifecycle / Adapters | [`services/platform-core/src/application/component-lifecycle/adapters/CONTEXT.md`](./services/platform-core/src/application/component-lifecycle/adapters/CONTEXT.md) |
| Coverage Tracker | [`services/platform-core/src/application/coverage-tracker/CONTEXT.md`](./services/platform-core/src/application/coverage-tracker/CONTEXT.md) |
| Db | [`services/platform-core/src/application/db/CONTEXT.md`](./services/platform-core/src/application/db/CONTEXT.md) |
| Error Reporting | [`services/platform-core/src/application/error-reporting/CONTEXT.md`](./services/platform-core/src/application/error-reporting/CONTEXT.md) |
| Health Checks | [`services/platform-core/src/application/health-checks/CONTEXT.md`](./services/platform-core/src/application/health-checks/CONTEXT.md) |
| Health Checks / Checks | [`services/platform-core/src/application/health-checks/checks/CONTEXT.md`](./services/platform-core/src/application/health-checks/checks/CONTEXT.md) |
| Inference | [`services/platform-core/src/application/inference/CONTEXT.md`](./services/platform-core/src/application/inference/CONTEXT.md) |
| Inference / Backends | [`services/platform-core/src/application/inference/backends/CONTEXT.md`](./services/platform-core/src/application/inference/backends/CONTEXT.md) |
| Init | [`services/platform-core/src/application/init/CONTEXT.md`](./services/platform-core/src/application/init/CONTEXT.md) |
| Input Bindings | [`services/platform-core/src/application/input-bindings/CONTEXT.md`](./services/platform-core/src/application/input-bindings/CONTEXT.md) |
| Interface Parity | [`services/platform-core/src/application/interface-parity/CONTEXT.md`](./services/platform-core/src/application/interface-parity/CONTEXT.md) |
| Jobs | [`services/platform-core/src/application/jobs/CONTEXT.md`](./services/platform-core/src/application/jobs/CONTEXT.md) |
| Legacy | [`services/platform-core/src/application/legacy/CONTEXT.md`](./services/platform-core/src/application/legacy/CONTEXT.md) |
| Localization | [`services/platform-core/src/application/localization/CONTEXT.md`](./services/platform-core/src/application/localization/CONTEXT.md) |
| Localization / Locales | [`services/platform-core/src/application/localization/locales/CONTEXT.md`](./services/platform-core/src/application/localization/locales/CONTEXT.md) |
| Manual Simulation | [`services/platform-core/src/application/manual-simulation/CONTEXT.md`](./services/platform-core/src/application/manual-simulation/CONTEXT.md) |
| Platform Operations | [`services/platform-core/src/application/platform-operations/CONTEXT.md`](./services/platform-core/src/application/platform-operations/CONTEXT.md) |
| Platform Primitives | [`services/platform-core/src/application/platform-primitives/CONTEXT.md`](./services/platform-core/src/application/platform-primitives/CONTEXT.md) |
| Platform Primitives / State | [`services/platform-core/src/application/platform-primitives/state/CONTEXT.md`](./services/platform-core/src/application/platform-primitives/state/CONTEXT.md) |
| Runtime | [`services/platform-core/src/application/runtime/CONTEXT.md`](./services/platform-core/src/application/runtime/CONTEXT.md) |
| Runtime Support | [`services/platform-core/src/application/runtime-support/CONTEXT.md`](./services/platform-core/src/application/runtime-support/CONTEXT.md) |
| Secrets | [`services/platform-core/src/application/secrets/CONTEXT.md`](./services/platform-core/src/application/secrets/CONTEXT.md) |
| Settings | [`services/platform-core/src/application/settings/CONTEXT.md`](./services/platform-core/src/application/settings/CONTEXT.md) |
| Skill Supply | [`services/platform-core/src/application/skill-supply/CONTEXT.md`](./services/platform-core/src/application/skill-supply/CONTEXT.md) |
| Skill Supply / Marketplace | [`services/platform-core/src/application/skill-supply/marketplace/CONTEXT.md`](./services/platform-core/src/application/skill-supply/marketplace/CONTEXT.md) |
| Skills | [`services/platform-core/src/application/skills/CONTEXT.md`](./services/platform-core/src/application/skills/CONTEXT.md) |
| Subscriptions | [`services/platform-core/src/application/subscriptions/CONTEXT.md`](./services/platform-core/src/application/subscriptions/CONTEXT.md) |
| Telemetry | [`services/platform-core/src/application/telemetry/CONTEXT.md`](./services/platform-core/src/application/telemetry/CONTEXT.md) |
| Tenancy | [`services/platform-core/src/application/tenancy/CONTEXT.md`](./services/platform-core/src/application/tenancy/CONTEXT.md) |

#### work-management

| Area | Path |
|---|---|
| Automations | [`services/work-management/src/application/automations/CONTEXT.md`](./services/work-management/src/application/automations/CONTEXT.md) |
| Comments | [`services/work-management/src/application/comments/CONTEXT.md`](./services/work-management/src/application/comments/CONTEXT.md) |
| Custom Fields | [`services/work-management/src/application/custom-fields/CONTEXT.md`](./services/work-management/src/application/custom-fields/CONTEXT.md) |
| Dashboard | [`services/work-management/src/application/dashboard/CONTEXT.md`](./services/work-management/src/application/dashboard/CONTEXT.md) |
| Project Policy | [`services/work-management/src/application/project-policy/CONTEXT.md`](./services/work-management/src/application/project-policy/CONTEXT.md) |
| Project Statuses | [`services/work-management/src/application/project-statuses/CONTEXT.md`](./services/work-management/src/application/project-statuses/CONTEXT.md) |
| Projects | [`services/work-management/src/application/projects/CONTEXT.md`](./services/work-management/src/application/projects/CONTEXT.md) |
| Recurrence | [`services/work-management/src/application/recurrence/CONTEXT.md`](./services/work-management/src/application/recurrence/CONTEXT.md) |
| Relationships | [`services/work-management/src/application/relationships/CONTEXT.md`](./services/work-management/src/application/relationships/CONTEXT.md) |
| Reports | [`services/work-management/src/application/reports/CONTEXT.md`](./services/work-management/src/application/reports/CONTEXT.md) |
| Saved Views | [`services/work-management/src/application/saved-views/CONTEXT.md`](./services/work-management/src/application/saved-views/CONTEXT.md) |
| Sprints | [`services/work-management/src/application/sprints/CONTEXT.md`](./services/work-management/src/application/sprints/CONTEXT.md) |
| Tasks | [`services/work-management/src/application/tasks/CONTEXT.md`](./services/work-management/src/application/tasks/CONTEXT.md) |
| Templates | [`services/work-management/src/application/templates/CONTEXT.md`](./services/work-management/src/application/templates/CONTEXT.md) |
| Workflows | [`services/work-management/src/application/workflows/CONTEXT.md`](./services/work-management/src/application/workflows/CONTEXT.md) |

#### workflow-coordination

| Area | Path |
|---|---|
| Artifacts | [`services/workflow-coordination/src/application/artifacts/CONTEXT.md`](./services/workflow-coordination/src/application/artifacts/CONTEXT.md) |
| Audit | [`services/workflow-coordination/src/application/audit/CONTEXT.md`](./services/workflow-coordination/src/application/audit/CONTEXT.md) |
| Events | [`services/workflow-coordination/src/application/events/CONTEXT.md`](./services/workflow-coordination/src/application/events/CONTEXT.md) |
| Testing | [`services/workflow-coordination/src/application/testing/CONTEXT.md`](./services/workflow-coordination/src/application/testing/CONTEXT.md) |
| Trace | [`services/workflow-coordination/src/application/trace/CONTEXT.md`](./services/workflow-coordination/src/application/trace/CONTEXT.md) |

## Cross-cutting decisions

System-wide architectural decisions live in [`docs/adr/`](./docs/adr/). Context-scoped decisions live under each context's `docs/adr/`. The seed template at [`docs/adr/0000-template.md`](./docs/adr/0000-template.md) is the canonical ADR shape.

## Conventions

- Skills consuming this map must respect the vocabulary defined in each `CONTEXT.md`. Synonyms drift; named terms do not.
- **New `services/<name>/` or `apps/<name>/` requires its own `CONTEXT.md` + an entry in this map in the same commit.** Renames update the map; deletions remove the entry. See [AGENTS.md](./AGENTS.md) §Conventions — "CONTEXT files stay current".
- Stale link in this map (path no longer exists) = correctness bug; fix before merging unrelated work in the same area.
- An ADR conflict is surfaced explicitly, not silently overridden. See [`docs/agents/domain.md`](./docs/agents/domain.md) §"Flag ADR conflicts".
- Sub-context `CONTEXT.md` files sharpen the parent service's vocabulary; do not promote area terms to the parent unless they're used outside the area.
