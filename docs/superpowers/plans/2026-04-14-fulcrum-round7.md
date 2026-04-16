# Fulcrum Round 7 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Fulcrum's existing components together, bring all 7 subsystems up
to standard, and ship a system where every tool call in a Claude session is
tracked end-to-end.

**Architecture:** Retrofit, not rebuild. The code is good; the plumbing is
disconnected. Round 7 connects the components: SessionStart hook → agent run →
hook pipeline → memory writes → Kuzu graph → recall. Parallel tracks: MCP SDK
migration, skills rebuild, agent definitions, memory pipeline hardening, and
modular architecture cleanup.

**Tech Stack:** TypeScript, pnpm workspaces, SQLite (better-sqlite3), Kuzu (graph),
@modelcontextprotocol/sdk, tree-sitter, vitest, tsup, madge

---

## Specialized plans (source documents)

| Plan | File | Issues |
|------|------|--------|
| P0 — Cross-Cutting | `docs/audit/plans/p0-cross-cutting.md` | 20 issues (F0) |
| P1 — MCP Server | `docs/audit/plans/p1-mcp-server.md` | 33 issues (F1) |
| P2 — Plugin Integrations | `docs/audit/plans/p2-plugin-integrations.md` | 12 issues (F2) |
| P3 — Skills | `docs/audit/plans/p3-skills.md` | 11 issues (F3) |
| P4 — Agent Definitions | `docs/audit/plans/p4-agent-definitions.md` | 15 issues (F4) |
| P5 — Memory + RAG | `docs/audit/plans/p5-memory-rag.md` | 15 issues (F5) |
| P6 — Modular Architecture | `docs/audit/plans/p6-modular-architecture.md` | 16 issues (F6) |

**Total: 122 issues → 62 tasks across 7 plans**

---

## Conflict resolution

Before ordering tasks, here are the cross-plan conflicts resolved in this master plan:

### Conflict 1: P5-Task-5.1 vs P6-Task-6.2 (same work)

Both plans require consolidating the duplicate `writeMemory`/`recallMemory` in
`@moabualruz/fulcrum-core`. **Resolution:** P6-Task-6.2 does this work; P5-Task-5.1 is
removed as a duplicate. P5 starts from Task 5.2 (Kuzu node creation).

### Conflict 2: P0-Task-0.7 vs P2-Task-2.3 (same work: subagent MDs)

Both plans create Claude Code subagent MDs for 24 roles. **Resolution:**
P2-Task-2.3 does this work. P0-Task-0.7 calls into P2 instead of duplicating.
Do P2-Task-2.3 before P0-Task-0.7.

### Conflict 3: P1-Task-1.1 vs P0-Task-0.4 (tool catalogue extraction)

P0 asks for a codegen script (`gen-claude-md.ts`) that imports `TOOL_REGISTRY`.
`TOOL_REGISTRY` is created in P1-Task-1.1. **Resolution:** P1-Task-1.1 must
land before P0-Task-0.4. They're in the same PR phase (both Phase 1).

### Conflict 4: P2-Task-2.2 (skills directory form) vs P3-Task-3.2 (scripted pattern)

P2 restructures skills to directory form; P3 rewrites skill content to scripted.
**Resolution:** Do P2-Task-2.2 first (structure), then P3-Task-3.2 (content).
Both can be one combined PR: restructure AND rewrite in one pass per skill.

### Conflict 5: P4-Task-4.2 vs P2-Task-2.3 (subagent MD frontmatter)

P2-Task-2.3 creates subagent MDs with basic frontmatter. P4-Task-4.2 adds
`tools.allowed`, `tools.denied`, `model` to the same files. **Resolution:**
P2 creates the files; P4 enriches them. Do P2 first.

### Conflict 6: P6-Task-6.7 (`Db` port threading) scope

Removing `getDb()` touches ~40 call sites. This is the riskiest task in P6.
**Resolution:** Defer P6-Task-6.7 to the final wave. Do it incrementally:
one module per PR. Do not do it in the same PR as any other P6 task.

---

## Global dependency graph

