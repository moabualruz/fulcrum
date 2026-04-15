# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

#### Workflow step handlers
- **`search_code`** — real implementation using `rg` (ripgrep) with `grep` fallback. Uses `spawn` with `stdio: ['ignore', 'pipe', 'pipe']` to avoid stdin-pipe hangs. Accepts `query`, `path`, `file_pattern`, and `case_sensitive` config keys; returns `{ results, query, tool }`.
- **`validate_schema`** — JSON Schema validation via Ajv v8. Accepts `schema` (JSON Schema object) and `data` or `data_key` (dot-path into `ctx.outputs`) config keys. Returns `{ valid: true }` on success, or `status: 'failed'` with the Ajv error text on validation failure. Schema missing → passthrough `{ valid: true, validated: false }`.
- **`search_web`** — Tavily (env `TAVILY_API_KEY`) and Serper (env `SERPER_API_KEY`) adapters. If neither key is configured, returns `{ configured: false, note: '...' }` rather than hard-failing.
- **`call_mcp_tool`** / **`run_tool`** — return `status: 'failed'` with an actionable error message pointing to MCP server configuration instead of silently returning empty output.
- **`run_script`** now uses the shared `runCommand()` helper (spawn with stdin=ignore) for consistency.

#### Core
- **Migration 034** — four missing indices: `idx_memories_importance_access` on `(importance, last_accessed_at)`, `idx_sync_states_workspace` on `(workspace_id)`, `idx_sync_states_object` on `(workspace_id, object_type, object_id)`, `idx_wf_runs_project` on `(workspace_id, project_id) WHERE project_id IS NOT NULL`. All idempotent (`IF NOT EXISTS`).

#### Monitor server
- **`MonitorServer.fetch`** — test-only helper: call Hono routes in-process without binding a TCP port. Non-breaking addition to the `MonitorServer` interface.

#### CLI
- **`fulcrum doctor`** — environment and configuration health check command. Runs 8 checks (Node.js ≥ 20, `.fulcrum.json`, data directory, `better-sqlite3` native module, database liveness, `@modelcontextprotocol/sdk`, environment variables, agent integration files) and prints a PASS/WARN/FAIL report. Exits 1 when any check fails. Supports `--json` for machine-readable output.
- **`fulcrum serve mcp-http`** — HTTP-transport MCP server using `StreamableHTTPServerTransport`. Each request gets a fresh `McpServer` + stateful transport (per-request session ID). Default port 4722. Suitable for network-accessible MCP access without stdio.
- **`recall_memory` MCP tool** — `max_chars` optional parameter (default 8000) truncates each returned memory for token-budget control. `project_id` is now optional; omit to search across the whole workspace.

#### Core APIs
- **`withTransaction<T>(fn)`** — SQLite IMMEDIATE transaction wrapper in `@fulcrum/core/db/client`. Uses `.immediate()` locking (BEGIN IMMEDIATE) to prevent read-upgrade deadlocks under WAL mode. Rollback is automatic on any thrown error.
- **`checkDbHealth()`** — liveness probe that runs `SELECT 1` and returns `{ ok: true, latencyMs: N }` or `{ ok: false, error: string }`. Used by `fulcrum doctor` and the monitor health endpoint.
- **`decayMemories(workspace_id?)`** in `@fulcrum/core/janitor` — multiplicative freshness decay for low-importance memories not recently accessed. Formula: `importance * DECAY_FACTOR^weeksElapsed` (floor `DECAY_FLOOR`). Runs inside `runJanitorCycle` and can be disabled with `runDecay: false`.
- **`buildA2ACard(def, executorUriOverride?)`** — builds an A2A-protocol `AgentCard` JSON from an `AgentDefinition`. Maps known capability strings (`code_generation`, `code_review`, `planning`, `research`, `memory`, `task_management`, `orchestration`) to typed `A2ASkill` descriptors. Falls back to a generic role skill for unrecognised capabilities.
- **`AgentRoleDescriptor`** type alias — `AgentRoleDescriptor = AgentProfile` for vocabulary consistency with A2A spec; fully backward-compatible.
- **Memory `content_type` routing** — `Memory` interface gains `content_type: 'text' | 'code'` field (migration 033, default `'text'`). `writeMemory` auto-selects the text or code embedder based on `content_type` when no explicit embedding is provided.
- **Memory decay constants** in `@fulcrum/core/constants` — `MEMORY_DECAY_FACTOR`, `MEMORY_DECAY_THRESHOLD`, `MEMORY_DECAY_MIN_DAYS_SINCE_ACCESS`, `MEMORY_DECAY_FLOOR`.
- **DB pragma hardening** — `synchronous = NORMAL` and `cache_size = -8000` (8 MB) added to `_configureDb`. WAL mode + NORMAL sync is crash-safe while delivering measurably better write throughput than FULL.

