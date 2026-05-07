# External Integrations

**Analysis Date:** 2026-05-06

## APIs & External Services

**Public API:**
- Hono/OpenAPI REST API - external clients use `/api/v1/*` when `FULCRUM_FEATURES=public-api`
  - SDK/Client: `hono`, `@hono/zod-openapi`
  - Auth: Bearer API key stored as SHA-256 hash via `apps/server/src/api/auth.ts`, `src/product-kernel/store/repositories.ts`
  - Files: `apps/server/src/api/hono.ts`, `apps/server/src/api/routes/*`, `apps/web/src/routes/api/v1/+server.ts`, `apps/web/src/routes/api/v1/openapi.json/+server.ts`

**Internal Web API:**
- tRPC fetch adapter - SvelteKit, CLI, and TUI share procedures
  - SDK/Client: `@trpc/server`
  - Auth: Better-Auth session in web locals or local CLI session context
  - Files: `apps/server/src/trpc/router.ts`, `apps/server/src/trpc/context.ts`, `apps/web/src/hooks.server.ts`, `apps/web/src/routes/api/trpc/[...path]/+server.ts`

**Project Management Connectors:**
- GitHub Issues - pull/push issue sync via GitHub REST API
  - SDK/Client: native `fetch`
  - Auth: `GITHUB_TOKEN`
  - Config: `GITHUB_REPO`
  - Files: `src/connectors/github-issues.ts`, `src/product-kernel/connectors/github-sync.ts`
- Linear - GraphQL issue sync
  - SDK/Client: native `fetch`
  - Auth: `LINEAR_API_KEY`
  - Config: `LINEAR_TEAM_ID`
  - Files: `src/connectors/linear.ts`, `apps/web/src/routes/settings/integrations/linear/+page.server.ts`
- Notion - page/database import/sync
  - SDK/Client: native `fetch`
  - Auth: token provided to connector options / credential store
  - Files: `src/connectors/notion.ts`, `src/product-kernel/connectors/notion.ts`
- Jira - issue sync adapter
  - SDK/Client: native `fetch`
  - Auth: connector options / credential store
  - Files: `src/connectors/jira.ts`
- GitLab - issue sync adapter
  - SDK/Client: native `fetch`
  - Auth: connector options / credential store
  - Files: `src/connectors/gitlab.ts`, `src/product-kernel/connectors/gitlab-sync.ts`
- Bitbucket - repository/work item sync adapter
  - SDK/Client: native `fetch`
  - Auth: connector options / credential store
  - Files: `src/connectors/bitbucket.ts`, `src/product-kernel/connectors/bitbucket-sync.ts`
- Confluence - content sync/conversion
  - SDK/Client: native `fetch`
  - Auth: connector options / credential store
  - Files: `src/connectors/confluence.ts`, `src/product-kernel/connectors/confluence-client.ts`, `src/product-kernel/connectors/confluence-sync.ts`
- Plane - issue sync adapter
  - SDK/Client: native `fetch`
  - Auth: connector options / credential store
  - Files: `src/connectors/plane.ts`

**Inference Providers:**
- Embedded Rust sidecar - local HTTP/stdin inference service
  - SDK/Client: native `fetch`, Unix socket/stdin protocol
  - Auth: local process boundary
  - Config: `FULCRUM_INFERENCE_BACKEND=embedded`, `FULCRUM_INFERENCE_URL`, `FULCRUM_HOME`, `FULCRUM_MODELS_DIR`
  - Files: `src/inference/backends/embedded.ts`, `src/inference/lifecycle.ts`, `inference/inference-server/src/main.rs`
- Ollama - local LLM backend
  - SDK/Client: native `fetch` to `http://localhost:11434`
  - Auth: none detected
  - Config: selected via `FULCRUM_INFERENCE_BACKEND` / router feature flags
  - Files: `src/inference/backends/ollama.ts`, `src/inference/backend-probes.ts`
- LM Studio - local OpenAI-compatible backend
  - SDK/Client: native `fetch` to `http://localhost:1234`
  - Auth: none detected
  - Config: selected via `FULCRUM_INFERENCE_BACKEND` / router feature flags
  - Files: `src/inference/backends/lm-studio.ts`
- OpenAI-compatible endpoint - remote or local `/v1/*` inference API
  - SDK/Client: native `fetch`
  - Auth: `FULCRUM_INFERENCE_API_KEY`
  - Config: `FULCRUM_INFERENCE_URL`
  - Files: `src/inference/backends/openai-compatible.ts`, `src/inference/backend-probes.ts`

**Notifications:**
- SMTP email delivery
  - SDK/Client: `nodemailer`
  - Auth: `SMTP_USER`, `SMTP_PASS`
  - Config: `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`
  - Files: `src/notifications/delivery-handlers/smtp.ts`, `src/product-kernel/notifications/email.ts`
