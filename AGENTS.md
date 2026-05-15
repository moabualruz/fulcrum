# Fulcrum — AGENTS.md

> Project-level instructions for any agent (or human) working in this repo.

## What Fulcrum is becoming

**Fulcrum is a local-first CLI Agent OS for supervising repositories, tasks, agent runs, context, memory, and artifacts.**

That destination. Current `main` = foundation work: cross-agent install layer, hook plumbing, skills, rules, output policy, component lifecycle, package mirrors, MCP registry, CLI orchestrator everything else sit on top of. Mile zero of long road; every commit advance foundation, not jump ahead.

## Where we are right now (foundation)

Current `main` foundation includes:

- One Bun-compiled `fulcrum` binary, eight hook subcommands (`format`, `lint-gate`, `pm-policy`, `test-on-edit`, `audit-log`, `index-check`, `index-rebuild`, `tool-output-router`).
- Orchestrator (`fulcrum init / install / hooks / skills / doctor / compress`) wires hooks into five agent runtimes (Claude Code, Codex CLI, Gemini CLI, OpenCode, Pi CLI).
- Sentinel-block rules splicer for cross-agent rules distribution.
- Per-tool output-handling policy (`config/tool-output-policy.toml`) drives `tool-output-router` hook.
- 29 in-repo skills caveman-compressed (`.original.md` beside each), 20-entry trigger evals each, content-verified against upstream sources.
- `src/agents/registry.ts` — canonical `Agent` interface + `AGENTS[5]` array; single source of truth consumed by install, doctor, skills. No more inline agent configs scattered across files.
- `fulcrum install --profile minimal|rules-only|full --dry-run` support; `fulcrum doctor --json` for machine-readable health output.
- `bun run compress` (`apps/cli/src/compress.ts`) — idempotent caveman compression of in-repo content; `--check` for CI.
- Local CI runner (`bun run ci`) — 6 stages: install / typecheck / test / build:all / skills:lint / compress:check (hard gate). Local release runner (`bun run release vX.Y.Z`). `fulcrum doctor` shows caveman `defaultMode`, per-agent install state, MCP health, skill metadata budget, and ignored project worktree warnings. Skills lint enforces rules ≤ 200 lines. CHANGELOG via `git-cliff`.

## Where we are going (placeholders, not implementations)

Layers foundation prep for. **Not built yet** — do not assume exist or write code depending on them. Listed so anyone reading repo see trajectory.

- **Repository supervisor** — multi-repo awareness, work-tree state, branch posture.
- **Task system** — durable units of work (issues/tasks) tracked across agent sessions.
- **Agent runs** — first-class agent invocations with inputs, outputs, transcripts, retries.
- **Context engine** — selecting + assembling what each run sees, beyond existing rules splice.
- **Memory** — persistent facts, decisions, references across sessions.
- **Artifacts** — outputs of runs (diffs, plans, reports) tracked, addressable, queryable.
- **Plugins / extensions** — generic `fulcrum plugins …` UX for third-party drop-ins. Package-specific lifecycle mirroring already exists for Caveman, Cloudflare, and Superpowers.

## Skill namespacing — the `fulcrum:` prefix

`fulcrum skills sync` distributes authored skills using each agent's native namespacing primitive:

```
Claude Code: plugin (fulcrum@fulcrum)
             ~/.claude/plugins/cache/fulcrum/fulcrum/<ver>/skills/<name>/SKILL.md
             invocation: /fulcrum:<name>
Codex CLI:   ~/.codex/skills/fulcrum/<name>/SKILL.md            (global opt-in)
             .codex/skills/fulcrum/<name>/SKILL.md              (project opt-in)
OpenCode:    ~/.config/opencode/skills/fulcrum/<name>/SKILL.md  (nested supported)
Pi CLI:      ~/.pi/agent/skills/fulcrum/<name>/SKILL.md         (nested supported)
Gemini CLI:  ~/.gemini/extensions/fulcrum-skills/skills/<name>/SKILL.md
             (extension itself is the namespace)
```

**Why Claude Code differs:** Claude Code's skill loader scans the **top level** of `~/.claude/skills/` only. The `<dir>/fulcrum/<name>/` layout other agents use is invisible to it (open issues anthropics/claude-code#28266, #18192, #39138). Plugin namespace is the supported path — `.claude-plugin/marketplace.json` at repo root declares the `fulcrum` marketplace, `.claude-plugin/plugin.json` declares the plugin. `fulcrum skills sync` runs `claude plugin marketplace add moabualruz/fulcrum && claude plugin install fulcrum@fulcrum`. Skills surface as `/fulcrum:<name>` (e.g. `/fulcrum:jq`).