#### Memory package
- **`buildRepoMap` / `scanAndBuildRepoMap`** in `@fulcrum/memory/repo-map` — aider-style repository map. Walks a directory tree (skips `node_modules`, `.git`, `dist`, `build`, `.next`, `coverage`, worktree dirs), detects language from extension, and extracts top-level symbols (functions, classes, methods, arrow functions, consts) using an injectable tree-sitter parser. Returns a `RepoMap` with per-file symbol tables and a compact summary string. No WASM required in tests — parser is fully injectable.

#### Agent integration
- **`agent-integration/codex/`** — OpenAI Codex CLI integration (`AGENTS.md` context file auto-loaded by Codex CLI; `mcp-config.json` pointing at `fulcrum serve mcp`).
- **`agent-integration/opencode/`** — opencode integration (`opencode.md` context file; `config.json` with `mcp.fulcrum` entry pointing at `fulcrum serve mcp`).

#### Monitor server
- **Pagination** on list endpoints (`/tasks`, `/agents`, `/artifacts`, `/memory-trace`, `/teams`) — `?limit=N&cursor=OFFSET` query params; response includes `{ data, pagination: { total, limit, offset, next_cursor } }`. Limit capped at 200. `next_cursor` is null when all results are exhausted.

#### Core APIs (continued)
- **`consolidateMemories(workspace_id?)`** in `@fulcrum/core/janitor` — background memory deduplication. Compares embeddings within a workspace using cosine similarity; pairs above `MEMORY_CONSOLIDATION_THRESHOLD = 0.92` are merged (higher-importance survives). Batch-limited to `MEMORY_CONSOLIDATION_BATCH_SIZE = 200` memories per cycle. Runs in `runJanitorCycle` (opt-out with `runConsolidate: false`).
- **Tool name validation** in `createAgentDefinition` / `updateAgentDefinition` — `tools_allow` and `tools_deny` entries are validated against `/^[a-zA-Z_][a-zA-Z0-9_-]*$/`. Throws `FulcrumError { code: 'invalid_input' }` on the first bad name.

#### Documentation
- **`packages/cli/README.md`** — CLI command tree, 13 MCP tools table, auto-init, plugin discovery, hook system.
- **`packages/worker/README.md`** — `AgentAdapter` contract, built-in adapters, subprocess + stub usage.
- **`docs/guides/skill-authoring.md`** — Complete guide to writing Fulcrum skills: frontmatter schema, body format, naming conventions, trigger phrase best practices, policy vs procedure skills, scripted pattern / `gen-claude-md.ts` integration.

#### Round 2 audit fixes — MCP protocol compliance
- **Per-tool `outputSchema`** — 11 tools now declare typed output schemas (`create_task`, `update_task`, `write_memory`, `get_agent_run_status`, `start_agent_run`, `heartbeat_agent_run`, `complete_agent_run`, `block_agent_run`, `build_cos_context`, `get_workspace_status`, `get_current_context`). All output fields are optional so mock handlers don't break validation. (GAP-MCP-5)
- **`buildZodShape` typed array items** — `string[]`, `number[]`, and `object[]` item types now mapped correctly instead of silently degrading to `z.array(z.unknown())`. (GAP-MCP-6)
- **JSON-RPC `-32602` validation errors** — MCP Zod parse failures now return `{ code: -32602, message: 'Invalid params: ...' }` instead of opaque `isError: true` responses. (GAP-MCP-8)
- **Resource template `list: undefined` removed** — parameterized `ResourceTemplate` registrations no longer suppress resource discovery. (GAP-MCP-9)
- **MCP middleware chain** — `Origin` header validation, `MCP-Protocol-Version` header check, and HTTP DELETE session termination handler added to the HTTP transport. (GAP-MCP-2, GAP-MCP-3, GAP-MCP-4)
- **`tools.listChanged` capability** — `capabilities.tools` now declared as `{}` (not omitted), enabling client-side `listChanged` subscription. (GAP-MCP-14)
- **Sampling capability** — `capabilities.sampling` declared; `createMessage` handler registered and routed to the `@fulcrum/worker` adapter. (GAP-MCP-13)
- **`tags` / `artifact_paths` as arrays** — MCP tool schemas changed from comma-string to `array` type for `write_memory`, `complete_agent_run`. (GAP-MCP-12)

