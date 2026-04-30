# Fulcrum Product Kernel Research And Design

> Status: research-backed recommendation before implementation. This design updates HANDOVER.md section 6 from separate narrow layers into one shared product kernel that later exposes repository supervision, tasks, docs, memory, context, agent runs, artifacts, and plugins.

## Product Target

Fulcrum should become a local-first Agent OS with a Jira plus Confluence style product surface:

- Projects, repositories, boards, cycles, tasks, docs, memory, decisions, agent runs, artifacts, and reports belong to one domain model.
- Human and AI work share the same projects and tasks. There is no separate "AI project" type.
- Global knowledge is available across projects when explicitly linked, relevant, or requested. Project knowledge stays scoped by default.
- Web app first, CLI second, TUI last.
- SaaS, accounts, multi-user, orgs, teams, roles, and collaboration are designed now, but default run mode stays local-only.
- Retrieval is deterministic: no embeddings, no RAG, no semantic search, no local or remote model dependency unless a future design is explicitly approved.
- Markdown plus YAML frontmatter is canonical for docs and memory content because AI agents and humans can ingest, diff, edit, and version it directly.

## Research Summary

### Backend And Database

Best fit: **Postgres-compatible product kernel**.

Use one relational model as the source of truth. Local mode can run on **PGlite** for no external service dependency, while team/SaaS mode runs on normal PostgreSQL. Both stay inside the Postgres ecosystem and keep SQL/migrations portable.

Research findings:

- PostgreSQL has native full-text search with `tsvector`, `tsquery`, ranking, highlighting, dictionaries, triggers, and indexes. Source: <https://www.postgresql.org/docs/current/textsearch.html>
- PostgreSQL row-level security supports tenant/user scoped policies inside the database, which matches future SaaS/account design. Source: <https://www.postgresql.org/docs/current/ddl-rowsecurity.html>
- PostgreSQL supports `LISTEN`/`NOTIFY` for database-originated event fanout. Sources: <https://www.postgresql.org/docs/current/sql-listen.html>, <https://www.postgresql.org/docs/current/sql-notify.html>
- PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED` supports a database-backed job queue pattern. Source: <https://www.postgresql.org/docs/current/sql-select.html>
- PostgreSQL materialized views support cached read models for reporting and dashboards. Source: <https://www.postgresql.org/docs/current/rules-materializedviews.html>
- PostgreSQL JSON/JSONB supports structured payload columns for run events, plugin manifests, and optional metadata without leaving relational structure. Source: <https://www.postgresql.org/docs/current/datatype-json.html>
- PostgREST can expose a PostgreSQL schema as a REST API with database structure and permissions as the source of truth. Source: <https://docs.postgrest.org/>
- `pg_graphql` is a PostgreSQL extension for GraphQL if a future API consumer genuinely needs GraphQL. Source: <https://github.com/supabase/pg_graphql>
- Graphile Worker is a mature Postgres-backed queue and remains the best second-stage queue if Fulcrum outgrows a small `SKIP LOCKED` queue. Source: <https://worker.graphile.org/>
- PGlite is a WASM Postgres build for Node, Bun, Deno, browser, and filesystem persistence. It gives local-first Postgres-compatible storage without requiring users to install a Postgres service. Source: <https://pglite.dev/docs/about>

Convex findings:

- Convex is self-hostable and its backend is open source/fair source. Source: <https://docs.convex.dev/self-hosting>
- Convex has reactive queries, HTTP actions, and an HTTP API. Sources: <https://docs.convex.dev/functions/http-actions>, <https://docs.convex.dev/http-api/>
- Convex full-text search uses Tantivy and BM25-like relevance, but relevance order is documented as subject to change and search indexes have field/filter/result limits. Source: <https://docs.convex.dev/search/text-search>
- Convex is strong for realtime app development, but it is a platform choice with a document/function model. Fulcrum's durable project-management, reporting, permissions, audit, and agent-run data fit a relational/event model better.

Recommendation:

- **Primary:** Postgres-compatible kernel: PGlite for default local mode, PostgreSQL server for team/SaaS mode.
- **Second:** Convex only if Postgres/PGlite fails local realtime UX or setup gates and its license/platform tradeoffs become acceptable.
- **Third:** SQLite + FTS5 + Bun/Hono only if PGlite cannot ship reliably in the Fulcrum binary/local CLI environment and external Postgres setup is unacceptable for local mode.

### API And Services

Best fit: **Postgres as source of truth, Bun service as orchestrator gateway**.

Postgres can own data, permissions, FTS, events, reporting read models, and queue primitives. Fulcrum still needs a Bun process because it launches CLI agents, reads/writes local project files, streams logs, serves the web UI in local mode, and bridges database events to WebSocket/SSE.

Use PostgREST or `pg_graphql` only when the API surface needs public external API semantics. For internal web/CLI MVP, SvelteKit/Bun server endpoints can call the same service layer and SQL directly.

Failure gate:

- If the Bun gateway starts duplicating CRUD logic already expressed cleanly in SQL views/functions, introduce PostgREST for CRUD/resources.
- If external clients need graph traversal with strict typed queries, evaluate `pg_graphql` before custom GraphQL.
- If queue throughput, retry policy, cron, or failure inspection grows beyond the simple local queue, adopt Graphile Worker before inventing a larger queue.

### Web UI

Best fit: **Svelte 5 + SvelteKit + shadcn-svelte**.

Research findings:

- Svelte supports explicit reactive state with runes and still supports stores for complex asynchronous streams/manual subscriptions. Source: <https://svelte.dev/docs/svelte/stores>
- SvelteKit has official deployment adapters, including `adapter-node`; Bun can run Node-targeted output in practice, and Svelte packages list Bun/community adapter options. Sources: <https://svelte.dev/docs/kit/adapter-node>, <https://svelte.dev/packages>
- shadcn-svelte ports shadcn/ui to Svelte/SvelteKit, copies components into the project, uses MIT licensing, and is powered by Svelte primitives rather than a closed component runtime. Sources: <https://shadcn-svelte.com/docs/installation>, <https://www.shadcn-svelte.com/docs/about>
- Bits UI is a headless Svelte primitive library focused on accessibility and styling control. Source: <https://bits-ui.com/docs>
- dnd-kit now documents Svelte, Vue, Solid, Vanilla, and React support. It is the best candidate for kanban/scrum board drag/drop because it is framework-agnostic and accessible. Source: <https://docs.dndkit.com/>
- Apache ECharts is a framework-agnostic open-source charting library with npm install and modular import support. Source: <https://echarts.apache.org/handbook/en/basics/download/>

Recommendation:

- Use SvelteKit for routing/app shell.
- Use shadcn-svelte components as copied source under the web app, not as an opaque UI dependency.
- Use Bits UI only where shadcn-svelte pulls it in or where headless primitives are useful.
- Use dnd-kit Svelte primitives for boards.
- Use Apache ECharts directly for burndown, cycle, run, and project reporting.
- Do not adopt Plane, Huly, Docmost, Outline, or other third-party UIs as product base. Their UI is not the asset. Only their backend/services would matter, and none beat the Postgres-compatible kernel for Fulcrum.

Failure gate:

- If SvelteKit plus Bun build/deploy has repeated runtime blockers, switch UI framework to Vue + shadcn-vue before React.
- If shadcn-svelte component generation drifts from Svelte 5 or blocks accessibility, keep Svelte but build directly on Bits UI.
- If dnd-kit Svelte primitives fail board interactions, use SortableJS as a simpler framework-agnostic fallback for reorder-only boards.

### Docs And Editor

Best fit: **Markdown/frontmatter canonical storage with CodeMirror 6 source editor**.

Research findings:

- CodeMirror 6 has active docs and a Markdown language package. Sources: <https://codemirror.net/docs/>, <https://www.npmjs.com/package/@codemirror/lang-markdown>
- unified/remark treats Markdown as syntax trees and supports content processing pipelines. Source: <https://github.com/unifiedjs/unified>
- gray-matter parses YAML, JSON, JS, TOML, and custom frontmatter and is battle-tested, but last publish age means it should be evaluated against a smaller maintained parser before final dependency lock. Source: <https://github.com/jonschlinkert/gray-matter>

Recommendation:

- Canonical document form is plain Markdown with YAML frontmatter:

```md
---
id: 01J...
kind: decision
project: fulcrum
labels:
  - architecture
  - backend