Other agents (Codex, OpenCode, Pi) walk nested skill dirs natively; Gemini uses an extension scope. Codex global authored skills are skipped by default to avoid user-wide metadata pressure; use `fulcrum skills sync --codex-global` or `--codex-project <dir>` explicitly. All five end up with the same effective `fulcrum:<skill-name>` address space, but the install mechanism differs by agent. Agents still invoke skills by frontmatter `name:` (no colons in identifiers — namespacing path-based or plugin-mediated).

**Migration:** Old Claude Code installs that wrote to `~/.claude/skills/fulcrum/<name>/` are removed automatically by `fulcrum skills sync` after the plugin install succeeds. Re-running `fulcrum install` is idempotent; if the plugin is already registered in `~/.claude/plugins/installed_plugins.json`, the install step is skipped.

## Cross-agent rules distribution

`fulcrum install` reads `rules/AGENTS.md`, sentinel-splices body into each detected agent's primary rules file. User content outside `<!-- BEGIN/END FULCRUM RULES -->` markers preserved verbatim. Idempotent — re-running `fulcrum install` replaces only spliced block.

| Agent | Primary rules file | Method |
|---|---|---|
| Claude Code | `~/.claude/CLAUDE.md` | sentinel splice |
| Codex CLI | `~/.codex/AGENTS.md` | sentinel splice |
| OpenCode | `~/.config/opencode/AGENTS.md` (also reads `~/.claude/CLAUDE.md`) | sentinel splice |
| Pi CLI | `~/.pi/agent/AGENTS.md` | sentinel splice |
| Gemini CLI | `~/.gemini/GEMINI.md` | body placed at `~/AGENTS.md`; `GEMINI.md` becomes single line `@AGENTS.md` (Gemini inlines `@` imports) |

Project-level enforcement: drop `rules/AGENTS.md` at `<consumer-repo>/AGENTS.md` (or `<consumer-repo>/GEMINI.md` for Gemini-only repos).

Companion artifacts travel with rules:

- Hook recipes — `hooks/recipes/*.snippet.md`, vendored to `~/.fulcrum/hooks/snippets/` by install. Per-agent registration in `docs/hooks.md`.
- Skill registry — `skills/SOURCES.md`. `fulcrum skills sync` mirrors `skills/<name>/` to each agent's native namespace, excluding `.original.md` and source-only folders from generated CLI agent mirrors while keeping them in project source.

## Conventions that apply to current work