#### Round 2 audit fixes — Skills
- **`allowed-tools` in all 32 skills** — each skill frontmatter now declares exactly which MCP tools it reads/writes, so Claude Code can enforce per-skill tool grants. (GAP-SKILLS-3)
- **`user-invocable` flag in all 32 skills** — 13 skills marked `user-invocable: true` (manual trigger OK); 19 marked `false` (auto-trigger only, never user-initiated). (GAP-SKILLS-6)
- **`version` / `author` metadata** — all 32 skill files now carry `version: 1.0.0` and `author: fulcrum` frontmatter for drift detection. (GAP-SKILLS-5)
- **`triggers` convention documented** — `docs/guides/skill-authoring.md` updated with formal trigger phrase convention; inconsistent `triggers` entries across skills normalised. (GAP-SKILLS-1)
- **`$ARGUMENTS` / artifact contract** — 20 skills now declare an `## Arguments` section (accepted keys + types) and an `## Output` section (artifact path and structure). (GAP-SKILLS-2)
- **End-to-end examples** — 12 skills with non-obvious output shapes now include a `## Examples` section with sample arguments and expected output. (GAP-SKILLS-8)
- **`output_schema` wired** — `AgentDefinition.output_schema` populated for 8 roles from matched skill output contracts; `fulcrum doctor` gains a `checkSkillContracts` check that warns when roles with skills have no output schema. (GAP-SKILLS-7)
- **System prompts for key roles** — `chief_of_staff`, `software_engineer`, `code_reviewer`, `qa_engineer`, `security_reviewer` now have non-null `system_prompt` in the seed data (migration m043). (GAP-SKILLS-4)
- **`fulcrum skills install`** — new CLI command; symlinks `agent-integration/skills/` into `~/.claude/skills/` (or `.claude/skills/` with `--project`) so Claude Code auto-loads Fulcrum skills on next launch. `fulcrum skills list` prints installed skills with version. (GAP-SKILLS-9)

#### Round 2 audit fixes — Agent definitions
- **File-based agent definition loader** — `loadAgentDefsFromDir()` in `@fulcrum/core` syncs `*.agent.json` files from `agent-integration/agent-defs/`, `.fulcrum/agent-defs/`, and `globalDataDir()/agent-defs/` into the DB at startup. Project-local files take precedence; global files fill gaps. (GAP-AGENTDEF-5)
- **Enriched role descriptions** — all 24 built-in roles updated with three-part descriptions (purpose / when to use / key outputs) via migration m047. Existing operator customisations are preserved (update only fires when description still matches original seed). (GAP-AGENTDEF-8)
- **OpenAPI `securitySchemes`** — `A2AAgentCard.authentication` restructured to proper OpenAPI security scheme objects (`type`, `scheme`, `bearerFormat`) instead of a flat string array. (GAP-AGENTDEF-2)
- **Consolidated A2A card builder** — two divergent `buildA2ACard` implementations merged into a single canonical builder with `examples`, `provider`, and all auth fields. (GAP-AGENTDEF-3)
- **`protocolVersion` in A2AAgentCard** — field added to `AgentCard` type and populated by the card builder. (GAP-AGENTDEF-1)
- **`allow_dispatch` flag** — `AgentDefinition` gains `allow_dispatch: boolean` column (migration m044); only definitions with `allow_dispatch: true` may be invoked via `start_agent_run`. (GAP-AGENTDEF-7)
- **`iconUrl` in A2AAgentCard** — field wired from `AgentDefinition.icon_url` into the card builder output. (GAP-AGENTDEF-9)
- **Workspace-scoped UNIQUE** — `agent_definitions` UNIQUE constraint changed from `(role)` to `(role, workspace_id)` (migration m045), enabling per-workspace definition overrides. (GAP-AGENTDEF-10)
- **`capabilities` enforcement** — `capabilities` array entries checked against a known set at write time; capability → permission mapping documented in `docs/guides/capabilities.md`. (GAP-AGENTDEF-6)
- **`A2ASkill.examples`** — `examples` field added to `A2ASkill` type and emitted by `buildA2ACard`. (GAP-AGENTDEF-4)

#### Round 2 audit fixes — RAG / Memory
- **`ASTChunker` wired into `ingestFile`** — code files now produce fine-grained chunk memories (function/class level) in addition to whole-file memories; chunks carry `file_path` + `symbol_path` for precise retrieval. (GAP-RAG-1)
- **`embedQuery()` for queries** — recall pipeline uses the query-optimised embedding path instead of the document path, reducing asymmetric embedding bias. (GAP-RAG-2)
- **camelCase FTS normalisation** — `normalizeCodeText()` expands code identifiers into separate tokens at write time (`getUserById` → `get User By Id`). Applied to `canonical_text` for `symbol`, `code`, `doc`, `diff` memories; prose memories unchanged. (GAP-RAG-3)
- **Real cosine MMR** — `mmrDiversify()` in `@fulcrum/memory/kuzu` now computes actual cosine similarity between candidate embeddings instead of falling back to score ordering. (GAP-RAG-5)
- **Sigmoid reranker logits** — cross-encoder logits converted with `sigmoid(x)` instead of hard-clamping to `[0,1]`, preserving rank ordering among high-quality results. (GAP-RAG-6)
- **`offset` on `recall_memory`** — MCP tool and `recallMemory()` now accept an `offset` parameter for virtual context paging (MemGPT-style "memory window"). (GAP-RAG-8)
- **Import/call-graph edges in Kuzu** — static analysis now emits `IMPORTS` and `CALLS` edges between `File` and `Symbol` nodes after AST chunking. (GAP-RAG-4)