```
Wave 1 (foundation — do first, blocks everything):
  P6-T6.1  Extract @fulcrum/kernel
  P6-T6.2  Delete duplicate implementations (memory/policy in core)
  P1-T1.1  Extract tool catalogue to mcp-tools.ts
  P6-T6.4  Per-package exports maps

Wave 2 (core infrastructure):
  P1-T1.2  SDK migration (depends: P1-T1.1)
  P1-T1.3  Protocol version + init + shutdown (depends: P1-T1.2)
  P4-T4.1  agent_definitions schema MIGRATION_026 (independent)
  P5-T5.2  Kuzu memory-node in writeMemory (depends: P6-T6.2)
  P5-T5.3  Retrieval eval harness (independent — measure first)
  P6-T6.5  Build step / tsup (depends: P6-T6.4)

Wave 3 (integration — all core deps satisfied):
  P0-T0.1  SessionStart + Stop hooks (depends: P1-T1.2)
  P0-T0.2  Claude Code agent adapter (depends: P0-T0.1)
  P2-T2.1  Register all lifecycle hooks in installer (depends: P0-T0.1)
  P2-T2.3  Claude Code subagent MDs for 24 roles (depends: P4-T4.2)
  P4-T4.2  Migrate role MDs to subagent format (depends: P4-T4.1)
  P4-T4.3  Fix orchestrator.md drift (independent, trivial)
  P1-T1.4  Zod schemas + validation (depends: P1-T1.2)
  P5-T5.4  RRF hybrid fusion (depends: P5-T5.3 eval harness)
  P6-T6.6  CI cycle check (depends: P6-T6.1 kernel)

Wave 4 (enrichment):
  P0-T0.3  E2E session test (depends: P0-T0.1, P0-T0.2)
  P0-T0.4  CLAUDE.md codegen (depends: P1-T1.1 tool catalogue)
  P0-T0.5  Agent profile consumer (depends: P4-T4.1)
  P0-T0.6  Worktree threading (depends: P0-T0.2)
  P1-T1.5  Tool annotations + titles + descriptions (depends: P1-T1.2)
  P1-T1.6  outputSchema + structuredContent (depends: P1-T1.2)
  P1-T1.7  Resources capability (depends: P1-T1.2)
  P2-T2.2  Skills → directory form (independent)
  P3-T3.1  Audit skill tool references (depends: P1-T1.1)
  P3-T3.2  Convert skills to scripted pattern (depends: P2-T2.2)
  P4-T4.4  Wire definitions into startAgentRun (depends: P4-T4.1)
  P4-T4.9  Delete hardcoded AGENT_PROFILES (depends: P4-T4.2, P4-T4.4)
  P5-T5.5  Scope composition in recall (depends: P5-T5.4 RRF)
  P5-T5.6  Verified reranker wiring (depends: P5-T5.3 eval)
  P6-T6.3  Schema ownership documentation (depends: P6-T6.2)
  P6-T6.8  Zod config schemas (independent)

Wave 5 (features + hardening):
  P1-T1.8  Prompts capability (depends: P1-T1.2)
  P1-T1.9  Logging capability (depends: P1-T1.2)
  P1-T1.10 recall_memory real scores (depends: P5-T5.6)
  P1-T1.11 Protocol conformance tests (depends: P1-T1.2, P1-T1.4)
  P2-T2.4  Fix Gemini hook wiring (independent)
  P2-T2.5  Slash commands for Claude (depends: P2-T2.3)
  P2-T2.6  Hook output JSON mode (depends: P2-T2.1)
  P2-T2.9  Installer hardening (depends: P2-T2.1)
  P3-T3.3  Add 20 new skills (depends: P3-T3.2)
  P3-T3.4  Move chief-of-staff out of skills (depends: P3-T3.2)
  P4-T4.5  Definition version + stability (depends: P4-T4.1)
  P4-T4.6  TeamInstance heartbeat (independent)
  P4-T4.7  A2A Agent Card (depends: P4-T4.1)
  P5-T5.7  Instruction prefixes + Matryoshka (depends: P5-T5.6)
  P5-T5.8  Tree-sitter AST chunker (independent)
  P6-T6.9  Plugin discovery (depends: P6-T6.5 build)
  P6-T6.10 @fulcrum/e2e workspace (depends: P0-T0.3 E2E test)

Wave 6 (scale + polish):
  P0-T0.8  Stub-handler sweep (independent)
  P0-T0.9  fulcrum doctor command (depends: P0-T0.1)
  P0-T0.10 Zombie code pruning (independent)
  P0-T0.11 Vocabulary standardisation (independent — types only)
  P0-T0.12 Doc relocation + per-package READMEs (independent)
  P1-T1.12 Pagination (depends: P1-T1.2)
  P1-T1.13 HTTP transport (depends: P1-T1.2)
  P1-T1.14 Cancellation + progress (depends: P1-T1.13)
  P1-T1.15 Polish (depends: P1-T1.2)
  P2-T2.7  Codex integration (independent)
  P2-T2.8  opencode integration (independent)
  P2-T2.10 Unified context-file generator (depends: P0-T0.4)
  P3-T3.5  Move policy enforcement to hooks (depends: P3-T3.2)
  P3-T3.6  Pressure tests for skills (depends: P3-T3.3)
  P3-T3.7  YAML frontmatter fields (depends: P3-T3.2)
  P3-T3.8  Skill authoring guide (independent)
  P4-T4.8  Typed output contracts (depends: P4-T4.1)
  P4-T4.10 AGENTS.md at repo root (independent)
  P4-T4.11 Tool name validation on ingest (depends: P1-T1.1)
  P5-T5.9  Separate code embedder (depends: P5-T5.8)
  P5-T5.10 Aider-style repo-map (depends: P5-T5.8)
  P5-T5.11 Consolidation + decay jobs (independent)
  P5-T5.12 Ingestion quality gates (independent)
  P5-T5.13 Reranker sigmoid + batching (depends: P5-T5.6)
  P5-T5.14 Telemetry span for recall (depends: P5-T5.4)
  P5-T5.15 Fix recall_memory MCP description (depends: P1-T1.5)
  P6-T6.7  Thread Db port (independent, HIGH RISK — last)
  P6-T6.11 Unify ulid/ulidx (independent)
  P6-T6.12 Barrel-file audit + READMEs (independent)
```

---

## Task list (ordered for execution)

### Wave 1 — Foundation

