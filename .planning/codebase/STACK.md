# Technology Stack

**Analysis Date:** 2026-05-04

## Languages

**Primary:**
- TypeScript 5.6+ — CLI core (`src/`), web frontend (`src/web/`), tRPC server, all business logic
- TypeScript 6.0+ — web frontend (`src/web/package.json` declares `typescript: ^6.0.2`)

**Secondary:**
- Rust (2021 edition) — local inference engine (`inference/` workspace), Tauri desktop shell (`src-tauri/`)
- SQL — MikroORM migrations (`src/db/migrations/`), PGlite embedded

## Runtime

**Environment:**
- Bun >= 1.3.0 (primary runtime, declared in `package.json` engines)
- Node.js compatibility via Bun's Node API shims (`node:crypto`, `node:fs`, etc.)

**Package Manager:**
- Bun (root `bun.lockb` lockfile)
- Bun (web `src/web/bun.lockb`)
- Cargo (Rust workspace `inference/Cargo.toml`, `src-tauri/Cargo.toml`)

## Frameworks

**Core:**
- SvelteKit 2.57+ / Svelte 5.55+ (runes mode forced) — web UI (`src/web/`)
- Hono 4.12.16 — HTTP API layer (`src/api/`)
- tRPC — RPC layer between web frontend and backend (`src/trpc/`, `src/server/trpc/`)
- Effect 3.20.0 — functional effect system (`src/` various modules)
- Tauri 2 — desktop app wrapper, gated behind `FULCRUM_FEATURES=desktop-app` (`src-tauri/`)

**Testing:**
- Vitest 4.1+ — web component/unit tests (`src/web/`)
- Playwright 1.59+ — E2E and a11y tests (`src/web/tests/e2e/`, `src/web/tests/a11y/`)
- bun:test — CLI/core unit tests (`bun test` at root)
- Testing Library Svelte 5.3+ — component testing (`src/web/`)
- happy-dom 20.9 / jsdom 29.1 — DOM environments for tests

**Build/Dev:**
- Vite 8.0+ — web dev server and build (`src/web/`)
- Bun compile — CLI binary (`bun build --compile --minify`)
- Cargo — Rust inference workspace build
- `scripts/build-all.ts` — cross-platform build orchestrator
- `scripts/ci.ts` — CI pipeline runner
- `scripts/release.ts` — release automation

## Key Dependencies

**Critical:**
- `@electric-sql/pglite` 0.4.5 — embedded PostgreSQL for local-first mode (`src/db/`)
- `@mikro-orm/postgresql` + `@mikro-orm/migrations` (v7) — ORM with decorator entities (`src/db/entities/`)
- `better-auth` — authentication framework (`src/auth/index.ts`)
- `zod` 4.4.2 — schema validation (tRPC schemas, API validation)
- `zustand` 5.0.12 — state management (product kernel store)
- `@needle-di/core` — dependency injection (Stage-3 decorators)

**Web UI:**
- `bits-ui` 2.16+ — headless Svelte components
- `shadcn-svelte` 1.2+ — component library
- `tailwindcss` 4.2+ — styling via `@tailwindcss/vite` plugin
- `@tiptap/core` 3.22+ / `svelte-tiptap` 3.0 — rich text editor
- `codemirror` 6+ / `svelte-codemirror-editor` — code editor
- `lucide-svelte` / `@lucide/svelte` — icons
- `sveltekit-superforms` 2.30+ — form handling
- `formsnap` 2.0+ — form components
- `svelte-sonner` — toast notifications
- `svelte-dnd-action` 0.9+ — drag and drop
- `marked` 18+ / `dompurify` 3.4+ — markdown rendering + sanitization
- `valibot` 1.3+ — additional validation (web-side)

**Infrastructure:**
- `pg` 8.20 — PostgreSQL client for SaaS mode
- `hono` 4.12.16 + `@hono/zod-openapi` 1.3 — OpenAPI-typed HTTP routes
- `effect` 3.20 + `@effect/platform` 0.95 — structured concurrency, platform abstractions
- `yaml` 2.8.3 — YAML parsing (config files, agent profiles)
- `smol-toml` 1.4+ — TOML parsing
- `unified` 11 + `rehype-parse` / `rehype-remark` / `remark-stringify` — HTML-to-markdown pipeline

**Rust Inference Crates:**
- `tokio` 1 (full) — async runtime
- `serde` 1 + `serde_json` 1 — serialization
- `reqwest` 0.12 (rustls-tls) — HTTP client
- `rusqlite` 0.32 (bundled) — local model cache
- `sha2` 0.10 — hashing
- `toml` 0.8 — config parsing

**Tauri Desktop:**
- `tauri` 2 (updater feature) — desktop shell
- `tauri-plugin-updater` 2 — auto-update
- `tauri-plugin-dialog` 2 — native dialogs
- `tauri-plugin-fs` 2 — filesystem access

## Configuration

**Environment:**
- `FULCRUM_FEATURES` — comma-separated feature gate tokens (e.g., `desktop-app`, `saas-auth`)
- `FULCRUM_FLAG_<NAME>` — per-flag env override (e.g., `FULCRUM_FLAG_SAAS_AUTH=true`)
- `DATABASE_URL` — PostgreSQL connection for SaaS mode (absent = PGlite local)
- `BETTER_AUTH_SECRET` — auth secret (required in production)
- `FULCRUM_TRUSTED_ORIGINS` — comma-separated CORS origins
- `FULCRUM_INFERENCE_URL` / `FULCRUM_INFERENCE_API_KEY` — external LLM endpoint
- `LINEAR_API_KEY` / `LINEAR_TEAM_ID` — Linear connector
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` — GitHub OAuth
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google OAuth

**TypeScript (root):**
- `tsconfig.json` — ESNext target, bundler moduleResolution, strict, `@/*` path alias to `src/*`
- Excludes `src/web/**` (web has own tsconfig)

**TypeScript (web):**
- SvelteKit-managed tsconfig
- Svelte 5 runes mode forced via `svelte.config.js` compilerOptions

**Build:**
- `package.json` scripts — `dev`, `build`, `build:all`, `test`, `lint`, `ci`, `changelog`, `release`
- `src/web/package.json` scripts — `dev`, `build`, `test`, `web:test`, `web:e2e`, `web:a11y`, `i18n:extract`
- `justfile` — `sync-symphony` recipe (vendor submodule sync + conformance trace)
- Bun compile targets: `bun-darwin-arm64` (default), `build:all` for cross-platform

## Platform Requirements

**Development:**
- Bun >= 1.3.0
- Rust toolchain (for inference engine, optional — gated)
- Node.js not required (Bun provides Node API compat)

**Production (Local-First):**
- Single compiled Bun binary (`dist/fulcrum-darwin-arm64`)
- PGlite embedded — no external database required
- Tauri desktop shell (optional, gated behind `desktop-app` feature)

**Production (SaaS):**
- PostgreSQL server (via `DATABASE_URL`)
- `BETTER_AUTH_SECRET` required
- OAuth provider credentials for social login

---

*Stack analysis: 2026-05-04*