#### Round 2 audit fixes — Architecture
- **`core` ↔ `teams` circular dep broken** — `TeamOps` interface injected via `setTeamOps()`/`getTeamOps()` IoC pattern; `@fulcrum/core` no longer imports from `@fulcrum/teams`. (GAP-ARCH-1)
- **`policy` → `teams` layer violation fixed** — `@fulcrum/policy` resolves team membership through the `TeamOps` interface; direct `@fulcrum/teams` import removed. (GAP-ARCH-2)
- **Hook types moved out of CLI** — `HookCli`, `HookPhase`, `HookContext`, etc. extracted into `packages/cli/src/hooks.ts`; CLI `index.ts` no longer exports library-level types directly. (GAP-ARCH-3)
- **Wildcard `export *` replaced** — `@fulcrum/teams`, `@fulcrum/policy`, `@fulcrum/workflows` now use named exports only; no barrel `export *`. (GAP-ARCH-4)
- **Config loading deduplication** — `@fulcrum/memory` config loader removed; memory package reads from `@fulcrum/core`'s `globalDataDir()` exclusively. (GAP-ARCH-7)
- **Global plugin discovery** — plugin scanner now checks `globalDataDir()/plugins/` in addition to project `node_modules`; first match wins. (GAP-PLUGIN-5)
- **Peer dependency runtime validation** — `fulcrum doctor` gains a `checkPeerDeps` check; startup emits a warning (not a crash) when an optional peer (`sqlite-vec`, `voyageai`, `openai`) is missing. (GAP-ARCH-9)
- **`globalDataDir()` deduplicated** — `packages/cli/src/index.ts` inline copy removed; all callers import from `@fulcrum/core`. (GAP-ARCH-10)

#### Round 2 audit fixes — Plugins
- **Plugin management commands** — `fulcrum plugin install/update/remove/list` added to CLI; backed by `installPlugin()` / `removePlugin()` in `@fulcrum/core`. (GAP-PLUGIN-4)
- **Plugin tool injection** — plugins with `contributes.tools` in their manifest are merged into `TOOL_SCHEMAS` at MCP server startup; operator-contributed tools appear alongside built-in tools. (GAP-PLUGIN-7)
- **Plugin settings/secrets manifest** — `PluginManifest` gains `settings` (config key declarations) and `secrets` (secret key declarations) arrays. `fulcrum plugin install` prompts for secrets and writes them to `globalDataDir()/secrets/<plugin-id>/`. (GAP-PLUGIN-3)
- **Inbound hook lifecycle** — Fulcrum runtime now fires its own `pre_tool_use` / `post_tool_use` hooks via `runPreHook`/`runPostHook` around every MCP tool invocation. (GAP-PLUGIN-2)

### Changed
- `_configureDb` adds `synchronous = NORMAL` and `cache_size = -8000` pragmas (additive — no behavior regression).
- `runJanitorCycle` runs `decayMemories` and `consolidateMemories` by default (opt-out with `runDecay: false` / `runConsolidate: false`).
- `fulcrum doctor` `checkDbLiveness` check added to the standard check list.
- `step-executor.ts` `run_script` now uses `runCommand()` (spawn, stdin=ignore) — same fix that resolved `search_code`'s stdin-pipe hang.
- **Test count: 1010 → 1258 passing** (+248 across `@fulcrum/core`, `@fulcrum/policy`, `@fulcrum/sync`, `@fulcrum/monitor`, `@fulcrum/workflows`).
- All packages now use `ulidx` (standardised, ESM-compatible); `ulid` dependency removed from core, memory, planning, policy.
- `docs/gap-analysis/` renamed to `docs/history/`.

---

## [0.1.0] — 2026-04-14

Five rounds of gap-analysis + fixes against the Python spec. Test count grew from 91 to **980 passing across 11 packages**. 10 new migrations (020–029), 3 new guard test suites, and real execution paths for workers, workflows, worktrees, and merge queue.

### Added

#### Packages and runners
- **`@fulcrum/worker`** — pluggable `AgentAdapter` pattern with built-in `stub` and `subprocess` adapters. `spawnAgent` lifecycle with policy gate, heartbeat streaming, and span instrumentation. `registerAgentAdapter` extension point for userland Claude/Gemini/PI adapters. (H-2)
- **Workflow runner** — `runWorkflow` in `@fulcrum/workflows` with retries (default 3, exponential backoff), per-step timeouts (default 600s), state persistence, and bounded iteration loop. (H-1)
- **29 workflow step handlers** — `create_task`, `create_issue`, `create_epic`, `write_artifact`, `write_memory`, `read_memory`, `read_artifact`, `review_artifact`, `invoke_team`, `spawn_agent`, `run_script`, `call_mcp_tool` (stub), `wait_for_task`, `wait_for_review`, `wait_for_artifact`, `branch`, `loop`, `halt`, `escalate`, `prompt_user`, `read_project`, `evaluate_policy`, `gate`, `validate_schema`, `parallel`, `complete`, `run_tool`, `search_code`, `search_web`. (H-5)

