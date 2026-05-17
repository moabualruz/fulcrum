# Context Map

> Index of bounded contexts. One `CONTEXT.md` per bounded service (`services/<name>/`) and per surface app (`apps/<name>/`). Each context owns its vocabulary, invariants, public surface, and ADRs. Cross-context coupling happens through service modules composed by `apps/server` (NestJS `AppModule` + tRPC `AppRouter`), invoked by surface apps via in-process `AppCaller` (CLI/TUI/desktop) or HTTP/tRPC (web).
>
> Conventions for keeping this map honest: see [docs/agents/domain.md](./docs/agents/domain.md) and [AGENTS.md](./AGENTS.md) §Conventions. Each `CONTEXT.md` follows the [grill-with-docs CONTEXT format](./docs/agents/domain.md) — Language / Relationships / Example dialogue / Flagged ambiguities.

## Contexts

### Service Contexts (DDD bounded services)

Owned domain logic + persistence. Each composes into `apps/server` as a NestJS module + tRPC sub-router.

| Service | Path | Responsibility | Owns Entities |
|---|---|---|---|
| [platform-core](./services/platform-core/CONTEXT.md) | `services/platform-core/` | Shared infra: DB config, events, flags, skills, jobs, platform ops, credentials | FeatureFlag, SkillDefinition, Job, TenantSetting, SchemaMigration, Credential, PlatformEvent |
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

Call service APIs via HTTP, tRPC, or in-process `AppCaller`. Do not own business logic or persistence. Each defines its own surface-level vocabulary (screens, panes, palettes, chrome).

| Surface | Path | Responsibility | Key Surface Terms |
|---|---|---|---|
| [server](./apps/server/CONTEXT.md) | `apps/server/` | NestJS runtime — `AppModule` composes service modules; mounts HTTP controllers + tRPC `AppRouter`; exposes `AppCaller` for in-process callers | NestApplication, AppModule, AppRouter, AppCaller, TrpcContext, ZodValidationPipe, OpenApiDocument |
| [web](./apps/web/CONTEXT.md) | `apps/web/` | SvelteKit web surface — workflow-stage IA (Capture/Plan/Build/Review/Ship/Operate), four-mode-per-step contract | WorkflowStage, Step, Scope, StageRail, ScopeBar, StatusFooter, AcpDrawer, CommandPalette, TraceBadge, ModeAffordance |
| [tui](./apps/tui/CONTEXT.md) | `apps/tui/` | OpenTUI surface — screens mirror web stages; `:` palette + `Space` menu + stage chord | TuiScreen, ColonPalette, SpaceMenu, StatusFooter, StageChord, ChatPane, ModePicker, TraceYank |
| [cli](./apps/cli/CONTEXT.md) | `apps/cli/` | Bun-compiled `fulcrum` binary — subcommands organized by workflow stage; JSON envelope `fulcrum.cli.v1` | Command, Subcommand, Envelope, ExitCode, JsonOutput, TraceId, ConfigPrecedence |
| [desktop](./apps/desktop/CONTEXT.md) | `apps/desktop/` | Tauri v2 shell — single window hosts web surface; feature-gated by `FULCRUM_FEATURES=desktop-app` | DesktopShell, MainProcess, RendererProcess, IpcCommand, DesktopWindow, TauriPlugin, FeatureGate, FulcrumHome |

### Sub-context Docs

Nested `CONTEXT.md` under a service's `src/application/<area>/` define area-specific vocabulary that sharpens its parent service's glossary. Listed for discoverability; do not duplicate terms upward.

| Sub-context | Path |
|---|---|
| Agent Catalog | [`services/execution-orchestration/src/application/agent-catalog/CONTEXT.md`](./services/execution-orchestration/src/application/agent-catalog/CONTEXT.md) |
| Repos (intake) | [`services/integration-hub/src/application/repos/CONTEXT.md`](./services/integration-hub/src/application/repos/CONTEXT.md) |
| Runtime Support | [`services/platform-core/src/application/runtime-support/CONTEXT.md`](./services/platform-core/src/application/runtime-support/CONTEXT.md) |
| Agent Hooks | [`services/platform-core/src/application/agent-hooks/CONTEXT.md`](./services/platform-core/src/application/agent-hooks/CONTEXT.md) |
| Component Lifecycle | [`services/platform-core/src/application/component-lifecycle/CONTEXT.md`](./services/platform-core/src/application/component-lifecycle/CONTEXT.md) |

## Cross-cutting decisions

System-wide architectural decisions live in [`docs/adr/`](./docs/adr/). Context-scoped decisions live under each context's `docs/adr/`. The seed template at [`docs/adr/0000-template.md`](./docs/adr/0000-template.md) is the canonical ADR shape.

## Conventions

- Skills consuming this map must respect the vocabulary defined in each `CONTEXT.md`. Synonyms drift; named terms do not.
- **New `services/<name>/` or `apps/<name>/` requires its own `CONTEXT.md` + an entry in this map in the same commit.** Renames update the map; deletions remove the entry. See [AGENTS.md](./AGENTS.md) §Conventions — "CONTEXT files stay current".
- Stale link in this map (path no longer exists) = correctness bug; fix before merging unrelated work in the same area.
- An ADR conflict is surfaced explicitly, not silently overridden. See [`docs/agents/domain.md`](./docs/agents/domain.md) §"Flag ADR conflicts".
- Sub-context `CONTEXT.md` files sharpen the parent service's vocabulary; do not promote area terms to the parent unless they're used outside the area.
