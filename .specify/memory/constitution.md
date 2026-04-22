# Fulcrum Constitution

This constitution governs subsequent Fulcrum development. It is binding for
specs, plans, code reviews, implementation, and integration work. Lower-level
docs may add detail, but they must not weaken these rules.

## Core Principles

### I. Control Plane First

Fulcrum is a local-first agent control plane. New work must strengthen task/run
state, policy, memory, worktrees, workflows, worker adapters, CLI/MCP/install
surfaces, and agent integration artifacts without turning core packages into
agent-runtime implementations.

Required behavior:

- Core, memory, policy, and planning remain local-first and avoid implicit
  network calls.
- `@fulcrum/worker` owns agent execution contracts and spawn lifecycle.
  Runtime-specific CLI wire formats, LLM APIs, and executor behavior belong in
  adapters or userland integrations.
- Package boundaries remain explicit. A feature that crosses a boundary must add
  the owning capability to the owning package, then consume it through the public
  package API.
- Role and task policy invariants are production behavior, not conventions.

### II. Durable Invariants Over Intent

Important rules must be enforced by types, database constraints, guard tests, or
policy checks. Prose alone is not enough.

Required behavior:

- Persisted enum unions must have matching SQLite `CHECK` constraints and guard
  test coverage.
- First-class IDs use `newId(<type>)`; bare `ulid()` is not acceptable outside
  the explicit allowlist.
- Role decisions use capability helpers such as `canInvokeTeams`, `canMerge`,
  `canWriteCode`, and `canEditFiles`; code must not compare role slug strings.
- Task-by-ID queries must include `AND workspace_id = ?`.
- WIP limit `0` means blocked, not unlimited.
- Policy checks must happen before starting production agent runs.

### III. Memory Is Source-Controlled Knowledge

Memory durability starts with L0. Agent knowledge must be traceable, auditable,
and safe to replay.

Required behavior:

- Memory writes commit L0 vault files first, then L1 SQLite, then async L2 graph
  or vector work.
- L2 writes never block the write path.
- Vault echo suppression must write state before rewriting files and must use
  full body SHA-256 values.
- Curated memory must preserve L0 source IDs, confidence, entities, and
  lifecycle metadata.
- Operational memory volume must not trigger synchronous LLM extraction or
  semantic dedup on writes.

### IV. Agent-Native Parity With Safe Tools

Every user-facing capability must be reachable by agents through audited,
typed, least-power surfaces. Agent tools are product API, not convenience glue.

Required behavior:

- CLI, MCP, hooks, and installer outputs must expose equivalent outcomes where
  users or agents need them.
- Tools must declare accurate read-only, destructive, idempotent, and role
  capabilities.
- MCP tools must use clear names, input schemas, structured outputs when useful,
  and model-visible tool errors for recoverable failures.
- Destructive or security-sensitive tools must be explicit, auditable, and gated
  by policy.
- Localhost MCP servers must protect against DNS rebinding when exposed through
  HTTP transports.

### V. Test-First, Real Boundaries

Behavior changes require proof. Tests should exercise production-like boundaries
instead of mocks that hide migration, SQLite, policy, or integration failures.

Required behavior:

- New behavior starts with a failing test or a clear test plan before
  implementation.
- Tests use real in-memory SQLite through the repo test helpers and migrations.
- `better-sqlite3` tests run in Vitest `forks` pool.
- Integration tests cover package contracts, persisted schema changes,
  tool-registry/MCP schema changes, workflow execution, and installer outputs.
- Embedding/model tests stay opt-in and must not run by default.

### VI. Security And Policy Are Default Gates

Fulcrum coordinates autonomous agents, filesystem writes, subprocesses, memory,
and sync. Treat every external input, tool argument, model output, and third
party response as untrusted until validated.

Required behavior:

- Validate at system boundaries with schemas or typed parsers.
- Use parameterized SQL and structured APIs.
- Never log, persist, or send secrets to free-form tool inputs, memory, traces,
  or external sync.
- Secret scanning must run before external push/sync.
- Authorization checks must use the policy engine and capability helpers.
- New external services, auth flows, file upload paths, or secret-bearing flows
  require explicit review and documentation before implementation.

### VII. Observable And Recoverable Execution

Agent work must be inspectable during execution and recoverable after failure.

Required behavior:

- Long-running work emits lifecycle events, heartbeats, progress, spans, or logs
  appropriate to the surface.
- Worker results must map cleanly to completed, blocked, or failed agent runs.
- Tool errors that the model can correct should be returned as tool-level errors
  rather than hidden protocol failures.
- Worktree allocation, merge queue processing, sync, workflow steps, and
  subprocess adapters must preserve enough context for diagnosis.
- Shutdown paths for stateful servers must close transports/sessions cleanly.

### VIII. Simple, Typed, ESM-Publishable Code

Prefer the least surprising implementation that fits the existing package
shape. Types and module semantics must match Node and publishable package
reality.

Required behavior:

- TypeScript stays strict and ESM. Relative source imports include `.js`.
- Shared domain types live in `packages/core/src/types.ts` and are re-exported
  downstream instead of duplicated.
- Public package APIs go through `src/index.ts`; cross-package consumers do not
  import internals.
- Workspace dependencies use `workspace:*` or another `workspace:` range.
- New abstractions must remove real duplication, enforce an invariant, or match
  an existing local pattern.

## Technology Guidelines

### TypeScript And Node

- Keep package `type: "module"` behavior coherent with TypeScript `NodeNext`
  settings and Node's ESM/CJS rules.