#### Worktrees and merge queue
- **Real git subprocess integration** in `@fulcrum/worktrees`:
  - `allocateWorktree` runs `git worktree add <path> -b <branch> <base>` under `<project_root>/.fulcrum-worktrees/<worktree_id>`
  - Idempotent `.gitignore` management
  - Non-git project fallback to sequential write mode
  - DB rollback on git failure
  - `deallocateWorktree` runs `git worktree remove --force` (H-3)
- **Real merge queue execution** — `processMergeQueue` runs `git merge --no-ff` with conflict detection (`git merge --abort` on conflict). FIFO by `updated_at`. Artifact gates: requires `review_report` + `test_report` with status=`final` before merging. Conflict path: creates `merge_conflict_report` artifact, sets worktree status=`conflict`. Policy gated: only `canMerge(role)` may dequeue. (H-4)
- **Worktree TTL cleanup** — `cleanupAbandonedWorktrees` called from janitor cycle. Reaps rows with status in (`discarded`, `merged`) older than 24h. (H-10)

#### Telemetry and observability
- **Telemetry spans** — `startSpan` / `endSpan` / `getTrace` stored in `trace_events` table; auto-instrumentation in workflow runner, worker lifecycle, janitor cycle, MCP tool handler. Spans carry parent/child relationships for trace reconstruction. (K-5, G-12)
- **OpenTelemetry OTLP exporter** (opt-in) — activated by `OTEL_EXPORTER_OTLP_ENDPOINT`. Dual-emits Fulcrum spans to local DB + any OTLP backend (Datadog / Honeycomb / Jaeger / Grafana Tempo). `gen_ai.*` semantic conventions for agent and workflow spans. (J-7)