#### Task 1 — Extract `@fulcrum/kernel`
> See: [P6-Task-6.1](../../audit/plans/p6-modular-architecture.md#task-61----extract-fulcrumkernel-f6-issue-01-critical)

- [ ] Create `packages/kernel/package.json` with zero internal deps
- [ ] Move `ids.ts`, pure types, error classes, constants from `@moabualruz/fulcrum-core`
- [ ] Update all internal imports to use `@fulcrum/kernel`
- [ ] Run `pnpm test` — all green
- [ ] Commit: `feat(kernel): extract @fulcrum/kernel leaf package`

#### Task 2 — Delete duplicate implementations
> See: [P6-Task-6.2](../../audit/plans/p6-modular-architecture.md#task-62----delete-duplicate-implementations-f6-issue-09-critical)
> Also covers: [P5-Task-5.1](../../audit/plans/p5-memory-rag.md#task-51----consolidate-writememory--recallmemory-f5-issue-10-critical)

- [ ] Find all callers of `writeMemory`/`recallMemory` in `packages/core/`
- [ ] Replace with re-exports from `@moabualruz/fulcrum-memory`
- [ ] Verify policy de-duplication similarly
- [ ] Run `pnpm test` — all green
- [ ] Commit: `refactor(core): remove duplicate memory/policy — re-export from @moabualruz/fulcrum-memory`

#### Task 3 — Extract tool catalogue
> See: [P1-Task-1.1](../../audit/plans/p1-mcp-server.md#task-11----extract-tool-catalogue-precursor-to-sdk-migration)

- [ ] Create `packages/cli/src/mcp-tools.ts` with `TOOL_REGISTRY`
- [ ] Move all 18 tool handler functions from `index.ts`
- [ ] `index.ts` dispatches via `TOOL_REGISTRY`
- [ ] Run tests — all green
- [ ] Commit: `refactor(mcp): extract tool catalogue to mcp-tools.ts`

#### Task 4 — Per-package `exports` maps
> See: [P6-Task-6.4](../../audit/plans/p6-modular-architecture.md#task-64----exports-maps--sideeffects-f6-issue-02-high)

- [ ] Add `exports`, `sideEffects: false`, `files: ["dist"]` to each package.json
- [ ] Commit: `feat(packages): exports maps + sideEffects:false`

---

### Wave 2 — Core Infrastructure

#### Task 5 — MCP SDK migration
> See: [P1-Task-1.2](../../audit/plans/p1-mcp-server.md#task-12----sdk-migration-f1-issue-02-critical)

- [ ] `pnpm add @modelcontextprotocol/sdk` in `packages/cli`
- [ ] Create `packages/cli/src/mcp-server.ts` with `createMcpServer()` + `runMcpServer()`
- [ ] Register all 18 tools via `server.tool(name, schema, handler)`
- [ ] Replace `runServeMcp` body with `runMcpServer`
- [ ] Test with `npx @modelcontextprotocol/inspector`
- [ ] Run existing tests — all green
- [ ] Commit: `feat(mcp): migrate to @modelcontextprotocol/sdk`

#### Task 6 — Protocol version + shutdown
> See: [P1-Task-1.3](../../audit/plans/p1-mcp-server.md#task-13----protocol-version--init--shutdown-f1-issue-01--05--06-critical)

- [ ] Verify `2025-11-25` in initialize response
- [ ] Add SIGTERM handler
- [ ] Commit: `fix(mcp): protocol version + clean shutdown`

#### Task 7 — `agent_definitions` MIGRATION_026
> See: [P4-Task-4.1](../../audit/plans/p4-agent-definitions.md#task-41----agent_definitions-schema--migration-f4-issue-01-critical)

- [ ] Add `MIGRATION_026` to `packages/core/src/migrations.ts`
- [ ] Add `AgentDefinition` TypeScript type to `schema.ts`
- [ ] Add 4 MCP tools: `create/get/update/list_agent_definition`
- [ ] Write migration test
- [ ] Commit: `feat(core): agent_definitions schema — MIGRATION_026`

#### Task 8 — Kuzu memory-node in write path
> See: [P5-Task-5.2](../../audit/plans/p5-memory-rag.md#task-52----kuzu-memory-node-creation-in-write-path-f5-issue-11-critical)

- [ ] Add Kuzu `Memory` node creation after SQLite write in `writeMemory`
- [ ] Create `(w:Workspace)-[:HAS_MEMORY]->(m:Memory)` edge
- [ ] Make conditional on Kuzu availability
- [ ] Write test
- [ ] Commit: `feat(memory): Kuzu Memory node in writeMemory`

#### Task 9 — Retrieval eval harness
> See: [P5-Task-5.3](../../audit/plans/p5-memory-rag.md#task-53----retrieval-eval-harness-f5-issue-08-critical)

- [ ] Create `packages/memory/src/eval/` with harness, fixtures, metrics
- [ ] 50 memory fixtures, 20+ query cases
- [ ] `recall@5 ≥ 0.7` assertion in tests
- [ ] Commit: `test(memory): retrieval eval harness`

#### Task 10 — Build step (tsup)
> See: [P6-Task-6.5](../../audit/plans/p6-modular-architecture.md#task-65----build-step-f6-issue-03-high)

- [ ] Add `tsup` to all library packages
- [ ] Add `"build": "tsup src/index.ts --format esm --dts --clean"` scripts
- [ ] `pnpm build` succeeds for all packages
- [ ] Add to CI
- [ ] Commit: `feat(build): tsup build step for all library packages`

---

### Wave 3 — Integration

#### Task 11 — SessionStart + Stop hooks
> See: [P0-Task-0.1](../../audit/plans/p0-cross-cutting.md#task-01----session-lifecycle-wiring-f0-issue-01-critical)
> Also covers: [P2-Task-2.1](../../audit/plans/p2-plugin-integrations.md#task-21----add-lifecycle-hooks-sessionstart-stop-precompact-f2-issue-08-critical)

- [ ] Create `agent-integration/claude/hooks/session-start.ts`
  — calls `fulcrum start-run`, writes `.fulcrum/sessions/$CLAUDE_SESSION_ID.json`
- [ ] Create `agent-integration/claude/hooks/session-stop.ts`
  — calls `fulcrum complete-run`
- [ ] Create `fulcrum hook claude pre-compact` handler (writes memory on compact)
- [ ] Create `fulcrum hook claude prompt` handler (enriches with CoS context)
- [ ] Update `settings-hooks-snippet.json` with all 6 hook types
- [ ] Update installer to register all hooks
- [ ] Write tests for all 4 handler variants
- [ ] Commit: `feat(hooks): SessionStart, Stop, PreCompact, UserPromptSubmit — full lifecycle`

#### Task 12 — Claude Code agent adapter
> See: [P0-Task-0.2](../../audit/plans/p0-cross-cutting.md#task-02----claude-code-agent-adapter-f0-issue-02-critical)

- [ ] Create `packages/worker/src/adapters/claude-code.ts`
- [ ] Register adapter; wire into `spawnAgent` for Claude roles
- [ ] Write test
- [ ] Commit: `feat(worker): Claude Code agent adapter`

#### Task 13 — Migrate role MDs to subagent format
> See: [P4-Task-4.2](../../audit/plans/p4-agent-definitions.md#task-42----migrate-role-mds-to-subagent-format-f4-issue-02-critical)
> Also covers: [P0-Task-0.7](../../audit/plans/p0-cross-cutting.md#task-07----subagent-md-registration-f0-issue-09-high) + [P2-Task-2.3](../../audit/plans/p2-plugin-integrations.md#task-23----claude-code-subagent-files-for-24-roles-f2-issue-02-critical)

- [ ] Write code generator `scripts/gen-agent-mds.ts`
- [ ] Generate all 24 `agent-integration/claude/agents/<role>.md` with frontmatter
- [ ] Populate: `name`, `description`, `model`, `tools.allowed`, `tools.denied`
- [ ] Add installer step to copy to `~/.claude/agents/`
- [ ] Add CI test: assert 24 files with valid frontmatter
- [ ] Commit: `feat(agents): 24 role subagent MDs with complete frontmatter`

#### Task 14 — Fix `orchestrator.md` drift
> See: [P4-Task-4.3](../../audit/plans/p4-agent-definitions.md#task-43----fix-orchestratormd-drift-f4-issue-08-critical)

- [ ] Read `orchestrator.md` and `roles.ts` side-by-side
- [ ] Sync content — code is source of truth
- [ ] Commit: `fix(agents): sync orchestrator.md with roles.ts`

#### Task 15 — Zod schemas + validation
> See: [P1-Task-1.4](../../audit/plans/p1-mcp-server.md#task-14----zod-schemas--validation-f1-issue-03--09-high)

- [ ] Write Zod schema for each of the 18 tools in `mcp-tools.ts`
- [ ] Use `.strict()` on all schemas
- [ ] Return structured errors on `ZodError`
- [ ] Commit: `feat(mcp): Zod validation + strict schemas for all 18 tools`

#### Task 16 — RRF hybrid fusion
> See: [P5-Task-5.4](../../audit/plans/p5-memory-rag.md#task-54----rrf-hybrid-fusion-f5-issue-03-high)

- [ ] Implement `rrf(lists, k=60)` helper
- [ ] Replace weighted sum with RRF in `recallMemory`
- [ ] Run eval harness before + after — document result
- [ ] Commit: `feat(memory): RRF hybrid fusion`

#### Task 17 — CI cycle check
> See: [P6-Task-6.6](../../audit/plans/p6-modular-architecture.md#task-66----ci-cycle-check-f6-issue-07-high)

- [ ] Install `madge`; write `scripts/check-cycles.ts`
- [ ] Add `pnpm check:cycles` to CI
- [ ] Commit: `feat(ci): cycle detection with madge`

---

### Wave 4 — Enrichment

#### Task 18 — E2E session test
> See: [P0-Task-0.3](../../audit/plans/p0-cross-cutting.md#task-03----e2e-session-test-f0-issue-10-critical)

- [ ] Create `tests/e2e/claude-session.test.ts`
  — simulate SessionStart → PreToolUse → PostToolUse → Stop
  — assert: session.json created, trace_events rows, agent_runs.status = 'completed'
- [ ] Add `@fulcrum/e2e` workspace (or place in root `tests/`)
- [ ] Add to CI: `pnpm test:e2e`
- [ ] Commit: `test(e2e): Claude session lifecycle — full hook sequence`

#### Task 19 — CLAUDE.md codegen
> See: [P0-Task-0.4](../../audit/plans/p0-cross-cutting.md#task-04----claudemd-codegen-f0-issue-04-high)

- [ ] Write `scripts/gen-claude-md.ts` — reads `TOOL_REGISTRY`, templates CLAUDE.md
- [ ] Add `gen:claude-md` script + CI drift check
- [ ] Regenerate current CLAUDE.md
- [ ] Commit: `feat(scripts): gen-claude-md.ts — build-time CLAUDE.md codegen`

#### Task 20 — Wire definitions into `startAgentRun`
> See: [P4-Task-4.4](../../audit/plans/p4-agent-definitions.md#task-44----wire-definitions-into-startagentrun-f4-issue-03--04--05-high)

- [ ] Resolve `agent_definitions` by role in `startAgentRun`
- [ ] Pass `model`, `tools_allow`, `tools_deny`, `executor_uri` into `SpawnContext`
- [ ] Write test
- [ ] Commit: `feat(worker): startAgentRun resolves agent_definitions`

#### Task 21 — Tool annotations + titles + descriptions
> See: [P1-Task-1.5](../../audit/plans/p1-mcp-server.md#task-15----tool-annotations--titles--descriptions-f1-issue-08--24-high)

- [ ] Classify all 18 tools: readOnly / destructive / idempotent / openWorld
- [ ] Add `title` (≤ 60 chars) and `annotations` to every tool
- [ ] Rewrite descriptions in effect + returns + precondition format
- [ ] Commit: `feat(mcp): tool annotations, titles, effect-pattern descriptions`

#### Task 22 — Skills → directory form + scripted pattern
> See: [P2-Task-2.2](../../audit/plans/p2-plugin-integrations.md#task-22----restructure-skills-to-directory-form-f2-issue-01-critical)
> Also covers: [P3-Task-3.1](../../audit/plans/p3-skills.md#task-31----audit-existing-tool-references-f3-issue-03-critical) + [P3-Task-3.2](../../audit/plans/p3-skills.md#task-32----convert-skills-to-scripted-pattern-f3-issue-01-critical)

- [ ] Audit all skill tool references against `TOOL_REGISTRY` — fix mismatches
- [ ] Restructure 12 existing skills to `skills/<name>/SKILL.md` directory form
- [ ] Convert all 12 to scripted pattern (bash blocks, YAML frontmatter)
- [ ] Update installer
- [ ] Commit: `feat(skills): directory form + scripted pattern for all 12 skills`

#### Task 23 — Scope composition in recall
> See: [P5-Task-5.5](../../audit/plans/p5-memory-rag.md#task-55----scope-composition-in-recall-f5-issue-09-high)

- [ ] Add `scope` parameter to `recallMemory` + `recall_memory` MCP tool
- [ ] Implement session/project/workspace/global scope queries
- [ ] Write tests per scope level
- [ ] Commit: `feat(memory): scope composition — session/project/workspace/global`

#### Task 24 — Verified reranker wiring
> See: [P5-Task-5.6](../../audit/plans/p5-memory-rag.md#task-56----verified-reranker-wiring-f5-issue-05-high)

- [ ] Trace call path: `recallMemory` → reranker → result
- [ ] Ensure reranker scores are in final response
- [ ] Write relevance test
- [ ] Commit: `fix(memory): verified reranker wiring — scores propagated`

#### Task 25 — Schema ownership documentation
> See: [P6-Task-6.3](../../audit/plans/p6-modular-architecture.md#task-63----schema-ownership-f6-issue-10-critical)

- [ ] Audit which packages write to which tables
- [ ] Consolidate cross-package writes into owning package's service layer
- [ ] Document ownership in each package README
- [ ] Commit: `docs(arch): table ownership per package`

#### Task 26 — Zod config schemas
> See: [P6-Task-6.8](../../audit/plans/p6-modular-architecture.md#task-68----zod-config-schemas-f6-issue-05-medium)

- [ ] Write `FulcrumConfigSchema` in `packages/core/src/config.ts`
- [ ] Validate `.fulcrum.json` on `openDb()` with helpful errors
- [ ] Commit: `feat(core): Zod config schema for .fulcrum.json`

---

### Wave 5 — Features + Hardening

#### Task 27 — Fix Gemini hook wiring
> See: [P2-Task-2.4](../../audit/plans/p2-plugin-integrations.md#task-24----fix-gemini-hook-wiring-f2-issue-04-critical)

- [ ] Restructure `gemini-extension.json` to use `hooksFile` reference
- [ ] Create `agent-integration/gemini/hooks.json` with correct schema
- [ ] Update installer
- [ ] Commit: `fix(gemini): correct hook wiring via hooksFile`

#### Task 28 — Slash commands for Claude
> See: [P2-Task-2.5](../../audit/plans/p2-plugin-integrations.md#task-25----slash-commands-f2-issue-07-high)

- [ ] Create 4 slash command files: `fulcrum-status`, `fulcrum-task`,
  `fulcrum-memory`, `fulcrum-run`
- [ ] Installer copies to `~/.claude/commands/`
- [ ] Commit: `feat(commands): Fulcrum slash commands for Claude Code`

#### Task 29 — Hook output JSON mode
> See: [P2-Task-2.6](../../audit/plans/p2-plugin-integrations.md#task-26----hook-output-json-mode-f2-issue-12-high)

- [ ] Normalize all hook outputs to `{ continue: bool, ... }` JSON shape
- [ ] Exit code 2 for block, 0 for allow
- [ ] Write test
- [ ] Commit: `fix(hooks): normalized JSON output + exit code 2 for block`

#### Task 30 — Installer hardening
> See: [P2-Task-2.9](../../audit/plans/p2-plugin-integrations.md#task-29----installer-hardening-f2-issue-11-medium)

- [ ] Add idempotency + rollback to `install.ts`
- [ ] Add post-install MCP smoke test
- [ ] Commit: `fix(install): idempotency, rollback, smoke test`

#### Task 31 — Add 20 new skills
> See: [P3-Task-3.3](../../audit/plans/p3-skills.md#task-33----add-20-new-skills-f3-issue-02-critical)

- [ ] Priority order: `session-start`, `session-end`, `heartbeat`,
  `escalate`, `delegate-task`, `spawn-agent`, `team-launch`, `team-status`,
  `memory-compact`, `worktree-checkout`, `worktree-merge`, `create-plan`,
  `search-memory`, `write-decision`, `review-pr`, `policy-check`,
  `daily-standup`, `debug-session`, `run-workflow`, `list-agents`
- [ ] Each: directory form, scripted pattern, YAML frontmatter
- [ ] Commit per batch of 5

#### Task 32 — `outputSchema` + `structuredContent`
> See: [P1-Task-1.6](../../audit/plans/p1-mcp-server.md#task-16----outputschema--structuredcontent-f1-issue-10-high)

- [ ] Add `outputSchema` to all read tools
- [ ] Return `structuredContent` alongside text content
- [ ] Commit: `feat(mcp): outputSchema + structuredContent for read tools`

#### Task 33 — Resources capability
> See: [P1-Task-1.7](../../audit/plans/p1-mcp-server.md#task-17----resources-capability-f1-issue-04-high)

- [ ] Define URI scheme: `fulcrum://workspace/`, `fulcrum://task/`, etc.
- [ ] Register resource handlers
- [ ] Commit: `feat(mcp): resources capability`

#### Task 34 — Protocol conformance tests
> See: [P1-Task-1.11](../../audit/plans/p1-mcp-server.md#task-111----protocol-conformance-test-suite-f1-issue-07-critical)

- [ ] Write `packages/cli/src/mcp-server.test.ts` using SDK in-process transport
- [ ] Cover: initialize, tools/list, 18 tools happy path, invalid args, unknown method
- [ ] Commit: `test(mcp): protocol conformance suite`

#### Task 35 — Delete hardcoded `AGENT_PROFILES`
> See: [P4-Task-4.9](../../audit/plans/p4-agent-definitions.md#task-49----delete-hardcoded-agent_profiles-f4-issue-13-high)
> Precondition: Tasks 13 + 20

- [ ] Replace all `AGENT_PROFILES` references with DB queries
- [ ] Delete the hardcoded array
- [ ] Commit: `chore(agents): delete hardcoded AGENT_PROFILES`

#### Task 36 — Definition version + stability
> See: [P4-Task-4.5](../../audit/plans/p4-agent-definitions.md#task-45----definition-version--stability-f4-issue-09-high)

- [ ] Default `stability: 'experimental'`; auto-bump patch on update
- [ ] `fulcrum agent versions <role>` command
- [ ] Commit: `feat(agents): version + stability tracking`

#### Task 37 — TeamInstance heartbeat
> See: [P4-Task-4.6](../../audit/plans/p4-agent-definitions.md#task-46----teaminstance-heartbeat-f4-issue-14-high)

- [ ] Add 30s heartbeat timer in `TeamInstance`
- [ ] Write test
- [ ] Commit: `feat(teams): TeamInstance heartbeat every 30s`

#### Task 38 — Instruction prefixes + Matryoshka
> See: [P5-Task-5.7](../../audit/plans/p5-memory-rag.md#task-57----instruction-prefixes--matryoshka-truncation-f5-issue-12-high)

- [ ] Add `QUERY_PREFIX` + `DOC_PREFIX` to embedder
- [ ] Add Matryoshka truncation support
- [ ] Write test
- [ ] Commit: `feat(memory): instruction prefixes + Matryoshka truncation`

#### Task 39 — Tree-sitter AST chunker
> See: [P5-Task-5.8](../../audit/plans/p5-memory-rag.md#task-58----tree-sitter-ast-chunker-f5-issue-01-high)

- [ ] Install `web-tree-sitter` (WASM — avoids native compile issues)
- [ ] Write `ASTChunker` splitting at function/class/method boundaries
- [ ] Fallback to `SlidingWindowChunker` for unsupported languages
- [ ] Write tests with TS fixtures
- [ ] Commit: `feat(memory): tree-sitter AST chunker`

#### Task 40 — Plugin discovery
> See: [P6-Task-6.9](../../audit/plans/p6-modular-architecture.md#task-69----plugin-discovery-f6-issue-06-medium)

- [ ] Scan `node_modules` for packages with `"fulcrum"` manifest key
- [ ] Load hooks, skills, agents from each plugin
- [ ] Write fake-plugin test
- [ ] Commit: `feat(cli): plugin discovery via "fulcrum" manifest key`

---

### Wave 6 — Scale + Polish

#### Task 41 — Prompts + logging capabilities
> See: [P1-Task-1.8](../../audit/plans/p1-mcp-server.md#task-18----prompts-capability-f1-issue-11-medium) + [P1-Task-1.9](../../audit/plans/p1-mcp-server.md#task-19----logging-capability-f1-issue-13-medium)

- [ ] Register `build_cos_context` and `recall_memory` as MCP prompts
- [ ] Enable logging capability + `notifications/message` forwarding
- [ ] Commit: `feat(mcp): prompts + logging capabilities`

#### Task 42 — `recall_memory` real scores + description fix
> See: [P1-Task-1.10](../../audit/plans/p1-mcp-server.md#task-110----recall_memory-real-scores--max_chars-f1-issue-33-high) + [P5-Task-5.15](../../audit/plans/p5-memory-rag.md#task-515----fix-recall_memory-mcp-tool-description-f5-issue-14-low)

- [ ] Plumb reranker scores into `recall_memory` response
- [ ] Add `max_chars` parameter
- [ ] Rewrite tool description
- [ ] Commit: `fix(mcp): recall_memory — real scores, max_chars, correct description`

#### Task 43 — Codex + opencode integrations
> See: [P2-Task-2.7](../../audit/plans/p2-plugin-integrations.md#task-27----codex-integration-f2-issue-05-medium) + [P2-Task-2.8](../../audit/plans/p2-plugin-integrations.md#task-28----opencode-integration-f2-issue-06-medium)

- [ ] Create `agent-integration/codex/` with `AGENTS.md` + `mcp-config.json`
- [ ] Create `agent-integration/opencode/opencode.json`
- [ ] Add `setup:codex` + `setup:opencode` scripts
- [ ] Commit: `feat(integrations): Codex + opencode MCP configs`

#### Task 44 — A2A Agent Card
> See: [P4-Task-4.7](../../audit/plans/p4-agent-definitions.md#task-47----a2a-agent-card-f4-issue-06-medium)

- [ ] Write `buildA2ACard(def: AgentDefinition): A2AAgentCard`
- [ ] Auto-generate card on `create/update_agent_definition`
- [ ] Add `get_agent_card(role)` MCP tool
- [ ] Commit: `feat(agents): A2A Agent Card generation`

#### Task 45 — Separate code embedder
> See: [P5-Task-5.9](../../audit/plans/p5-memory-rag.md#task-59----separate-code-embedder-path-f5-issue-02-high)

- [ ] Add `content_type` detection + MIGRATION_027
- [ ] Use code embedder for code content
- [ ] Write test
- [ ] Commit: `feat(memory): separate code embedder + content_type column`

#### Task 46 — Aider-style repo-map
> See: [P5-Task-5.10](../../audit/plans/p5-memory-rag.md#task-510----aider-style-repo-map-f5-issue-04-medium)

- [ ] Build `buildRepoMap(dir)` using tree-sitter declarations
- [ ] Store snapshots tagged `type:repo-map`
- [ ] Add `mcp__fulcrum__build_repo_map` MCP tool
- [ ] Commit: `feat(memory): Aider-style repo-map`

#### Task 47 — Memory consolidation + decay
> See: [P5-Task-5.11](../../audit/plans/p5-memory-rag.md#task-511----consolidation--decay-jobs-f5-issue-06-medium)

- [ ] Implement decay (importance - 10%/week for low-importance memories)
- [ ] Implement consolidation (cluster by cosine sim > 0.92, merge)
- [ ] Run from janitor cycle weekly
- [ ] Write test
- [ ] Commit: `feat(memory): consolidation + decay jobs`

#### Task 48 — `fulcrum doctor` + zombie code pruning
> See: [P0-Task-0.9](../../audit/plans/p0-cross-cutting.md#task-09----fulcrum-doctor-f0-issue-13-medium) + [P0-Task-0.10](../../audit/plans/p0-cross-cutting.md#task-010----zombie-code-pruning-f0-issue-20-low)

- [ ] Add `fulcrum doctor` command with per-check ✅/❌ output
- [ ] Prune confirmed-dead tables: `artifact_contracts`, `review_targets`,
  `graph_entities`, `graph_edges`, `graph_episodes`
- [ ] Delete `buildWorldState` export if unused
- [ ] Commit: `feat(cli): fulcrum doctor + zombie code pruned`

#### Task 49 — Pagination + HTTP transport
> See: [P1-Task-1.12](../../audit/plans/p1-mcp-server.md#task-112----pagination-for-list-tools-f1-issue-21-medium) + [P1-Task-1.13](../../audit/plans/p1-mcp-server.md#task-113----http-transport-f1-issue-15--16-medium----phase-4)

- [ ] Add opaque cursor pagination to list tools
- [ ] Add `fulcrum serve mcp --http` with `StreamableHTTPServerTransport`
- [ ] Commit: `feat(mcp): pagination + HTTP transport`

#### Task 50 — Vocabulary standardisation
> See: [P0-Task-0.11](../../audit/plans/p0-cross-cutting.md#task-011----vocabulary-standardisation-f0-issue-11-low)

- [ ] Rename `AgentProfile` → `AgentRoleDescriptor`, `AgentProfileRow` → `AgentProfile`,
  `HandoffStatus` → `HandoffLifecycle`
- [ ] Run guard tests
- [ ] Commit: `refactor(types): vocabulary standardisation`

#### Task 51 — Thread `Db` port (incremental — high risk)
> See: [P6-Task-6.7](../../audit/plans/p6-modular-architecture.md#task-67----thread-db-port-f6-issue-11-high)

- [ ] PR 1: `@moabualruz/fulcrum-memory` write/recall accept `db` param (already does? verify)
- [ ] PR 2: `@moabualruz/fulcrum-core` tasks CRUD accepts `db` param
- [ ] PR 3: `@moabualruz/fulcrum-teams` scheduler accepts `db` param
- [ ] PR 4: CLI passes `db` explicitly; remove `getDb()` calls
- [ ] PR 5: Delete `getDb()` singleton
- [ ] Commit per PR: `refactor(core): thread Db port in <module>`

#### Task 52 — Remaining polish + docs
> Multiple small issues from P0, P3, P4, P6

- [ ] `docs/gap-analysis/` → `docs/history/` (F0-ISSUE-16)
- [ ] `AGENTS.md` at repo root (F4-ISSUE-12)
- [ ] Skill authoring guide at `docs/guides/skill-authoring.md` (F3-ISSUE-10)
- [ ] Pressure tests for all skills (F3-ISSUE-07)
- [ ] Barrel-file audit + READMEs for cli/worker (F6-ISSUE-14, -15)
- [ ] Unify `ulid`/`ulidx` (F6-ISSUE-16)
- [ ] Move policy enforcement to hook layer (F3-ISSUE-05, -06)
- [ ] Tool name validation on agent definition ingest (F4-ISSUE-15)
- [ ] Commit: `chore: polish, docs, barrel cleanup`

---

## Execution guidance

### Wave 1 is a prerequisite blocker

Tasks 1–4 (kernel extraction, dedup removal, tool catalogue, exports maps)
must all land before any Wave 2 work begins. They change the package graph.
Doing Wave 2+ on top of a broken Wave 1 causes cascading failures.

### MCP SDK migration (Task 5) is the single highest-leverage commit

Most of the F1 issues resolve automatically once the SDK is in place.
Don't start P1 Phase 2/3 tasks (annotations, resources, prompts) until
the SDK migration is tested end-to-end with `npx @modelcontextprotocol/inspector`.

### SessionStart hook (Task 11) is the single most impactful UX change

Without it, the entire L-series hook pipeline is a no-op. It's ~100 LOC but
changes what Fulcrum IS: from a toolkit that works in isolation to an agent
control plane that actually controls agents.

### The eval harness (Task 9) must come before RRF/reranker changes

Never change retrieval logic without a baseline measurement. Task 9 establishes
the baseline. Task 16 (RRF) must document before/after recall@5.

### `Db` port threading (Task 51) is the highest-risk task

It's a wide-scope refactor with no functional change. Do it last, do it
incrementally, and do it in 5 separate PRs with full test coverage at each step.

### Parallel tracks available

The following Wave 4+ tracks have no mutual dependencies and can be worked in
parallel sessions or parallel subagents:
- Track A: P1 tools/capabilities (Tasks 21, 32, 33, 34, 41, 42, 49)
- Track B: P2 integrations (Tasks 27, 28, 29, 30, 43)
- Track C: P3 skills (Tasks 22, 31)
- Track D: P5 memory (Tasks 23, 24, 38, 39, 45, 46, 47)
- Track E: P4 agent definitions (Tasks 36, 37, 44)
- Track F: P6 architecture (Tasks 25, 26, 40, 51, 52)

---

## Success metrics

| Metric | Current | Target |
|--------|---------|--------|
| E2E session test passing | ❌ (none) | ✅ |
| MCP protocol version | `2024-11-05` | `2025-11-25` |
| Tools with Zod validation | 0/18 | 18/18 |
| Tools with annotations | 0/18 | 18/18 |
| Hooks firing with real runId | 0% | 100% |
| Skills with scripted steps | 0/12 | 32/32 |
| Role MDs with frontmatter | 0/24 | 24/24 |
| agent_profiles callers | 0 | 3+ |
| recall@5 on eval harness | unmeasured | ≥ 0.70 |
| Packages with build step | 0/11 | 9/11 |
| Circular dependencies | 1 known | 0 |
| `getDb()` singleton callers | ~40 | 0 |

---

## Deeper Research (master level)

1. **Ordering risk for Wave 1** — Verify that `@fulcrum/kernel` extraction doesn't
   break the `pnpm onlyBuiltDependencies` list in root `package.json`. The native
   modules (`better-sqlite3`, `onnxruntime-node`, etc.) are in the root list;
   `@fulcrum/kernel` must not accidentally capture any of them.

2. **`@modelcontextprotocol/sdk` testing utilities** — Confirm the import path for
   `InMemoryTransport` before writing Task 34. It may be
   `@modelcontextprotocol/sdk/testing` or `@modelcontextprotocol/sdk/inMemory`.

3. **`web-tree-sitter` vs native `tree-sitter`** — For Task 39, the WASM variant
   avoids native compilation but may be 3–5x slower. For a developer tool (not a
   server hot path), this is usually acceptable. Benchmark both if tree-sitter
   becomes a performance bottleneck.

4. **Claude Code `SessionStart` hook stability** — Verify whether `CLAUDE_SESSION_ID`
   is guaranteed to be set in the `SessionStart` hook environment. If not, generate
   a UUID from `Date.now()` as fallback.

5. **Kuzu Cypher dialect** — Kuzu 0.x uses Cypher but has deviations from Neo4j
   Cypher. Before writing Task 8, check: does Kuzu support `CREATE (n:Label {...})`
   with property initialization? Or does it require `CREATE (n:Label)` then
   `SET n.prop = ...`?
