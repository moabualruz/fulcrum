# Technology Stack

**Analysis Date:** 2026-05-06

## Languages

**Primary:**
- TypeScript ESNext - CLI, hooks, product kernel, REST API, tRPC, SvelteKit server code in `src/`, `src/api/`, `src/product-kernel/`, `src/trpc/`, `src/web/src/`
- Svelte 5 - web dashboard UI in `src/web/src/routes/` and `src/web/src/lib/components/`

**Secondary:**
- Rust 2021 - local inference sidecar workspace in `inference/` and gated Tauri desktop wrapper in `src-tauri/`
- SQL/PostgreSQL dialect - product-kernel migrations in `src/product-kernel/db/migrations/` and MikroORM migrations in `src/db/migrations/`
- TOML/YAML/Markdown - configuration and authored skill/docs content in `config/`, `skills/`, `rules/`, `docs/`

## Runtime

**Environment:**
- Bun >=1.3.0 - root CLI runtime, package manager, test runner, and single-binary compiler from `package.json`
- Browser + SvelteKit SSR runtime - web shell under `src/web/` via Vite dev server
- Rust toolchain - inference crates in `inference/Cargo.toml`; desktop shell in `src-tauri/Cargo.toml`

**Package Manager:**
- Bun - root scripts and lockfile in `package.json` and `bun.lock`
- Bun - web app scripts and lockfile in `src/web/package.json` and `src/web/bun.lock`
- Cargo - Rust workspaces in `inference/Cargo.toml`, `inference/Cargo.lock`, `src-tauri/Cargo.toml`
- Lockfile: present for root Bun, web Bun, and inference Cargo; `src-tauri/Cargo.lock` not detected in scoped scan

## Frameworks

**Core:**
- Bun compiled CLI - `src/index.ts` is root binary entry; build target `bun-darwin-arm64` in `package.json`
- Hono 4.12.16 + `@hono/zod-openapi` 1.3.0 - public REST/OpenAPI API in `src/api/hono.ts`
- tRPC - internal web/CLI/TUI procedure layer in `src/trpc/router.ts`, `src/trpc/context.ts`, `src/web/src/hooks.server.ts`
- SvelteKit 2.59.0 + Svelte 5.55.x - web shell in `src/web/`, configured by `src/web/svelte.config.js`
- Vite 8.0.x - web dev/build tool configured by `src/web/vite.config.ts`
- MikroORM v7 pattern - entity graph and migrations configured by `src/db/mikro-orm.config.ts`
- PGlite 0.4.5 + PostgreSQL/pg 8.20.0 - local-first and SaaS database backends in `src/config/database.ts`, `src/product-kernel/db/pglite.ts`, `src/product-kernel/db/postgres.ts`
- Better-Auth - session, email/password, organization, OAuth/magic-link/email-OTP wiring in `src/auth/index.ts`
- Casbin - ABAC/RBAC permission enforcement in `src/permissions/enforcer.ts` and `src/permissions/casbin-adapter.ts`
- Yjs 13.6.30 + ws 8.18.3 - realtime collaboration server in `src/server/yjs-server.ts`
- OpenTUI 0.2.2 - terminal UI adapter in `src/tui/opentui/adapter.ts`
- Effect 3.20.0 + `@ai-hero/sandcastle` 0.5.6 - sandbox/process foundations in root `package.json`
- Tauri 2 - gated desktop app wrapper in `src-tauri/Cargo.toml`

**Testing:**
- Bun test - root unit/integration tests via `bun test` from `package.json`
- Vitest 4.1.5 - web component/unit tests via `src/web/vitest.config.ts`
- Playwright 1.59.1 + axe-core - E2E and accessibility tests via `src/web/playwright.config.ts`
- Svelte Testing Library - component tests from `src/web/package.json`
- Rust cargo test - inference workspace tests under `inference/`

**Build/Dev:**
- TypeScript 5.6 root / TypeScript 6.0 web - strict TS settings in `tsconfig.json` and `src/web/tsconfig.json`
- `bun run scripts/ci.ts` - root local CI entry in `package.json`; `.planning/STATE.md` records 20/20 CI stages green
- `bun run scripts/build-all.ts` - multi-target binary build from `package.json`
- `just sync-symphony` - updates `vendor/openai-symphony` and `.symphony-spec.lock` from `justfile`
- Tailwind CSS 4.2.4 + `@tailwindcss/vite` - web styling pipeline from `src/web/package.json` and `src/web/vite.config.ts`
- shadcn-svelte, bits-ui, formsnap, sveltekit-superforms - web UI/form stack in `src/web/package.json`
- CodeMirror, TipTap/ProseMirror, Mermaid, LayerChart, TanStack table/virtual - rich editor, diagram, chart, and table surfaces in `src/web/package.json`

## Key Dependencies