#### CLI
- **9 new CLI subcommand groups** — `task`, `issue`, `epic`, `board`, `queue`, `sync`, `team`, `workflow`, `agent`. All support `--json` for machine-readable output. (J-6)
- **`@fulcrum/cli` raw JSON-RPC MCP server** — `fulcrum serve mcp` runs a stdio MCP server exposing 13 control-plane tools: `list_tasks`, `create_task`, `update_task`, `recall_memory`, `write_memory`, `list_agent_profiles`, `get_agent_run_status`, `start_agent_run`, `heartbeat_agent_run`, `complete_agent_run`, `block_agent_run`, `build_cos_context`, `get_workspace_status`. No `@modelcontextprotocol/sdk` dependency.
- **Auto-init** — every `fulcrum` command now auto-initializes `$CWD` as a Fulcrum project on first run (creates `.fulcrum/fulcrum.db`, default workspace + project with deterministic IDs from `sha256(abs_path)[:12]`, and `.fulcrum.json`).
- **Global installer** — `pnpm run setup` installs the CLI symlink, registers `fulcrum` as a user-scope Claude MCP server, merges the PreToolUse hook into `~/.claude/settings.json`, writes a Fulcrum section into `~/.claude/CLAUDE.md`, installs the Gemini extension into `~/.gemini/extensions/fulcrum/`, and runs `pi install` for the PI cockpit. Per-runtime variants: `setup:claude` / `setup:gemini` / `setup:pi`.
- **Hook system** — `fulcrum hook claude|gemini|pi` reads a tool-call event from stdin, normalizes field names across all three runtimes (including PI's `runId` capture), logs a `hook_executed` event, and enforces the `chief_of_staff_no_direct_writes` policy invariant. (R2-5, K-2)

#### Agent integration files
- `agent-integration/claude/` — `.mcp.json`, `CLAUDE.md`, `settings-hooks-snippet.json`
- `agent-integration/gemini/` — `gemini-extension.json`, `GEMINI.md`
- `agent-integration/pi/` — `fulcrum.extension.json`, `fulcrum.d.ts`, `PI.md`, `cockpit/` (full PI extension: widget, dashboard, setup wizard, 11 slash commands, 11 native tools, policy hook)
- `agent-integration/roles/` — 6 role prompt MDs (`chief_of_staff`, `software_engineer`, `integration_worker`, `code_reviewer`, `security_reviewer`, `tech_lead`)

#### Monitor server
- **Monitor control endpoints** — `POST /tasks`, `PATCH /tasks/:id`, `POST /runs`, `POST /runs/:id/{heartbeat,complete,block}`, `POST /memory/recall`, `POST /memory/write`, `POST /cos-context`, `POST /policy/check`. `GET /tasks`, `/workspaces`, `/projects`. (G-1 follow-through)

#### Core APIs and constants
- **Central role capability system** at `packages/core/src/roles.ts` — `roleCapabilities`, `isL1`, `canInvokeTeams`, `canMerge`, `canWriteCode`, `canEditFiles`. Replaces scattered hardcoded role string comparisons. (H-11)
- **Advisory lock API** — `acquireLock`, `releaseLock`, `listLocks`, `cleanupExpiredLocks` in `packages/core/src/locks.ts`. Janitor calls `cleanupExpiredLocks` every cycle. Exclusive-only per spec §18.1 (documented in the module header). (G-5, H-7)
- **Named constants module** at `packages/core/src/constants.ts` — `DEFAULT_HEARTBEAT_TIMEOUT_SEC`, `DEFAULT_ESCALATION_TIMEOUT_SEC`, `DEFAULT_WIP_LIMIT`, `DEFAULT_MONITOR_PORT`, `DEFAULT_EMBED_DIM`, `DEFAULT_LOCK_TTL_SEC`, `JANITOR_INTERVAL_SEC`, `MEMORY_RANK_WEIGHTS`. (G-9)
- **ID prefixes** for `subtask`, `cycle`, `milestone`, `comment`, `status_event`, `lock`, `span`, `policy_event`, `team_instance`. Now 26 total registered prefixes. (G-15, K-4, R4-5)
- **Run event journal** — `agent_runs.events` is appended on every lifecycle transition (`started`, `heartbeat`, `completed`, `blocked`, `escalated`) via `appendRunEvent` helper. (G-7)
- **§10.7 weighted hybrid memory ranking** — `semantic*0.4 + lexical*0.3 + recency*0.2 + confidence*0.1` with exponential recency decay (~21-day half-life). Reranker score replaces the semantic component when invoked. (G-10)
- **MemoryKind expanded to 16 values** — 13 canonical + `tool_trace` / `reasoning_step` / `lesson`. Single source of truth in `@fulcrum/core`; `@fulcrum/memory` re-exports from core. (J-4)

#### Schema additions
- **`projects` table**: `type` (git/non_git/submodule/logical), `status` (active/archived/paused), `write_mode` (worktree/in_place/sequential), `git_url`, `parent_project_id`, `description`. (G-2, H-19)
- **`memories.task_id`** column + `'task'` value added to `MemoryScope` enum. (G-4, H-6)
- **10 new migrations (020..029)** — project column extensions, `memories.task_id`, `trace_events` table, `advisory_locks` rebuild, `handoff_mode` CHECK restore, `memory_scope` CHECK update, `projects.description`, `MemoryKind` CHECK, missing CHECK constraints (`tasks.status`, `agent_runs.role`, `agent_runs.status`, `workspaces.status`, `handoffs.priority`, `handoffs.scope`), `worktrees.base_branch`, `worktrees.status` `conflict` value.

#### Defensive guard tests
- **CHECK-drift guard** (`packages/core/src/tests/check-constraints.test.ts`) — iterates 14 enum columns and asserts DB CHECK matches TS type union. Catches migration rebuilds that silently drop CHECK constraints.
- **Bare-ulid guard** (`packages/core/src/tests/ulid-guard.test.ts`) — greps all production `.ts` files and fails if any call `ulid()` directly outside a 5-file allowlist. Forces ID generation through `newId(<type>)`.
- **Role-string guard** (`packages/core/src/tests/role-string-guard.test.ts`) — greps all production `.ts` files and fails if any do `=== 'role_slug'` comparisons outside a 3-file allowlist. Forces role boundary checks through `isL1` / `canInvokeTeams` / `canMerge` / etc.

### Changed

- **`recallMemory`** — `project_id` is now optional; when omitted, scoped to the whole workspace instead of failing. (G-3)
- **`HandoffMode`** — enum values aligned to Python spec: `brief | contextual | artifact_first_brief | branched_session`. Earlier value set (`sync | async | review | escalate`) was a bug from Round 1 Task 14 caught and fixed in Round 2. (R1-REG-1)
- **`HandoffPacket.done_criteria`** tightened from `string | undefined` to `string[]`; `HandoffMode` changed from `string` to typed literal union. (G-13)
- **Embedding model** — `initEmbedding()` now called at `fulcrum serve mcp/monitor/all` startup (warmup), not lazy-initialized on first query. (G-14)
- **Monitor server** — hardcoded port `7331` replaced with `DEFAULT_MONITOR_PORT = 4721` from the constants module. (G-9)
- **`listAgentProfiles`** — reads role descriptions from `agent-integration/roles/<role>.md` at runtime (parses the `## Purpose` section). Falls back to hardcoded descriptions for roles without a file. (G-11)
- **Policy role checks** — `SYSTEM_INVARIANTS` in `@fulcrum/policy` now use `isL1()` / `canMerge()` / `canInvokeTeams()` from the central role capability system instead of hardcoded string comparisons. (H-11)
- **`ensureWorkspace` / `ensureProject`** helpers in the monitor server and CLI `ensureProjectInitialized` now delegate to `@fulcrum/core` `createWorkspace` / `createProject` instead of raw SQL. (G-1 follow-through)
- **`packages/core/src/memory.ts writeMemory`** — now the canonical memory write path. `cos-parser.ts` delegates here instead of maintaining its own hand-rolled INSERT. (K-1, K-3)
- **`@fulcrum/cli`** — gained vitest infrastructure. 21 tests cover hook normalization, CLI dispatch, and group smoke tests.
- **`AgentRunStatus` TS type** — added missing `'stale'` value that the janitor was already writing but wasn't in the type. (R3-5 side-find)
- **`MemoryKind` (packages/memory)** — now re-exports from `@fulcrum/core` instead of maintaining a local declaration. (J-4)

### Fixed

- **R1-REG-1** — `HandoffMode` type values were wrong and the DB CHECK had been silently dropped by MIGRATION_013. Fixed in MIGRATION_022 which restores the CHECK to the correct `brief`/`contextual`/`artifact_first_brief`/`branched_session` set.
- **G-1** — workspaces/projects CRUD were previously reached via raw SQL in CLI and monitor; now delegated to `packages/core/src/{workspaces,projects}.ts` so FK / enum validation lives in one place.
- **G-5** — `advisory_locks` table existed but had no API; now fully implemented.
- **G-6** — `chief_of_staff_no_direct_writes` policy invariant added. L1 roles are denied `tool_use:Write|Edit|MultiEdit|NotebookEdit` and any `shell_exec:git ...` at the policy engine level.
- **G-7** — agent run event journal was defined in schema but never written. Now appended on every lifecycle transition.
- **J-1** — `packages/memory/src/write.ts` generated `memory_id` via bare `ulid()` instead of `newId('memory')` — memory rows were persisted without the `mem_` prefix. Fixed.
- **J-2, J-3** — `tasks.status` and `agent_runs.role` CHECK constraints were dropped by MIGRATION_002 and never replaced. MIGRATION_025 rebuilds both tables with correct CHECKs.
- **J-5** — `memories.kind` CHECK had been silently failing in MIGRATION_005 (duplicate column error). MIGRATION_026 is the first migration to actually enforce the enum at the DB level.
- **K-1, K-3** — `packages/core/src/cos-parser.ts` bypassed `newId('memory')` AND its INSERT column list had drifted from the current `memories` schema. Delegated to `writeMemory()` instead.
- **K-2** — `NormalizedHookEvent` silently dropped PI `runId`. Now captured; test asserts round-trip.
- **K-4** — `packages/policy/src/audit.ts` used a custom `pevt_` prefix via `'pevt_' + ulid()`. `policy_event` now registered in the central PREFIXES map and uses `newId('policy_event')`.
- **K-4 sweep (10 sites)** — `packages/planning/{epics,issues,plans,prds,reviews}.ts`, `policy/engine.ts`, `workflows/workflows.ts`, `worktrees/worktrees.ts`, `teams/teams.ts` (×2) all routed through `newId(<type>)` instead of hand-rolled prefix concatenation.
- **P5-001..003** — three hardcoded role string comparisons (in `worktrees.ts`, `monitor/server.ts`, `cli/index.ts`) replaced with capability helper calls.
- **MIGRATION_027** — added missing CHECK constraints that had never been defined: `agent_runs.status`, `workspaces.status`, `handoffs.priority`, `handoffs.scope`.

### Removed

- **`fulcrum init` subcommand** — replaced by auto-init that runs on every fulcrum command. The explicit init step was redundant.

---

## [0.0.1] — 2025-04-13

### Added

**`@fulcrum/core`** — initial release of the local-first agent control plane.

#### Domain functions (14 total)
- `listTasks`, `createTask`, `updateTask` — task lifecycle with optimistic locking
- `startAgentRun`, `heartbeatAgentRun`, `getAgentRunStatus`, `completeAgentRun`, `blockAgentRun`, `escalateRun` — agent run lifecycle
- `checkPolicy` — WIP limit enforcement (global + per-role) and dependency checks
- `writeMemory`, `recallMemory` — hybrid memory with FTS5 + optional vector ANN + BGE reranker
- `getWorkspaceStatus`, `buildCosContext`, `listAgentProfiles` — status and chief-of-staff context

#### Infrastructure
- SQLite schema with WAL mode, foreign keys, FTS5 virtual tables, and `sqlite-vec` for optional vector search
- `runMigrations` — idempotent schema migrations
- `loadConfig` — `.fulcrum.json` file + env var overrides
- `startJanitor` — background timer with overlapping-cycle protection
- `LocalEmbeddingProvider` and `LocalRerankerProvider` with promise-cache warmup

#### Hardened validation and isolation
- Policy checks validate per-role WIP limits are non-negative
- `checkPolicy` task lookup is workspace-scoped (prevents cross-workspace leakage)
- `startAgentRun` validates `workspace_id` matches the task's actual workspace
- `blockAgentRun` and `escalateRun` validate non-empty reason strings
- FTS5 fallback catches any `SQLITE_ERROR` (not just keyword-matched messages)

#### Test suite
- 91 tests, 0 failures (2 skipped behind `FULCRUM_EMBEDDING_TESTS=1`)
- In-memory SQLite injection via `setDb()` for fast, isolated tests

---

### `@fulcrum/memory` — Three-Layer Memory Stack

#### L0 — Git-backed vault (`~/.fulcrum/vault/`)
- Human-readable markdown memories with YAML frontmatter; curated kinds committed to git, operational kinds gitignored
- Vault watcher (chokidar) detects human edits: validates schema, updates `content_hash`/`updated_at`, triggers L1+L2 sync
- Git branch workflow: per-task `memory/<task_id>` branches merge to main with `--no-ff`
- `reconcileMergedBranch()`: post-merge L1+L2 reconciliation via explicit merge commit SHA resolution

#### L1 — SQLite FTS5 (wired to L0)
- `writeMemory()` writes L0 first (canonical commit point), then syncs L1 synchronously
- `insertMemoryDirect()`: idempotent L0→L1 rebuild preserving original memory IDs
- SHA-256 content deduplication; drift verification mode

#### L2 — Kuzu embedded graph + HNSW (opt-in)
- 13 node/edge table types; Memory and Entity nodes; 14 edge types (Memory→Entity, Entity→Entity, Memory→Memory)
- 6-stage retrieval pipeline: HNSW vector seed → 1-hop graph expansion → 2-hop entity expansion → superseded filter → fused scoring → MMR diversification
- Workspace affinity scoring (+1.0 same, +0.3 related, −0.6 contradiction penalty)
- Hot entity penalty (mention_count > 1000 → 0.1× edge weight)

#### Extraction pipeline
- Track 1 (sync, rule-based): ID prefix rules, file path detection, wikilinks → `MENTIONS`/`PRODUCED_IN` edges
- Track 2 (async, LLM-backed): queued for semantic extraction on curated kinds

#### Setup
- `fulcrum memory init` / `runMemoryInit()`: interactive vault + L2 setup wizard
- `fulcrum memory accelerate` / `activateL2()`: enable L2 on existing vault
- `fulcrum memory rebuild [--target l1|l2|both] [--verify]`: idempotent index rebuild from L0 files

---

### `@fulcrum/monitor`
- Daily, project, and agent metrics aggregation from SQLite task/run data
- Burndown data computation (planned vs. completed over time)
- HTTP server exposing `/metrics`, `/health` endpoints for external monitoring

### `@fulcrum/planning`
- Epic and issue management with status lifecycle (draft → active → closed)
- PRD (Product Requirements Document) creation and versioning
- Plan linking: associate issues to implementation plans
- Task relation graph: `blocks`, `blocked_by`, `relates_to`, `duplicates` edges
- Code review workflows: request, update, approve/reject with reviewer assignment

### `@fulcrum/policy`
- `SYSTEM_INVARIANTS`: always-on workspace rules (WIP cap, no orphaned runs, role allowlists)
- Custom policy rules: per-workspace, per-role, per-action rule evaluation
- `checkSecrets` / `redactSecrets`: pattern-based secret detection and redaction in agent outputs
- Append-only audit log: every policy evaluation recorded with actor, outcome, and context

### `@fulcrum/sync`
- Plane API client: authenticated requests to Plane project management REST API
- Plane adapter: maps Fulcrum `Task`/`Issue` fields to Plane cycle/issue model and back
- Sync manager: bidirectional sync with configurable direction (fulcrum→plane, plane→fulcrum, both)
- Conflict detection: tracks `SyncState` per item, flags diverged fields for resolution

### `@fulcrum/teams`
- `TeamTemplate`: defines team composition (role slots, size constraints, communication mode)
- `TeamSlot`: typed role + model + latency/budget/quality class constraints
- `canStartTeam(template, workspaceStatus)`: scheduler gate — checks WIP headroom before spawning
- Team policy: `CommunicationMode`, `WorktreePolicy`, `BudgetClass`, `LatencyClass`, `QualityClass`

### `@fulcrum/workflows`
- `WorkflowDefinition`: named, versioned step graphs with typed transitions and entry points
- `WorkflowStepDef`: step type (task, decision, parallel, wait), handler reference, retry policy
- Workflow registry: lookup by `(name, version)`, list available definitions
- Workflow engine: advance a `WorkflowRun` through steps, evaluate transitions, handle failures

### `@fulcrum/worktrees`
- `Worktree`: per-task isolated git workspace with status lifecycle (pending → active → merged/abandoned)
- `Artifact`: typed output files (diff, report, build-output, test-results) attached to worktrees or runs
- `Review`: code review request with status (pending → approved/rejected/changes_requested), reviewer tracking
- Handoff mode: `auto` (merge on approval) vs `manual` (human review gate)

[Unreleased]: https://github.com/moabualruz/fulcrum/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/moabualruz/fulcrum/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/moabualruz/fulcrum/releases/tag/v0.0.1