status: accepted
---

# Title

Body in normal Markdown.
```

- Store canonical text in Postgres/PGlite as `body_markdown`.
- Extract frontmatter into relational columns and JSONB metadata.
- Extract body text into `search_documents` for Postgres FTS.
- Editor is CodeMirror 6 plus a schema-driven frontmatter side panel and preview.
- Rich editors such as Tiptap/ProseMirror are not canonical because their JSON documents are poor AI artifacts and poor git diffs.

Failure gate:

- If CodeMirror mobile/IME behavior blocks real use, first try a plain textarea editor with preview for mobile.
- If Markdown round-trip or frontmatter preservation fails in any parser, parser is rejected. No editor can rewrite frontmatter key order, unknown keys, comments, or body content unexpectedly.
- Milkdown is only considered if it proves byte-stable Markdown round-trip for Fulcrum documents.

### State Management

Best fit: **zustand/vanilla-style state store with Svelte adapter**.

Research findings:

- Zustand `createStore` creates a framework-agnostic vanilla store exposing `setState`, `getState`, `getInitialState`, and `subscribe`. Source: <https://zustand.docs.pmnd.rs/reference/apis/create-store>
- Svelte stores remain useful for complex asynchronous streams and manual subscriptions even after Svelte 5 runes. Source: <https://svelte.dev/docs/svelte/stores>
- TanStack Store is framework-agnostic with Svelte adapter support and is the main fallback if zustand integration becomes awkward. Source: <https://tanstack.com/store/v0/docs>

Recommendation:

- Use a small Fulcrum state package that wraps `zustand/vanilla`.
- Expose Svelte-readable subscriptions/selectors so UI components do not know the backing store.
- Server events from Postgres `NOTIFY` or app-level event polling flow through Bun WebSocket/SSE into the state store.
- Keep server data canonical in Postgres. Client store is a fast projection, not the source of truth.

Failure gate:

- If Zustand vanilla needs too much Svelte glue, switch to TanStack Store.
- If external stores cause SSR leakage or hydration bugs, use Svelte stores/runes behind the same `AppState` interface.
- If optimistic updates cause recurrent reconciliation bugs, make UI pessimistic for that action class and require server event acknowledgement before local state mutation.

### Agent Workflow And Skills

Best fit: **codify stable workflow in Fulcrum, use skills/prompts for adaptable workflow edges**.

Research findings:

- Matt Pocock's skills repo emphasizes small, adaptable, composable skills instead of a process that owns the whole app. Source: <https://github.com/mattpocock/skills>

Recommendation:

- Fulcrum should encode durable primitives in the product: tasks, states, docs, assignment rules, context assembly, run events, artifacts, and reports.
- Skills should stay small workflow helpers: triage, PRD, diagnose, TDD, improve architecture, zoom out, etc.
- Fulcrum can vendor or fresh-sync approved external skills the same way current package/skill lifecycle does, but the product must not depend on a third-party prompt repo for core correctness.

## Technical Design

### Storage Modes

Mode matrix:

| Mode | Engine | Target | Notes |
|---|---|---|---|
| local-default | PGlite | Single-user local app and CLI | No separate DB service. Same SQL model as Postgres where supported. |
| local-power | PostgreSQL server | Local heavy use / team trial | Docker, local service, or user-provided `DATABASE_URL`. |
| team/SaaS | PostgreSQL server | Multi-user hosted/self-hosted | RLS, backups, pooling, worker process, optional PostgREST/pg_graphql. |

SQLite remains only fallback. It is no longer the recommended future product kernel because Postgres/PGlite gives one path from local to SaaS.

### Core Schema Areas

All IDs are ULID text. Every table has `created_at`, `updated_at`, and `deleted_at` where soft delete matters. Every tenant-scoped row has `org_id`; every project-scoped row has `project_id`.

Core tables:

- `orgs`, `users`, `memberships`, `teams`, `team_memberships`
- `projects`, `repos`, `repo_snapshots`
- `spaces`, `documents`, `document_versions`
- `tasks`, `task_statuses`, `boards`, `board_columns`, `cycles`, `task_cycle_memberships`
- `memories`, `decisions`, `references`
- `agent_profiles`, `assignment_rules`, `agent_runs`, `run_events`
- `artifacts`, `artifact_blobs`
- `edges`
- `events`
- `search_documents`
- `jobs`

The `edges` table is central:

```sql
CREATE TABLE edges (
  id text PRIMARY KEY,
  org_id text NOT NULL,
  project_id text,
  from_kind text NOT NULL,
  from_id text NOT NULL,
  to_kind text NOT NULL,
  to_id text NOT NULL,
  edge_kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_kind, from_id, to_kind, to_id, edge_kind)
);
```

Use it for doc backlinks, task links, task-blocks, run inputs, artifact provenance, memory scope, and context assembly.

### Deterministic Retrieval

Retrieval is SQL plus metadata:

1. Resolve scope: global, org, project, repo, task, run.
2. Load explicit links from `edges`.
3. Search `search_documents` using Postgres FTS.
4. Apply structured filters: kind, labels, status, repo, recency, source.
5. Rank with deterministic SQL score: explicit link boost, scope boost, FTS rank, recency, pinned state.
6. Assemble context in a stable sort order.

No embeddings. No model-generated search keys. No semantic expansion.

### Event Model

Every state-changing action writes an `events` row:

```sql
CREATE TABLE events (
  id text PRIMARY KEY,
  org_id text NOT NULL,
  project_id text,
  actor_kind text NOT NULL,
  actor_id text NOT NULL,
  event_kind text NOT NULL,
  subject_kind text NOT NULL,
  subject_id text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
```

Reports derive from events. Burndown charts should not be based only on current task state.

### Queue And Runs

Initial queue can be a Postgres/PGlite table with `status`, `available_at`, `locked_by`, `locked_at`, and retry counters. PostgreSQL server mode uses `SKIP LOCKED`. PGlite/local mode can use single-process locking because only the local Fulcrum process owns execution.

Agent runs are first-class:

- input prompt
- attached docs/tasks/memories/context
- selected CLI agent
- assignment rule used
- run status
- transcript path or body
- stdout/stderr metadata
- produced artifacts
- retry/cancel state

### Accounts And Permissions

Design org/user/membership tables now. Local mode seeds one org/user automatically.

Better Auth is the preferred auth candidate for hosted/self-hosted web mode because it supports PostgreSQL and an organization plugin with roles, teams, invitations, and access control. Sources: <https://better-auth.com/docs/adapters/postgresql>, <https://better-auth.com/docs/plugins/organization>

Local mode can bypass login while still writing rows as the seeded local user.

### Compatibility Requirements

Compatibility tests must run against:

- PGlite local filesystem database.
- PostgreSQL server via `DATABASE_URL`, skipped when env var missing.
- SvelteKit dev/build under Bun.
- Markdown parser round-trip fixtures.
- State store subscription/reconciliation fixtures.

Every compatibility test must produce a clear gate result:

- pass - keep recommendation
- warn - keep recommendation but document limitation
- fail - switch to next tool in fallback matrix before product code depends on it

## Final Recommendation

Build Fulcrum's next layer as a **Postgres-compatible product kernel**:

- PGlite for default local-first install.
- PostgreSQL server for multi-user and SaaS.
- SvelteKit + shadcn-svelte UI.
- Markdown/frontmatter canonical docs with CodeMirror.
- Zustand vanilla store wrapped behind a Svelte adapter.
- Postgres FTS/events/RLS/materialized views/queue primitives before extra services.
- Convex held as fallback, not default.