**Critical:**
- `@electric-sql/pglite` 0.4.5 - default local product database in `src/config/database.ts`
- `pg` 8.20.0 - PostgreSQL SaaS backend in `src/product-kernel/db/postgres.ts`
- `hono` 4.12.16 + `@hono/zod-openapi` 1.3.0 - public REST API in `src/api/hono.ts`
- `zod` 4.4.2 - schema validation and OpenAPI schemas across `src/api/routes/`
- `better-auth` - imported by `src/auth/index.ts` for web auth; not listed in root `package.json`
- `@mikro-orm/*` - imported by `src/db/mikro-orm.config.ts`, entities, repositories, services; not listed in root `package.json`
- `@needle-di/core` - dependency injection across `src/db/db.module.ts`, `src/services/`, `src/web/src/hooks.server.ts`; not listed in root `package.json`
- `@trpc/server` - internal API layer in `src/trpc/` and `src/web/src/hooks.server.ts`; not listed in root `package.json`
- `casbin` - permission engine in `src/permissions/`; not listed in root `package.json`
- `simple-git` - repository mirroring in `src/repos/git.ts`; not listed in root `package.json`
- `yjs` 13.6.30 + `ws` 8.18.3 - collaboration state and WebSocket transport in `src/server/yjs-server.ts`

**Infrastructure:**
- `nodemailer` 8.0.7 - SMTP notifications in `src/notifications/delivery-handlers/smtp.ts`
- `web-push` 3.6.7 - VAPID push notifications in `src/notifications/delivery-handlers/push.ts`
- `@orama/orama` 3.1.18 - web-side search index in `src/web/src/lib/search/OramaIndex.ts`
- `@tiptap/*`, `svelte-tiptap`, `@tiptap/pm` - rich text editor and collaboration extensions in `src/web/package.json`
- `@codemirror/*`, `codemirror`, `svelte-codemirror-editor` - markdown/code editor stack in `src/web/package.json`
- `dompurify`, `isomorphic-dompurify`, `marked`, `unified`, `remark-*`, `rehype-*`, `@shikijs/rehype` - markdown/HTML rendering and sanitization in root and web manifests
- `fastembed` 4, `candle-*` 0.10, `tokenizers` 0.22, `reqwest` 0.12, `rusqlite` 0.32 - Rust inference/model cache stack in `inference/*/Cargo.toml`
- `tauri` 2 + updater/dialog/fs plugins - desktop wrapper in `src-tauri/Cargo.toml`

## Configuration

**Environment:**
- `FULCRUM_HOME` controls local state root; resolved by `src/config/database.ts`, `src/product-kernel/paths.ts`, `src/web/src/lib/server/db.ts`, and Rust inference files
- `DATABASE_URL` switches database backend to PostgreSQL when it starts with `postgresql://` or `postgres://` in `src/config/database.ts`
- `FULCRUM_FEATURES` gates online/SaaS features across `src/api/feature-flags.ts`, `src/web/src/routes/settings/*`, `src/collab/feature-flag.ts`, `src/router/auto-assign.ts`
- `FULCRUM_REQUIRE_AUTH` turns on web route auth guard in `src/web/src/hooks.server.ts`
- `BETTER_AUTH_SECRET`, `FULCRUM_TRUSTED_ORIGINS`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` configure Better-Auth in `src/auth/index.ts`
- `FULCRUM_INFERENCE_BACKEND`, `FULCRUM_INFERENCE_URL`, `FULCRUM_INFERENCE_API_KEY` configure inference backends in `src/server/trpc/routers/inference.ts`, `src/inference/backends/openai-compatible.ts`
- `FULCRUM_YJS_URL`, `FULCRUM_YJS_PORT`, `FULCRUM_YJS_STANDALONE` configure Yjs collaboration in `src/server/yjs-server.ts`
- `.env*` files: not detected; forbidden from reading by mapper policy

**Build:**
- Root scripts: `package.json`
- Root TypeScript config: `tsconfig.json`
- Web scripts/config: `src/web/package.json`, `src/web/tsconfig.json`, `src/web/vite.config.ts`, `src/web/svelte.config.js`
- Web testing config: `src/web/vitest.config.ts`, `src/web/playwright.config.ts`
- Root database ORM config: `src/db/mikro-orm.config.ts`
- Rust workspaces: `inference/Cargo.toml`, `src-tauri/Cargo.toml`
- Project runner: `justfile`

## Platform Requirements

**Development:**
- Install Bun >=1.3.0 before running root scripts from `package.json`
- Use `bun run ci` for full local gate; `.planning/STATE.md` identifies this as source of truth
- Use `bun run dev` at root for CLI development and `cd src/web && bun run dev` for SvelteKit web development
- Use `bun test` for root tests, `cd src/web && bun run web:test` for web Vitest, and `cd src/web && bun run web:e2e:smoke` for smoke E2E
- Rust toolchain required for `inference/` and `src-tauri/`
- `just sync-symphony` requires initialized `vendor/openai-symphony` submodule

**Production:**
- CLI ships as Bun-compiled binary from `scripts/build-all.ts` / root `build:all`
- Local-first product DB defaults to PGlite under `FULCRUM_HOME`; PostgreSQL SaaS mode requires `DATABASE_URL`
- SvelteKit uses `@sveltejs/adapter-auto`; concrete hosting adapter is not pinned in `src/web/svelte.config.js`
- Desktop app is gated by `FULCRUM_FEATURES=desktop-app` in `src-tauri/Cargo.toml` description and `src/web/src/lib/tauri/ipc.ts`

---

*Stack analysis: 2026-05-06*
