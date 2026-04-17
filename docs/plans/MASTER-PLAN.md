# Fulcrum Master Plan — Reference Implementation Sprint

**Date**: 2026-04-15  
**Audit source**: `docs/audit/AUDIT-ROUND2.md`  
**Domain plans**: `docs/plans/plan-mcp.md`, `plan-plugins.md`, `plan-skills-agents.md`, `plan-rag.md`, `plan-architecture.md`  
**Goal**: Fulcrum becomes a reference-quality implementation across all 6 audited domains

---

## Conflict Resolution

Before sequencing work, these cross-domain conflicts must be resolved:

### Conflict 1: Architecture refactor vs. all other plans

The architecture plan (GAP-ARCH-1, GAP-ARCH-2) changes the core package API. If other plans (RAG, MCP, Skills) are implemented first, they may import the old API and need to be updated again.

**Resolution**: Architecture Steps 1–4 (circular dep, layer violation, hook types, named exports) must land BEFORE large feature work in other domains. Small bug fixes (GAP-RAG-2, GAP-RAG-6, GAP-MCP-2) are safe to do in parallel since they don't touch package interfaces.

### Conflict 2: Migration numbering

Domain plans each propose new migrations (m041, m042, m043). All three touch schema. They must be applied in order and tested as a set.

**Resolution**: Migrations are numbered sequentially:
- m041: system_prompt seed for 3 core roles (plan-skills-agents Step 2)
- m042: UNIQUE(workspace_id, role) constraint fix (plan-skills-agents Step 6)
- m043: memories_fts tokenizer upgrade (plan-rag Step 4)

If more migrations are added from other plans, continue from m044.

### Conflict 3: Plugin discovery wiring vs. MCP server changes

The plugin plan adds `additionalTools` parameter to `createFulcrumMcpServer()`. The MCP plan adds middleware and Origin validation. Both touch `mcp-server.ts`.

**Resolution**: Merge into a single coordinated change to `mcp-server.ts` in Wave 2 below.

### Conflict 4: A2A card consolidation vs. agent definitions

Plan-skills-agents proposes consolidating to one `buildA2ACard()` in core. Plan-architecture proposes moving hook types to core. Both add to `packages/core/src/`.

**Resolution**: Execute together in Wave 2. Core gets `hooks.ts` (from arch plan) and a consolidated `a2a-card.ts` (from skills plan) in the same PR.

---

## Execution Waves

### Wave 0 — Trivial fixes (parallel, no conflicts) — ~2 hours

These are independent one-to-three line changes. Launch as parallel sub-agents:

| Fix | File | Gap |
|-----|------|-----|
| `embedQuery()` for queries | `recall.ts:155,212` | GAP-RAG-2 |
| Sigmoid reranker | `recall.ts:278` | GAP-RAG-6 |
| Import `globalDataDir` from core | `cli/index.ts:509` | GAP-ARCH-10 |
| Origin header validation | `mcp-server.ts` | GAP-MCP-2 |
| Capabilities declaration in `InitializeResult` | `mcp-server.ts:78-81` | GAP-MCP-1 |
| MCP-Protocol-Version header check | `mcp-server.ts` | GAP-MCP-3 |
| JSON-RPC error for schema failures | `mcp-server.ts:112-127` | GAP-MCP-8 |
| Install-skills script | `scripts/install-skills.mjs` | GAP-SKILLS-9 |
| `tags`/`artifact_paths` as arrays | `mcp-tools.ts` | GAP-MCP-12 |

Commit as: `fix(core): Wave 0 — trivial bug fixes across MCP, RAG, arch`

---

### Wave 1 — Architecture foundations (sequential, must be done before Wave 2)

These must land first because they change package boundaries.

**Step 1A**: Move hook types to `fulcrum-core` (GAP-ARCH-3)
- Create `packages/core/src/hooks.ts`
- Update `packages/cli/src/index.ts` imports
- Remove exports from CLI

**Step 1B**: Named exports replace `export *` (GAP-ARCH-4)
- `packages/teams/src/index.ts`
- `packages/policy/src/index.ts`
- `packages/workflows/src/index.ts`

**Step 1C**: Policy layer violation fix (GAP-ARCH-2)
- Add `TeamContext` interface to `packages/core/src/types.ts`
- Update policy rules to accept data objects instead of importing teams
- Remove `fulcrum-teams` from `packages/policy/package.json`

**Step 1D**: Break core↔teams circular dependency (GAP-ARCH-1)
- `packages/core/src/team-ops.ts` — add `setTeamOps()`/`getTeamOps()` pattern
- `packages/teams` — export `createTeamOps()`
- `packages/cli/src/index.ts` — call `setTeamOps(createTeamOps())` at startup
- Remove dynamic `import('fulcrum-teams')` from core

