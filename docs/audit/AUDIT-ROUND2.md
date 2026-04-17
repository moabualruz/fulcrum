# Fulcrum Round 2 Audit — Reference Implementation Gap Report

**Date**: 2026-04-15  
**Method**: 6 parallel research agents, each cross-referencing a domain's industry standards against the actual Fulcrum codebase. Every gap is backed by a specific file and line reference.  
**Research docs**: `docs/research/` (6 files, one per domain)  
**Total gaps**: 58 (7 Critical · 29 Major · 22 Minor)

---

## Executive Summary

Fulcrum is structurally sound but diverges from industry standards at every integration seam. The gaps fall into two categories:

**Type A — Wiring gaps** (code is written but never called): Plugin discovery (`plugin-discovery.ts` — fully implemented, never imported), AST chunker (`chunkers/ast-chunker.ts` — written, bypassed by `ingest.ts`). These are zero-logic fixes.

**Type B — Design gaps** (the correct approach was not used): asymmetric embeddings for queries, Origin-header CSRF protection on MCP HTTP, circular dependency through a dynamic import workaround, two divergent A2A card builders, all 24 agent roles seeded without system prompts.

The 7 Critical gaps are the ones that prevent Fulcrum from being a trustworthy, deployable reference:
1. No CSRF (Origin) protection on MCP HTTP transport
2. No authentication on MCP HTTP transport
3. `fulcrum-core` ↔ `fulcrum-teams` circular dependency
4. `fulcrum-policy` depends on `fulcrum-teams` (enforcement layer below domain)
5. Plugin discovery is dead code — never wired into the CLI
6. All 24 agent roles seeded with `system_prompt = NULL`
7. Skill files exist in `agent-integration/skills/` but are not installed where Claude Code loads them from

---

## Domain 1: MCP Protocol (14 gaps)

**Research**: `docs/research/mcp-standards.md` — audited against MCP spec 2025-11-25  
**Primary files**: `packages/cli/src/mcp-server.ts`, `packages/cli/src/mcp-tools.ts`

### Critical

**GAP-MCP-2: No `Origin` header validation on Streamable HTTP**  
`mcp-server.ts:380-431`  
Spec mandates: servers MUST validate the `Origin` header on all Streamable HTTP connections and return HTTP 403 on invalid origin. Fulcrum's HTTP handler processes all requests with no `Origin` inspection. DNS rebinding attack surface.  
Fix: Block at top of handler — if `Origin` is present and not in allowlist, `res.writeHead(403)`.

**GAP-MCP-10: No authentication on HTTP transport**  
`mcp-server.ts:358-450`  
Spec requires OAuth 2.0 Protected Resource Metadata (RFC 9728) for HTTP-based MCP servers. Any client that can reach port 4722 invokes all 22 tools without credentials.  
Fix (local deployment): document `127.0.0.1`-only binding as the security boundary. Fix (any network deployment): bearer token middleware + RFC 9728 `/.well-known/oauth-protected-resource`.

### Major

**GAP-MCP-1: `InitializeResult.capabilities` missing `tools`/`resources`/`prompts`**  
`mcp-server.ts:78-81`  
`createFulcrumMcpServer` passes `{ capabilities: { logging: {} } }`. Tools, resources, and prompts are registered but never advertised.  
Fix: `{ capabilities: { logging: {}, tools: {}, resources: {}, prompts: {} } }`.

**GAP-MCP-3: No `MCP-Protocol-Version` header validation**  
`mcp-server.ts:380-431`  
Post-initialization requests must include `MCP-Protocol-Version: 2025-11-25`. Unknown versions must return HTTP 400.  
Fix: Read `req.headers['mcp-protocol-version']` before delegating to transport; return 400 on mismatch.

**GAP-MCP-8: Zod validation failures use `isError: true` instead of JSON-RPC `-32602`**  
`mcp-server.ts:112-127`  
Input schema validation failures go to the LLM as retryable execution errors. The spec says schema failures are protocol errors (code `-32602`).  
Fix: Throw a JSON-RPC error for validation failures; keep `isError: true` only for runtime execution errors.

**GAP-MCP-9: Resource subscriptions not implemented; `list: undefined` suppresses discovery**  
`mcp-server.ts:149-259`  
Five resources registered but `{ list: undefined }` prevents `resources/list` from working. Subscriptions not implemented.  
Fix: Either implement or explicitly omit. Remove `{ list: undefined }` to allow resource discovery.