- **Skills are one tool, one skill.** Don't fold multiple unrelated tools into one SKILL.md. Exception: two CLIs tightly coupled + ship together (e.g. `dart format` + `dart analyze` → `dart-toolchain`).
- **Skill content correctness not implied by lint.** `fulcrum skills lint` verify frontmatter shape + five required H2 sections. Does **not** verify flags, default values, subcommands accurate against upstream. Authors must verify against tool's `--help` or upstream README before submitting. Previous batch found 46% content-error rate among parallel-authored skills — assume same risk on new ones.
- **Reuse-first product engineering.** Before non-trivial product/platform feature, research free/open-source tools, libraries, schemas, UI blocks, workflow engines, CLIs, self-hostable apps. Prefer deps + embeddable/local/self-hosted building blocks over bespoke code; hosted third-party integrations OK when they materially shorten path without compromising local-first defaults. If candidate covers ~75%+ with acceptable license/runtime/ownership risk, adopt it and build gap. If fit <~75%, strategic, or unclear, stop and present options for user choice before building.
- **Responsibility-first code names.** Never name code files, folders, tests, symbols, generated fixtures, or user-visible code labels after phases, goals, plan status, or third-party product inspiration. Names must describe what the module does: responsibility, domain value, behavior, or integration boundary. Put inspiration/provenance in docs, README, or copied-source metadata. Existing violations are migration debt; do not add more.
- **Service-oriented DDD target.** Product code should move toward bounded services/domains with `domain`, `application`, `infrastructure`, and `interface` boundaries, so a service can later split into its own package, process, or repository. Web, CLI, and TUI remain invocation/visualization layers and must call APIs/services instead of owning business logic or persistence.
- **Single NestJS/TypeORM server target.** Fulcrum server code must converge on NestJS standard structure: feature modules own controllers, providers/application services, DTOs, guards/interceptors when needed, and Swagger/OpenAPI decorators through `@nestjs/swagger`. Do not keep Hono or other HTTP routers beside NestJS. Do not keep MikroORM/Kysely beside TypeORM. Migrations are TypeScript TypeORM migration classes only; never `.sql` migration files.
- **Dependency consolidation.** Prefer one dependency per responsibility. A duplicate framework, router, ORM, schema/migration tool, queue, or UI state stack is architecture debt unless it has a current documented production reason and removal owner.
- **Online standards research source.** For the current NestJS/TypeORM cleanup and copy-first replacement, use `.planning/phases/09.6-product-workflow-completeness-human-agent-journeys/09.6-NESTJS-REPOSITORY-STANDARDS-RESEARCH.md` as the source artifact. It is grounded in official NestJS modules/monorepo/database/validation/OpenAPI/configuration docs, TypeORM migration docs, npm workspaces docs, and GitHub README/contribution/CODEOWNERS docs.
- **NestJS repo layout.** `apps/server` is the only backend runtime. It owns `main.ts`, root `AppModule`, bootstrap, config, global `ValidationPipe`, Swagger setup, and module composition. Bounded services under `services/**` behave like Nest library modules: they expose modules/providers from service roots and keep domain/application/infrastructure/interface code behind that module boundary. Do not add server-side tRPC/Hono/custom route trees as final APIs; convert them to Nest controllers and generated clients.
- **TypeORM persistence layout.** TypeORM entities, repositories, and migrations live under the owning service's `src/infrastructure/database/**` or platform database infrastructure. Feature modules register repositories via `TypeOrmModule.forFeature(...)`. Migrations are TypeScript classes/modules implementing the selected TypeORM migration shape; tracked `.sql` migrations are prohibited.
- **Zod is the validation library.** Do not introduce `class-validator`/`class-transformer`. Use Zod schemas for DTOs, request validation, config parsing. Wire via custom `ZodValidationPipe`. For Swagger, use `@nestjs/swagger` decorators explicitly or a Zod-Swagger bridge (`nestjs-zod` or `@anatine/zod-nestjs`).
- **NestJS coding standards.** Controllers are thin — delegate to services immediately, handle only HTTP concerns (status codes, response mapping, Swagger decorators). Services own business logic — inject repositories, return domain objects, throw domain exceptions (not `HttpException`). DTOs: one per operation (`CreateXDto`, `UpdateXDto`); derive variants via `PartialType`/`PickType`/`OmitType` from `@nestjs/mapped-types`. Never expose entities directly as API responses — map to response DTOs. Module boundaries: modules export services, never repositories or entities. Cross-module communication via exported services or `@nestjs/event-emitter`. Tests co-located: `.spec.ts` beside source for unit, `test/` at app root for e2e.
- **Clean GitHub repository layout.** Root metadata and governance stay in standard locations: `README.md`, `LICENSE*`, `CONTRIBUTING.md`/`docs/**`, optional `.github/**`, and CODEOWNERS when ownership rules exist. Runtime code belongs only in `apps/**` and `services/**`; tests belong under service/surface/architecture/support roots; generated artifacts and preserved upstream clones stay ignored.
- **Documentation retrieval deterministic by default.** For Fulcrum project-management, documentation, memory, context surfaces, do not introduce embeddings, RAG pipelines, semantic search, or local/remote model deps unless user explicitly approves design. Prefer structured metadata, full-text search, filters, backlinks, source refs, task/doc relationships, deterministic query/index engines.
- **No GitHub Actions workflows by default.** Local `bun run ci` + local `bun run release` = gates. If workflow added later, must be additive, not source of truth.
- **Batch verification during large migrations.** For long-running replacement/refactor goals, work in coherent batches of 3-5 vertical slices before broad verification unless a risky cross-cutting edit needs an earlier gate. During a slice, run only focused RED/GREEN tests and narrow scans for the files/behavior changed. Defer `bun run lint`, `bun run lint:boundaries`, `git diff --check`, graph refresh, and other broad gates until the batch boundary or handoff. Run full `bun run ci` only at major milestones or when focused failures indicate broad breakage.
- **No new docs files unless asked.** Update existing docs in place; don't generate planning, decision, or analysis markdown alongside code changes.
- **One commit per logical change.** Bisect granularity matter — separate fixes from features.

## How to read this repo

- `README.md` — install + usage.
- `HANDOVER.md` — current-state snapshot, outstanding work, recent decisions.
- `docs/` — per-topic foundation docs (context, hooks, skills, mcp, agents, capabilities, tool-output policy).
- `docs/caveman.md` — reference: what gets compressed, install, defaultMode, CI gate, doctor, opt-out.
- `rules/AGENTS.md` — body sentinel-spliced into each agent's primary rules file. Different audience from this file: that = "how agent should behave inside any project", this = "what fulcrum is + where going".
- `src/agents/registry.ts` — start here to understand how five agents defined; consumed by install, doctor, skills.
- `skills/SOURCES.md` — skill registry + authoring queue.

## Agent skills

### Issue tracker

Issues tracked as local markdown under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Multi-context layout: `CONTEXT-MAP.md` at root pointing to per-context `CONTEXT.md` files. See `docs/agents/domain.md`.
