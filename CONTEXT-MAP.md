# Context Map

> Index of bounded contexts. One `CONTEXT.md` per top-level subdirectory under `src/`. Each context owns its vocabulary, invariants, public surface, and ADRs. Cross-context coupling happens through the agent registry, the component catalog, and the CLI dispatcher in `src/index.ts`.

## Contexts

### CLI / Foundation Contexts

| Context                              | Path                  | Responsibility                                                                                  |
| ------------------------------------ | --------------------- | ----------------------------------------------------------------------------------------------- |
| [Agents](./src/agents/CONTEXT.md)         | `src/agents/`         | Canonical `Agent` interface and `AGENTS[5]` registry. Single source of truth for agent metadata. |
| [CLI](./src/cli/CONTEXT.md)               | `src/cli/`            | Command dispatch, install/uninstall, hooks, MCP, skills, packages, doctor, init.                 |
| [Components](./src/components/CONTEXT.md) | `src/components/`     | Component lifecycle engine: catalog, planner, ledger, executor, adapters.                        |

### Service Contexts (DDD bounded services)

| Service | Path | Responsibility | Owns Entities |
|---|---|---|---|
| platform-core | `services/platform-core/` | Shared infra: DB config, events, flags, skills, jobs, platform ops, credentials | core, flags, inference, jobs, platform, skills, SchemaMigration, TenantSetting |
| identity-access | `services/identity-access/` | Auth, orgs, users, sessions, invitations | auth (User, Org, OrgMember, Session, Account, Verification, Invitation, FeatureFlag) |
| work-management | `services/work-management/` | Tasks, projects, sprints, custom fields, views, templates, automations | tasks (Task, Project, Sprint, CustomFieldDef, SavedView, etc.) |
| knowledge-workspace | `services/knowledge-workspace/` | Documents, memory, search | docs, memory, search |
| execution-orchestration | `services/execution-orchestration/` | Agent runs, routing, sandbox | orchestration, router, sandbox |
| integration-hub | `services/integration-hub/` | Repos, connectors, webhooks, data portability | connectors, repos, settings |
| notification-center | `services/notification-center/` | Notifications, deliveries, push, webhooks | notifications |
| workflow-coordination | `services/workflow-coordination/` | Artifacts, audit, workflow cycles | artifacts, audit |
| planning-review | `services/planning-review/` | Planning, review workflows | (no owned entities yet) |
| agent-client-protocol | `services/agent-client-protocol/` | ACP bridge, session management, transports | (no owned entities yet) |
| inference-runtime | `services/inference-runtime/` | Rust inference engine (embedding, generation) | (Rust, not TypeORM) |

## Cross-cutting decisions

System-wide architectural decisions live in [`docs/adr/`](./docs/adr/). Context-scoped decisions live under each context's `docs/adr/`. The seed template at `docs/adr/0000-template.md` is the canonical ADR shape.

## Conventions

- Skills consuming this map must respect the vocabulary defined in each `CONTEXT.md`. Synonyms drift; named terms do not.
- New top-level subdirectory under `src/` requires a new entry here and its own `CONTEXT.md`.
- An ADR conflict is surfaced explicitly, not silently overridden. See `docs/agents/domain.md` §"Flag ADR conflicts".