### Minor

**GAP-MCP-4**: No HTTP DELETE handler for session termination  
**GAP-MCP-5**: `outputSchema` uses a passthrough Zod object (`z.object({}).passthrough()`) — no per-tool contracts  
**GAP-MCP-6**: No `$schema` fields on `inputSchema`; `buildZodShape` silently drops nested `items.properties`  
**GAP-MCP-7**: Zero-param tools use `properties: {}` (open) but handlers use `.strict()` (closed) — contract mismatch  
**GAP-MCP-11**: Long-running tools ignore `_meta.progressToken` — no progress notifications  
**GAP-MCP-12**: `tags` and `artifact_paths` typed as `string` (comma-separated) instead of `array`  
**GAP-MCP-13**: No sampling capability declared or implemented  
**GAP-MCP-14**: `tools.listChanged` absent from capability object (should be `tools: {}`)

---

## Domain 2: CLI Plugin Architecture (7 gaps)

**Research**: `docs/research/cli-plugins.md` — audited against Claude Code, Gemini CLI, OpenCode patterns  
**Primary files**: `packages/cli/src/plugin-discovery.ts`, `packages/cli/src/index.ts`, `packages/cli/src/mcp-server.ts`

### Critical

**GAP-PLUGIN-1: Plugin discovery is fully implemented but never called**  
`packages/cli/src/plugin-discovery.ts` — implements `discoverPlugins()` + `registerPlugins()` with tests.  
`packages/cli/src/index.ts` — never imports `plugin-discovery.ts`. All plugins are permanently inert.  
Fix: Import and call at startup, feed `registration.hookModules` to the hook dispatcher, `registration.skills` to MCP server.

### Major

**GAP-PLUGIN-2: No inbound hook lifecycle for Fulcrum's own runtime**  
`mcp-server.ts:110-146` — single `handleToolCall` with no middleware chain.  
Fulcrum is a hook *provider* for Claude Code/Gemini but accepts no hooks itself.  
Fix: Async middleware chain (`pre-tool`, `post-tool`, `pre-run`, `post-run`) in `handleToolCall`.

**GAP-PLUGIN-3: No manifest-level settings/secrets management**  
`plugin-discovery.ts:10-18` — `FulcrumPluginManifest` has no `settings[]` array.  
Fix: `settings?: Array<{ name, envVar, description?, sensitive? }>` + install-time prompting.

**GAP-PLUGIN-4: No `fulcrum plugin install/update/remove/list` commands**  
Zero plugin management surface in the CLI.  
Fix: `plugin list` (calls `discoverPlugins`), `plugin install <npm>`, `plugin link <path>`.

**GAP-PLUGIN-5: Discovery scoped to project `node_modules` only**  
`plugin-discovery.ts:35-64` — walks up to the nearest `node_modules`, no global directory.  
Fix: Also scan `globalDataDir()/plugins/` on startup.

**GAP-PLUGIN-7: `TOOL_SCHEMAS` hardcoded — plugins cannot contribute MCP tools**  
`mcp-tools.ts:29` — static constant array.  
Fix: `createFulcrumMcpServer({ additionalTools? })` parameter, concatenated at registration.

### Minor

**GAP-PLUGIN-6**: No isolation model or trust declaration — hook modules run in-process with full privileges (acceptable for now, must be documented).

---

## Domain 3: Skills File Structure (9 gaps)

**Research**: `docs/research/skills-files.md` — audited against SKILL.md open standard, agentskills.io  
**Primary files**: `agent-integration/skills/*/SKILL.md` (20 files)

### Critical

**GAP-SKILLS-4: All 24 `AgentDefinition` rows have `system_prompt = NULL`**  
`packages/core/src/db/migrations/m032b.ts:36-45`  
The seed INSERT omits `system_prompt` for all built-in roles. Skills partially compensate but are opt-in; system prompts are unconditional.  
Fix: Populate `system_prompt` at minimum for `chief_of_staff`, `integration_worker`, `security_reviewer` in a follow-on migration.