- For publishable Node libraries, write relative imports exactly as runtime
  JavaScript will resolve them, including `.js` extensions.
- Use discriminated unions and explicit mappers for persisted records.
- Avoid global mutable state except established registry/configuration points.

### pnpm Workspace

- Keep the repo as one pnpm workspace rooted at `pnpm-workspace.yaml`.
- Use `workspace:` dependencies for local packages so installs fail when the
  expected local package is absent.
- Review native build permissions when dependencies change. Prefer pnpm
  `allowBuilds` for new pnpm 10 configuration and preserve existing native
  allowances until migrated deliberately.
- Run recursive package commands from the root unless a narrower package command
  is enough.

### SQLite, FTS5, And Kuzu

- SQLite remains the authoritative local persistence layer for core state.
- Use migrations for every schema change and make migrations idempotent.
- Use FTS5 for keyword search behavior and explicit ranking/query handling.
- Keep Kuzu graph work async from memory writes. Use documented Kuzu client
  result APIs such as `getAll()` and current Cypher syntax.
- Prefer transactions around multi-row state transitions.

### Hono, HTTP, CLI, And MCP Surfaces

- Validate request params, query, headers, and JSON bodies at HTTP boundaries.
- Header validation must account for Hono's lowercase header key behavior.
- Middleware should add typed context through Hono's typed variables pattern.
- CLI commands and MCP tools must share registry-backed handlers when possible.
- MCP tools should return resource links for large context instead of embedding
  large payloads directly.

### OpenTelemetry And Monitoring

- Tracing/metrics must be initialized before instrumented application code.
- Manual spans should name business operations, not implementation trivia.
- Exporters are optional and config-gated. Local operation must continue without
  remote telemetry credentials.
- Diagnostic logging belongs behind explicit troubleshooting configuration.

## Development Workflow

1. Start with Fulcrum context, workspace status, recall, and code search before
   broad filesystem search.
2. For behavior changes, write or identify the failing/covering test first.
3. Make the smallest scoped change that satisfies the task and preserves package
   ownership.
4. Run the narrowest meaningful test first, then broaden when shared contracts,
   migrations, public APIs, installer output, or cross-package behavior changes.
5. Run required guard checks for touched surfaces: tests, build,
   `check:cycles`, setup dry/check, MCP/tool lints, migration guard tests, or
   installer smoke tests.
6. Update docs or ADRs when changing public contracts, package boundaries,
   policy, memory architecture, worker contracts, or install/runtime behavior.
7. Complete or block the Fulcrum agent run with useful summary, changed files,
   and test results.

## Review Gates

Every PR or completed task must answer these before merge:

- Boundary: Does the change stay in the owning package and consume public APIs?
- Invariant: Is every important rule enforced by type, DB constraint, guard
  test, or policy?
- Agent parity: Can agents reach the same outcome through CLI/MCP/hooks where
  applicable?
- Security: Are external inputs validated and secrets excluded from logs,
  memory, traces, and sync?
- Tests: Do tests cover the changed behavior with production-like boundaries?
- Observability: Can a failed run, workflow, tool call, sync, or merge be
  diagnosed from persisted events/logs/spans?
- Docs: Is the durable reasoning captured where future humans and agents will
  look?

## Governance

- This constitution supersedes informal practices when there is conflict.
- `AGENTS.md` remains the operational rulebook for agents. This constitution
  defines the durable development bar; `AGENTS.md` defines current repo-specific
  mechanics and invariants.
- Amendments require a documented reason, source links when technology guidance
  changes, affected-package analysis, and migration/test notes.
- Breaking changes to `SpawnableRun`, `SpawnContext`, `WorkerResult`, MCP tool
  contracts, persisted schemas, or public package exports require an ADR.
- New dependencies require source review, maintenance assessment, build-script
  permission review, and a test proving the integration path.
- Source hierarchy for technology guidance: official project docs first,
  standards/specifications second, project ADRs and guides third, community
  guidance only as supporting context.

## Research Basis

Primary external sources checked on 2026-04-22:

- TypeScript module reference and module theory:
  <https://www.typescriptlang.org/docs/handbook/modules/reference> and
  <https://www.typescriptlang.org/docs/handbook/modules/theory.html>
- TypeScript compiler performance guidance:
  <https://github.com/microsoft/typescript/wiki/Performance>
- pnpm workspace and settings docs:
  <https://pnpm.io/workspaces> and <https://pnpm.io/settings>
- Vitest pool configuration:
  <https://vitest.dev/config/pool>
- SQLite WAL and FTS5 docs:
  <https://sqlite.org/wal.html> and <https://www.sqlite.org/fts5.html>
- Kuzu Node.js API docs:
  <https://docs.kuzudb.com/client-apis/nodejs/>
- Hono validation and middleware docs:
  <https://hono.dev/docs/guides/validation> and
  <https://hono.dev/docs/guides/middleware>
- MCP TypeScript SDK server guide and MCP tools specification:
  <https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/main/docs/server.md>
  and <https://modelcontextprotocol.io/specification/2025-06-18/server/tools>
- OpenTelemetry JavaScript docs:
  <https://opentelemetry.io/docs/languages/js/> and
  <https://opentelemetry.io/docs/languages/js/getting-started/nodejs/>

Local sources:

- `AGENTS.md`
- `README.md`
- package `package.json` files
- existing Spec Kit constitution template

**Version**: 1.0.0 | **Ratified**: 2026-04-22 | **Last Amended**: 2026-04-22
