# External Integrations

**Analysis Date:** 2026-05-04

## APIs & External Services

**Project Management Connectors:**
- Linear — two-way issue sync via GraphQL API
  - Client: custom fetch-based (`src/connectors/linear.ts`)
  - Auth: `LINEAR_API_KEY` env var
  - Config: `LINEAR_TEAM_ID` env var
  - Gated: connector framework with per-connector feature flags (`src/connectors/registry.ts`)

- GitHub Issues — issue sync
  - Client: custom fetch-based (`src/connectors/github-issues.ts`)
  - Auth: GitHub token (env var)

- Jira — connector stub (`src/connectors/jira.ts`)
- GitLab — connector stub (`src/connectors/gitlab.ts`)
- Plane — connector stub (`src/connectors/plane.ts`)
- Bitbucket — connector stub (`src/connectors/bitbucket.ts`)
- Notion — connector stub (`src/connectors/notion.ts`)
- Confluence — connector stub (`src/connectors/confluence.ts`)

**Connector Framework:**
- Interface: `ConnectorAdapter` (`src/connectors/interface.ts`)
- Registry: `src/connectors/registry.ts` — flag-gated connector registration
- Barrel: `src/connectors/index.ts`
- Each connector implements: `connect()`, `disconnect()`, `pull()`, `push()`, `health()`
- CSV import adapter: `src/connectors/csv.ts`

**Inference / LLM:**
- OpenAI-compatible API — any endpoint speaking OpenAI chat/embeddings protocol
  - Client: `src/inference/backends/openai-compatible.ts`
  - Auth: `FULCRUM_INFERENCE_API_KEY` env var
  - Endpoint: `FULCRUM_INFERENCE_URL` env var
  - Gated: `external-llm-provider` feature flag

- Ollama — local LLM inference
  - Client: `src/inference/backends/ollama.ts`
  - Default: `http://localhost:11434`

- LM Studio — local LLM inference
  - Client: `src/inference/backends/lm-studio.ts`

- Embedded Rust inference engine — local model execution
  - Server: `inference/inference-server/` (Rust binary)
  - Crates: `inference-core`, `inference-embed`, `inference-generate`
  - Client: `src/inference/backends/embedded.ts`

**Inference Routing:**
- Multi-backend routing: `src/inference/routing-config.ts`
- Protocol layer: `src/inference/protocol.ts`
- Lifecycle management: `src/inference/lifecycle.ts`
- Token counting: `src/inference/tokens.ts`

## Data Storage

**Databases:**
- PGlite (local-first default)
  - Embedded PostgreSQL via `@electric-sql/pglite` 0.4.5
  - Kysely dialect adapter: `src/db/PGliteKyselyDriver.ts`
  - No external server required
  - Connection: automatic (no DATABASE_URL)

- PostgreSQL (SaaS mode)
  - Standard pg Pool via `pg` 8.20
  - Connection: `DATABASE_URL` env var
  - Driver: `@mikro-orm/postgresql`

- SQLite (Rust inference cache)
  - Via `rusqlite` 0.32 (bundled) in inference-server
  - Model/embedding cache

**ORM:**
- MikroORM v7 with `@Entity` decorator classes
- Config: `src/db/mikro-orm.config.ts`
- Entities: `src/db/entities/` (auth, core, tasks, docs, sandbox, router, notifications)
- Migrations: `src/db/migrations/` (timestamped, auto-generated)
- Repositories: `src/db/repositories/`
- Constraint C6: zero raw SQL — all DB access via EntityManager

**File Storage:**
- Local filesystem only (local-first architecture)
- Git-managed workspaces (`src/repos/`)
- Artifact storage: `src/artifacts/`

**Caching:**
- None (no Redis/Memcached) — PGlite serves as both primary and cache store

## Authentication & Identity

**Auth Provider:**
- Better Auth v1 (`better-auth` package)
  - Implementation: `src/auth/index.ts` (AuthService class)
  - MikroORM adapter: `src/auth/adapter.ts` (MikroOrmBetterAuthAdapter)
  - DI: `@injectable()` via needle-di

**Auth Modes:**
- Local-first (default): email + password only, sign-up disabled, auto-seeded admin
  - Default admin: `admin@local.fulcrum`
  - Session TTL: 30 days

- SaaS (gated by `saas-auth` flag):
  - Email + password with sign-up enabled
  - Google OAuth (via `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`)
  - GitHub OAuth (via `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`)
  - Magic link (stub SMTP transport)
  - Email OTP (stub SMTP transport)
  - Organization plugin (multi-tenant)

**Session:**
- Carries: `{ id, userId, orgId, activeOrganizationId, expiresAt }`
- Mounted at: `/api/auth/**` in SvelteKit hooks.server.ts