**GAP-SKILLS-9: Skills not installed where Claude Code loads them**  
`agent-integration/skills/` — skills exist here but Claude Code reads from `.claude/skills/` or `~/.claude/skills/`.  
`agent-integration/skills/index.md:57-58` — acknowledges portability as a goal but no install step exists.  
Fix: Add `install-skills` target that symlinks `agent-integration/skills/` to the correct load path.

### Major

**GAP-SKILLS-2**: No input/output contract in any skill (`$ARGUMENTS`, artifact type)  
**GAP-SKILLS-3**: No `allowed-tools` in any skill — read-only advisory skills indistinguishable from write-capable skills  
**GAP-SKILLS-6**: No `disable-model-invocation` or `user-invocable` control — side-effect skills can trigger unexpectedly  
**GAP-SKILLS-7**: `AgentDefinition.output_schema` exists in DB and types but NULL everywhere, no skill references it  

### Minor

**GAP-SKILLS-1**: `triggers` field used in 50% of skills with no stated convention  
**GAP-SKILLS-5**: No version/author metadata in skill frontmatter  
**GAP-SKILLS-8**: No end-to-end worked examples in any skill body  

---

## Domain 4: Agent Definition Standards (10 gaps)

**Research**: `docs/research/agent-definitions.md` — audited against A2A v0.3.x, OpenAI Agents SDK, CrewAI  
**Primary files**: `packages/core/src/a2a-card.ts`, `packages/monitor/src/agent-card.ts`, `packages/core/src/db/migrations/m032b.ts`

### Major

**GAP-AGENTDEF-1: Missing `protocolVersion` in A2AAgentCard**  
`packages/core/src/a2a-card.ts:24-34` — no `protocolVersion` field.  
`packages/monitor/src/agent-card.ts` — omits it too.  
Fix: Add `protocolVersion: "0.3.0"` to both.

**GAP-AGENTDEF-2: Authentication uses flat string array instead of OpenAPI `securitySchemes`**  
`packages/monitor/src/agent-card.ts:38-40` — `authentication: { schemes: ['Bearer'] }`.  
Fix: `securitySchemes: { "bearer": { type: "http", scheme: "bearer" } }`.

**GAP-AGENTDEF-3: Two inconsistent A2A card builders, neither fully compliant**  
`packages/core/src/a2a-card.ts` — proper MIME types, no `provider`/`authentication`.  
`packages/monitor/src/agent-card.ts` — has `provider`/`authentication`, wrong MIME types, never calls core builder.  
Fix: Consolidate into one canonical builder in core; monitor calls it.

**GAP-AGENTDEF-5: No file-based agent definition format**  
All 24 role definitions are DB-only SQL seeds. No YAML/JSON/TOML format an operator can author and commit.  
Fix: Define a YAML schema; loader syncs at startup (analogous to `fulcrum.config.yaml`).

**GAP-AGENTDEF-6: `capabilities` array disconnected from enforcement**  
DB `capabilities: ["write_code", "edit_files"]` has no effect on what the agent can actually do. Enforcement lives in hardcoded `roles.ts` sets.  
Fix: Either (a) make `roles.ts` read from DB, or (b) document clearly that `capabilities` is A2A metadata only.

**GAP-AGENTDEF-8: Built-in role descriptions too thin for routing**  
m032b seeds single-sentence descriptions and `system_prompt: NULL`. Routing agents have minimal signal.  
Fix: Populate `system_prompt` and add structured `goal`/`backstory` fields (CrewAI pattern).

**GAP-AGENTDEF-10: UNIQUE constraint not workspace-scoped**  
`packages/core/src/db/migrations/m031.ts:12` — `role TEXT NOT NULL UNIQUE` (global).  
Application checks are workspace-scoped; DB constraint is not. Second workspace seeding same role would fail at DB level.  
Fix: `UNIQUE(workspace_id, role)`.

### Minor

**GAP-AGENTDEF-4**: `A2ASkill` has no `examples` field  
**GAP-AGENTDEF-7**: No `allow_dispatch` flag on `AgentDefinition` (only on old `AgentProfile`)  
**GAP-AGENTDEF-9**: No `iconUrl` field in `A2AAgentCard`  

---

## Domain 5: RAG / Embeddings / Code Search (8 gaps)