- Web Push
  - SDK/Client: `web-push`
  - Auth: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`
  - Config: `WEB_PUSH_SUBJECT`, `WEB_PUSH_TIMEOUT_MS`, `FULCRUM_FEATURES=notify-push`
  - Files: `src/notifications/delivery-handlers/push.ts`, `apps/web/src/service-worker.ts`
- Slack webhook notifications
  - SDK/Client: native `fetch`
  - Auth: webhook URL secret in payload/credential storage
  - Files: `src/product-kernel/notifications/slack.ts`
- Discord webhook notifications
  - SDK/Client: native `fetch`
  - Auth: webhook URL secret in payload/credential storage
  - Files: `src/product-kernel/notifications/discord.ts`
- Generic outgoing webhooks
  - SDK/Client: native `fetch`
  - Auth: HMAC SHA-256 signing with per-webhook secret
  - Files: `src/notifications/delivery-handlers/webhook.ts`, `apps/webhooks/dispatcher.ts`

**Telemetry:**
- Remote telemetry batch endpoint
  - SDK/Client: native `fetch`
  - Auth: HMAC SHA-256 via `FULCRUM_TELEMETRY_SECRET`
  - Config: `FULCRUM_FEATURES=telemetry-remote`, `FULCRUM_TELEMETRY_ENDPOINT`
  - Files: `src/platform/remote-telemetry.ts`

**Skill Marketplace / MCP Docs:**
- Fulcrum skill marketplace publishing
  - SDK/Client: native `fetch`
  - Auth: not detected in implementation scan
  - Files: `src/skills/marketplace-publisher.ts`
- MCP external tools described for GitHub, Context7, Tavily
  - SDK/Client: external CLIs/MCP servers, not core runtime clients
  - Auth: `GITHUB_TOKEN`, `CONTEXT7_API_KEY`, `TAVILY_API_KEY`
  - Files: `docs/mcp.md`, `config/mcp-registry.toml`

## Data Storage

**Databases:**
- PGlite local-first PostgreSQL-compatible database
  - Connection: `FULCRUM_HOME` and persisted config; default data dir from `src/config/database.ts`
  - Client: `@electric-sql/pglite`, custom PGlite Kysely/MikroORM dialect in `src/db/PGliteKyselyDriver.ts`
  - Files: `src/config/database.ts`, `src/product-kernel/db/pglite.ts`, `apps/web/src/lib/server/db.ts`
- PostgreSQL server mode
  - Connection: `DATABASE_URL`
  - Client: `pg`, MikroORM PostgreSQL driver, product-kernel SQL wrapper
  - Files: `src/config/database.ts`, `src/product-kernel/db/postgres.ts`, `src/db/mikro-orm.config.ts`
- SQLite model cache inside Rust inference server
  - Connection: `FULCRUM_HOME` / model cache path
  - Client: `rusqlite` with bundled SQLite
  - Files: `inference/inference-server/Cargo.toml`, `inference/inference-server/src/cache.rs`, `inference/inference-server/src/models.rs`

**File Storage:**
- Local filesystem artifacts and state under `FULCRUM_HOME`
  - Files: `src/product-kernel/paths.ts`, `src/artifacts/storage.ts`, `apps/web/src/lib/tauri/ipc.ts`
- Pluggable object storage backends exist for S3, GCS, Azure, GitHub, GitLab, Bitbucket metadata
  - Files: `src/product-kernel/store/s3-backend.ts`, `src/product-kernel/store/gcs-backend.ts`, `src/product-kernel/store/azure-backend.ts`, `src/product-kernel/store/storage-factory.ts`

**Caching:**
- Inference model cache in Rust sidecar via `rusqlite`
  - Files: `inference/inference-server/src/cache.rs`
- Search/index caching through product DB search tables and web Orama index
  - Files: `src/product-kernel/search.ts`, `src/search/indexers/`, `apps/web/src/lib/search/OramaIndex.ts`
- Metrics/cache entities in product database
  - Files: `src/db/entities/tasks/MetricsCache.ts`

## Authentication & Identity

**Auth Provider:**
- Better-Auth for web sessions and SaaS auth wiring
  - Implementation: MikroORM adapter, email/password always enabled, organization plugin always enabled, OAuth/magic-link/email-OTP gated behind `saas-auth`
  - Env: `BETTER_AUTH_SECRET`, `FULCRUM_TRUSTED_ORIGINS`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
  - Files: `src/auth/index.ts`, `src/auth/adapter.ts`, `apps/web/src/hooks.server.ts`
- Passkeys/WebAuthn support
  - Implementation: passkey routes and helpers
  - Files: `src/auth/passkey.ts`, `apps/web/src/routes/auth/passkey/*`
- Public API keys
  - Implementation: Bearer token hashed with SHA-256 and looked up in `api_keys`
  - Files: `apps/server/src/api/auth.ts`, `src/product-kernel/store/repositories.ts`, `apps/web/src/routes/settings/api/+page.server.ts`
- Authorization
  - Implementation: Casbin ABAC enforcer backed by MikroORM adapter
  - Files: `src/permissions/enforcer.ts`, `src/permissions/casbin-adapter.ts`, `src/db/entities/flags/CasbinRule.ts`

## Monitoring & Observability

**Error Tracking:**
- Internal database-backed error logs
  - Files: `src/db/entities/platform/ErrorLog.ts`, `apps/server/src/runtime/trpc/routers/error-logs.ts`, `apps/web/src/routes/settings/errors/+page.server.ts`
- External error tracking service: Not detected

**Logs:**
- Console logging for web startup/collab failures in `apps/web/src/hooks.server.ts` and `src/collab/server.ts`
- Audit/event records in database through `src/db/entities/core/Event.ts`, `src/product-kernel/event-dispatcher.ts`, `src/product-kernel/store/audit.ts`
- Telemetry events and remote outbox in `src/db/entities/platform/TelemetryEvent.ts`, `src/db/entities/platform/TelemetryOutbox.ts`, `src/platform/remote-telemetry.ts`

## CI/CD & Deployment

**Hosting:**
- CLI binary distributed from Bun compile outputs in `dist/` via `scripts/build-all.ts`
- Web app uses `@sveltejs/adapter-auto` in `apps/web/svelte.config.js`; exact hosting platform not pinned
- Desktop app uses Tauri 2 wrapper in `src-tauri/`
- Docker compose exists only in vendored `vendor/openai-symphony/elixir/test/support/live_e2e_docker/`; no first-party deployment compose detected

**CI Pipeline:**
- Local CI only: `bun run ci` in root `package.json` and `.planning/STATE.md`
- GitHub Actions: intentionally not source of truth per `AGENTS.md`; workflow files not detected in scan

## Environment Configuration

**Required env vars:**
- Local default: none required for basic PGlite/dev mode
- `FULCRUM_HOME` - optional local state root override
- `DATABASE_URL` - required only for PostgreSQL backend/SaaS mode
- `FULCRUM_FEATURES` - feature gates for `public-api`, `saas-auth`, `notify-webhook`, `notify-push`, `telemetry-remote`, `real-time-collab-server`, connector flags, inference/router flags
- `FULCRUM_REQUIRE_AUTH` - require login for web routes
- `BETTER_AUTH_SECRET` - required in production by `src/auth/index.ts`
- `GITHUB_TOKEN`, `GITHUB_REPO` - GitHub Issues connector
- `LINEAR_API_KEY`, `LINEAR_TEAM_ID` - Linear connector
- `FULCRUM_INFERENCE_BACKEND`, `FULCRUM_INFERENCE_URL`, `FULCRUM_INFERENCE_API_KEY` - inference providers
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` - SMTP delivery
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`, `WEB_PUSH_TIMEOUT_MS` - web push delivery
- `FULCRUM_TELEMETRY_ENDPOINT`, `FULCRUM_TELEMETRY_SECRET` - remote telemetry
- `FULCRUM_YJS_URL`, `FULCRUM_YJS_PORT`, `FULCRUM_YJS_STANDALONE` - Yjs collaboration server

**Secrets location:**
- Runtime environment variables for provider credentials and secrets
- Database credential entities for product integrations: `src/db/entities/platform/Credential.ts`, `src/db/entities/inference/ProviderCredential.ts`, `src/db/entities/connectors/ConnectorSyncLog.ts`
- Secret encryption helpers in `src/secrets/keyring.ts`, `src/secrets/vault.ts`
- `.env*` files not detected; mapper did not read secret files

## Webhooks & Callbacks

**Incoming:**
- Better-Auth HTTP callbacks under `/api/auth/**`
  - Files: `apps/web/src/hooks.server.ts`, `apps/web/src/routes/auth/*`
- Public API endpoints under `/api/v1/**`
  - Files: `apps/server/src/api/hono.ts`, `apps/web/src/routes/api/v1/+server.ts`
- tRPC endpoints under `/api/trpc/**`
  - Files: `apps/web/src/routes/api/trpc/[...path]/+server.ts`
- Yjs WebSocket server for collaboration
  - Files: `apps/server/src/runtime/yjs-server.ts`
- Hocuspocus-style collaboration server hook is dynamically imported but package dependency is not declared in manifests
  - Files: `src/collab/server.ts`

**Outgoing:**
- Generic signed webhooks with retry/backoff
  - Files: `apps/webhooks/dispatcher.ts`, `src/notifications/delivery-handlers/webhook.ts`
- SMTP email
  - Files: `src/notifications/delivery-handlers/smtp.ts`
- Web Push
  - Files: `src/notifications/delivery-handlers/push.ts`, `apps/web/src/service-worker.ts`
- Slack and Discord webhook delivery
  - Files: `src/product-kernel/notifications/slack.ts`, `src/product-kernel/notifications/discord.ts`
- Remote telemetry HMAC batch POST
  - Files: `src/platform/remote-telemetry.ts`
- External connector pulls/pushes to GitHub, Linear, Notion, Jira, GitLab, Bitbucket, Confluence, Plane
  - Files: `src/connectors/*.ts`, `src/product-kernel/connectors/*.ts`
- Inference backend HTTP calls to embedded sidecar, Ollama, LM Studio, and OpenAI-compatible endpoints
  - Files: `src/inference/backends/*.ts`, `src/inference/backend-probes.ts`

---

*Integration audit: 2026-05-06*