## Monitoring & Observability

**Error Tracking:**
- Error logs router: `src/server/trpc/routers/error-logs.ts`
- No external error tracking service detected (Sentry, etc.)

**Telemetry:**
- Telemetry router: `src/server/trpc/routers/telemetry.ts`
- Web telemetry: `src/web/src/lib/telemetry.ts`
- No external telemetry service detected

**Logs:**
- Console-based logging
- Audit log router: `src/server/trpc/routers/audit.ts`

## CI/CD & Deployment

**Hosting:**
- Local-first: compiled Bun binary (single executable)
- Desktop: Tauri v2 wrapper with auto-updater (`src-tauri/`)
- SaaS: not yet deployed (PostgreSQL-backed mode available)

**CI Pipeline:**
- `bun run ci` via `scripts/ci.ts`
- `bun run lint` (tsc --noEmit)
- `bun test` (root), `bun run web:test` (vitest), `bun run web:e2e` (playwright)
- Changelog: `git-cliff -o CHANGELOG.md`

**Build Targets:**
- `bun build --compile --minify --target=bun-darwin-arm64` (default)
- `scripts/build-all.ts` for cross-platform compilation
- `scripts/release.ts` for release automation

## MCP Servers

**CLI MCP command:**
- `src/cli/mcp-cmd.ts` — MCP server management
- Component catalog references MCP: `src/components/catalog.ts`
- Hook adapters for MCP: `src/components/adapters/hooks.ts`

## Feature Flag Gating System

**Implementation:**
- Registry: `src/flags/registry.ts` (FlagRegistry singleton)
- Evaluation: `src/flags/evaluation.ts` (rollout percentages, bucketing)
- Experiments: `src/flags/experiments.ts` (A/B testing with ExperimentStore)
- Barrel: `src/flags/index.ts`

**Gate Mechanisms:**
1. Env var: `FULCRUM_FEATURES=token1,token2` — lightweight `isEnabled()` check
2. Env override: `FULCRUM_FLAG_<NAME>=true|false` — per-flag override
3. DB flag: `FeatureFlag` entity — org/user scoped flags with rollout percentages
4. Connector flags: `connectorFlag()` from `src/connectors/registry.ts`

**Known Flags:**
- `saas-auth` — gates OAuth, magic-link, email OTP auth providers
- `external-llm-provider` — gates OpenAI-compatible inference backend
- `desktop-app` — gates Tauri desktop shell
- Per-connector flags (linear, github-issues, etc.)

## Webhooks & Callbacks

**Outgoing:**
- Webhook dispatcher: `src/webhooks/dispatcher.ts`
- Webhook entity: `src/db/entities/notifications/Webhook.ts`
- Webhook rule config: `src/db/entities/notifications/WebhookRuleConfig.ts`
- Delivery tracking: `src/db/entities/notifications/WebhookDelivery.ts`
- tRPC router: `src/trpc/routers/webhooks.ts`

**Incoming:**
- Better Auth callback endpoints at `/api/auth/**`
- Connector sync endpoints (pull-based, not webhook-driven)

## Notifications

**System:**
- Notification deliveries: `src/db/entities/notifications/NotificationDelivery.ts`
- Notification router: `src/trpc/routers/notifications.ts`
- Subscription procedures: `src/subscriptions/procedures.ts` (real-time via tRPC subscriptions)

## Vendor Submodules

**OpenAI Symphony:**
- Submodule: `vendor/openai-symphony` (OpenAI Symphony spec)
- Lock file: `.symphony-spec.lock`
- Conformance trace: `scripts/gen-conformance-trace.ts`
- Sync: `just sync-symphony`

## Git / Workspace Management

**Repository Integration:**
- Repo management: `src/repos/` with worker threads (`src/repos/workers/`)
- Repo files router: `src/server/trpc/routers/repo-files.ts`
- tRPC router: `src/trpc/routers/repos.ts`

## Environment Configuration

**Required env vars (production SaaS):**
- `DATABASE_URL` — PostgreSQL connection string
- `BETTER_AUTH_SECRET` — auth signing secret
- `FULCRUM_TRUSTED_ORIGINS` — allowed CORS origins

**Optional env vars:**
- `FULCRUM_FEATURES` — feature gate tokens
- `FULCRUM_INFERENCE_URL` / `FULCRUM_INFERENCE_API_KEY` — external LLM
- `LINEAR_API_KEY` / `LINEAR_TEAM_ID` — Linear integration
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — GitHub OAuth
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth
- `NODE_ENV` — production detection

**Secrets location:**
- Credentials router: `src/secrets/credentials-router.ts`
- No `.env` files committed (none detected in repo)

---

*Integration audit: 2026-05-04*