**Research**: `docs/research/rag-embeddings.md` — audited against CAST, voyage-code-3, BEIR benchmarks  
**Primary files**: `packages/memory/src/ingest.ts`, `packages/memory/src/recall.ts`, `packages/memory/src/kuzu/query.ts`, `packages/core/src/embedding/`

### Major

**GAP-RAG-1: `ASTChunker` implemented but not wired into `ingest.ts`**  
`packages/memory/src/ingest.ts:27` — calls `chunkSyntax()` (regex-based).  
`packages/memory/src/chunkers/ast-chunker.ts` — fully implemented, never called.  
Fix: Replace `chunkSyntax()` with `createASTChunker()` in `ingest.ts`; fall back on WASM failure.

**GAP-RAG-2: `embed()` used for queries instead of `embedQuery()`**  
`packages/memory/src/recall.ts:155` and `:212` — calls `embedder.embed(input.query)`.  
`embedder.embed()` maps to `embedDocument()`, applying `DOC_PREFIX` instead of `QUERY_PREFIX`.  
Fix: `embedder.embedQuery(input.query)` in both locations.

**GAP-RAG-4: No import/call-graph edges from static analysis**  
Kuzu graph has `USES`/`IS_A` edges but only from LLM extraction on `decision`/`fact` memories.  
Code chunks (`symbol`, `doc`) have no structural graph edges.  
Fix: Parse import declarations during ingest, emit `USES` edges between file-level entities.

### Minor

**GAP-RAG-3**: `memories_fts` uses default tokenizer — no camelCase splitting for code identifiers  
**GAP-RAG-5**: MMR in Kuzu degrades to score ordering (no actual cosine similarity — `mmrDiversify()` comment: "Without candidate embeddings")  
**GAP-RAG-6**: Reranker logits hard-clamped `[0,1]` instead of sigmoid — collapses rank ordering among high-quality results  
**GAP-RAG-7**: No SPLADE sparse vectors (BM25 is the pragmatic choice; SPLADE is a lift)  
**GAP-RAG-8**: No virtual context paging (MemGPT pattern) — no `offset` on `recall_memory`  

---

## Domain 6: Modular Architecture (10 gaps)

**Research**: `docs/research/modular-architecture.md` — audited against Node.js DIP, pnpm workspace conventions  
**Confirmed by madge**: 2 circular dependency cycles

### Critical

**GAP-ARCH-1: Confirmed circular — `fulcrum-core` ↔ `fulcrum-teams`**  
`packages/core/src/index.ts:138` — dynamic `await import('fulcrum-teams')` workaround inside `getTeamOps()`.  
`packages/teams/src/teams.ts:2` — static import from `fulcrum-core`.  
madge confirms 2 cycles through `scheduler.ts` and `teams.ts`.  
Fix: `TeamOps` interface (already in `core/team-ops.ts`) belongs in core or a zero-dep `fulcrum-types` package; `fulcrum-teams` implements it — no runtime dynamic import needed.

**GAP-ARCH-2: Layer violation — `fulcrum-policy` depends on `fulcrum-teams`**  
`packages/policy/package.json` — `fulcrum-teams` listed as direct dependency.  
Enforcement layer must sit below domain packages.  
Fix: `TeamContext` interface in `fulcrum-core`; policy accepts it as data, `fulcrum-teams` satisfies it at call site.

### Major

**GAP-ARCH-3: CLI `index.ts` exports library-level hook types**  
`packages/cli/src/index.ts` — exports `HookCli`, `NormalizedHookEvent`, `HookContext`, `runPreHook`, `runPostHook`, etc.  
Application entrypoints should not re-export business logic.  
Fix: Move hook types to `fulcrum-core`; CLI `index.ts` becomes a pure dispatch script.

**GAP-ARCH-4: Wildcard `export *` in teams, policy, workflows**  
`packages/teams/src/index.ts`, `packages/policy/src/index.ts`, `packages/workflows/src/index.ts`.  
Every internal symbol becomes a public API contract; tree-shaking blocked.  
Fix: Replace with explicit named exports; add barrel-lint rule.

**GAP-ARCH-5: Module-level DB singleton limits testability**  
`packages/core/src/db/client.ts:23` — `let _db: Database.Database | null = null`.  
`setDb()` exists but requires global mutation for test isolation.  
Fix: Accept optional `db` parameter on functions that need DB; singleton stays as convenience default.