**Step 1E**: Embedding registry as plugin registry (GAP-ARCH-6)
- Replace switch/case with `registerEmbeddingProvider()` map
- Built-ins self-register

**Verify**: Run madge. Assert 0 circular dependencies. Run all tests.

---

### Wave 2 — Feature work (domain plans, can be parallelized after Wave 1)

**Track A — MCP compliance** (GAP-MCP-4, GAP-MCP-5, GAP-MCP-7, GAP-MCP-9, GAP-MCP-10, GAP-MCP-11):
- HTTP DELETE session termination
- Fix `properties: {}` schema mismatch on zero-param tools
- Fix resource list suppression
- Document authentication security boundary
- Plugin-extensible tools (`additionalTools` parameter)

**Track B — RAG improvements** (GAP-RAG-1, GAP-RAG-3, GAP-RAG-4, GAP-RAG-5, GAP-RAG-7, GAP-RAG-8):
- Wire ASTChunker into ingest.ts
- Migration m043: memories_fts tokenizer
- Import graph edges in Kuzu
- MMR with cosine similarity
- Memory paging (`offset` parameter)

**Track C — Skills & Agent Definitions** (GAP-SKILLS-2 through GAP-SKILLS-8, GAP-AGENTDEF-1 through GAP-AGENTDEF-10):
- Migration m041: system_prompt for core roles
- Migration m042: UNIQUE(workspace_id, role)
- Consolidate A2A card builders
- Add `allowed-tools` and invocation control to all 20 skill files
- Add input/output contracts to key skills
- Add `protocolVersion`/`securitySchemes` to A2A card

**Track D — Plugin architecture** (GAP-PLUGIN-1 through GAP-PLUGIN-7):
- Wire `discoverPlugins()` into CLI startup
- Global plugin directory scan
- `fulcrum plugin list/install/link` commands
- Plugin manifest `settings[]`
- Inbound hook middleware chain

**Track E — Architecture quality** (GAP-ARCH-5, GAP-ARCH-7, GAP-ARCH-8, GAP-ARCH-9):
- Optional `db` parameter on DB-touching functions
- Config loading consolidation
- EventBus
- Peer dependency validation

---

### Wave 3 — Validation

After all tracks complete:

1. Run `pnpm test --recursive` — all suites must pass
2. Run madge — assert 0 cycles
3. Run `tsc --noEmit` from each package root — assert no type errors
4. Run the MCP compliance checklist manually against a running `fulcrum serve mcp`
5. Verify `/.well-known/agent.json` response against A2A v0.3.x schema
6. Run `npm run install-skills` and verify Claude Code picks up the skills
7. Install a test plugin and verify it activates

---

## Gap Prioritization (if partial execution is needed)

If time is limited, execute in this order by impact:

**Must do** (breaks fundamental contracts or is dead code):
1. GAP-PLUGIN-1: Wire plugin discovery (critical dead code)
2. GAP-RAG-2: `embedQuery()` (trivial, high retrieval quality impact)
3. GAP-MCP-2: Origin validation (security)
4. GAP-ARCH-1: core↔teams cycle (architectural integrity)
5. GAP-ARCH-2: policy→teams violation (architecture)
6. GAP-SKILLS-9: install skills (skills are currently unloaded)
7. GAP-SKILLS-4: system_prompt seed (agents have no behavioral constraints)

**Should do** (standards compliance):
8. GAP-MCP-1: capabilities declaration
9. GAP-MCP-8: JSON-RPC error codes
10. GAP-RAG-1: ASTChunker wiring
11. GAP-AGENTDEF-10: UNIQUE constraint
12. GAP-AGENTDEF-3: consolidate A2A builders

**Good to do** (quality improvements):
13. GAP-ARCH-3, ARCH-4: package API hygiene
14. GAP-RAG-6: reranker sigmoid
15. GAP-AGENTDEF-6: document capabilities/enforcement relationship
16-58: Remaining gaps

---

## Success Criteria for "Reference Implementation"

The codebase earns the reference label when:

1. **MCP**: No spec violations. All capabilities declared. Security controls in place (Origin, documented auth).
2. **Plugins**: `plugin-discovery.ts` is wired and tested. `fulcrum plugin install` works.
3. **Skills**: All 20 skills have `allowed-tools` + invocation control. Skills load in Claude Code.
4. **Agent Definitions**: Single A2A card builder with correct spec fields. 3 core roles have system_prompt.
5. **RAG**: `embedQuery()` used for queries. ASTChunker wired. Import graph edges emitted.
6. **Architecture**: madge reports 0 cycles. Policy does not depend on teams. No `export *`.
7. **Tests**: All suites pass. New tests cover every gap fixed.