**GAP-ARCH-6: Embedding registry uses switch/case factory, not register pattern**  
`packages/core/src/embedding/registry.ts:17` — hardcoded `createProvider()` switch.  
Contrast with `WorkflowRegistry` which has `register(def)`.  
Fix: `registerEmbeddingProvider(name, factory)` — built-ins self-register at module load.

**GAP-ARCH-7: Config loading duplicated in `fulcrum-memory`**  
`packages/memory/src/setup/wizard.ts:30-45` — reimplements `getFulcrumConfigPath()`/`readFulcrumConfig()`/`writeFulcrumConfig()`.  
`packages/memory/src/vault/client.ts:20` — reads `FULCRUM_VAULT_PATH` directly instead of via `loadConfig`.  
Fix: Expose `readRawConfig()`/`writeRawConfig()` from `fulcrum-core`; delete duplicates.

### Minor

**GAP-ARCH-8**: No event bus — cross-package coordination uses direct imports (no loose coupling mechanism)  
**GAP-ARCH-9**: Peer dependency presence not validated at runtime — missing peer gives opaque `Cannot find module`  
**GAP-ARCH-10**: `globalDataDir()` duplicated in `packages/cli/src/index.ts:509-516` vs `fulcrum-core`  

---

## Severity Summary

| Domain | Critical | Major | Minor | Total |
|--------|----------|-------|-------|-------|
| MCP Protocol | 2 | 4 | 8 | 14 |
| CLI Plugins | 1 | 5 | 1 | 7 |
| Skills Files | 2 | 4 | 3 | 9 |
| Agent Definitions | 0 | 7 | 3 | 10 |
| RAG/Embeddings | 0 | 3 | 5 | 8 |
| Modular Architecture | 2 | 5 | 3 | 10 |
| **TOTAL** | **7** | **28** | **23** | **58** |

---

## Quick-Win Matrix (effort vs. impact)

| Gap | Effort | Impact | Category |
|-----|--------|--------|----------|
| GAP-RAG-2: `embedQuery()` in recall.ts | Trivial (2 lines) | High | Fix now |
| GAP-RAG-6: sigmoid reranker | Trivial (1 line) | Medium | Fix now |
| GAP-ARCH-10: deduplicate `globalDataDir()` | Trivial (1 import) | Low | Fix now |
| GAP-MCP-2: Origin header validation | Low | Critical | Fix now |
| GAP-RAG-1: wire ASTChunker into ingest | Low | High | Fix now |
| GAP-PLUGIN-1: wire plugin discovery | Low | Critical | Fix now |
| GAP-MCP-1: declare tool/resource capabilities | Low | Major | Fix now |
| GAP-AGENTDEF-10: workspace-scoped UNIQUE constraint | Low (migration) | Major | Fix now |
| GAP-MCP-8: JSON-RPC error for validation failures | Low | Major | Fix now |
| GAP-ARCH-2: policy ↔ teams layer violation | Medium | Critical | Plan needed |
| GAP-ARCH-1: core ↔ teams circular dep | Medium | Critical | Plan needed |
| GAP-SKILLS-9: install skill files | Low | Critical | Fix now |
| GAP-SKILLS-4: system prompts for 24 roles | Medium (content) | Critical | Plan needed |
| GAP-AGENTDEF-3: consolidate A2A card builders | Medium | Major | Plan needed |
| GAP-AGENTDEF-5: file-based agent definitions | High | Major | Plan needed |
| GAP-PLUGIN-2: inbound hook middleware | High | Major | Plan needed |

---

## Reference Standards

| Domain | Primary Standard |
|--------|-----------------|
| MCP | [MCP 2025-11-25 spec](https://modelcontextprotocol.io/specification/2025-11-25) |
| CLI Plugins | Claude Code hooks, Gemini CLI gemini-extension.json, OpenCode Hooks API |
| Skills Files | SKILL.md open standard (agentskills.io), Claude Code skills convention |
| Agent Definitions | A2A Protocol v0.3.x (`/.well-known/agent.json`), CrewAI role/goal/backstory |
| RAG/Embeddings | CAST 2025, voyage-code-3, BEIR/ZeroEntropy benchmarks, MemGPT paging |
| Architecture | Node.js DIP, pnpm workspace patterns, plugin registry convention |
