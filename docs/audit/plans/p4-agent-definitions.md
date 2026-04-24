# P4 — Agent Definitions

> Implements all issues from [F4 — Agent Definitions Audit](../findings/f4-agent-definitions.md).
> 15 issues. Core problem: `agent_profiles` table has zero production consumers;
> role MDs lack frontmatter; no A2A Agent Card; scheduler doesn't use definitions.

---

## Goal

Replace the dead `agent_profiles` table with a live `agent_definitions` system.
Migrate role Markdown files to Claude Code subagent format with full frontmatter.
Wire the scheduler to read definitions for model/tool constraints. Emit A2A Agent
Cards. Add typed output contracts.

---

## Issue index

| ID | Title | Severity | Priority |
|----|-------|----------|----------|
| F4-ISSUE-01 | Replace `agent_profiles` with `agent_definitions` schema | CRITICAL | P0 |
| F4-ISSUE-02 | Migrate role MDs to Claude Code subagent format + frontmatter | CRITICAL | P0 |
| F4-ISSUE-08 | Fix `orchestrator.md` drift vs `roles.ts` | CRITICAL | P0 |
| F4-ISSUE-13 | Delete hardcoded `AGENT_PROFILES` array after -02 lands | HIGH | P1 |
| F4-ISSUE-03 | Declarative `tools_allow` / `tools_deny` / `model` / `capabilities` | HIGH | P1 |
| F4-ISSUE-04 | Migrate `pi_profile` to `definition_id` + `executor_uri` | HIGH | P1 |
| F4-ISSUE-05 | Teach team scheduler about per-definition constraints | HIGH | P1 |
| F4-ISSUE-09 | Agent definition version + stability fields | HIGH | P1 |
| F4-ISSUE-14 | Teach `TeamInstance` to heartbeat | HIGH | P1 |
| F4-ISSUE-06 | Emit A2A Agent Card from each agent definition | MEDIUM | P2 |
| F4-ISSUE-07 | Typed output contracts on agent definitions | MEDIUM | P2 |
| F4-ISSUE-11 | Subteam recursion / ADK-style workflow agents | MEDIUM | P2 |
| F4-ISSUE-12 | Add `AGENTS.md` at repository root | LOW | P3 |
| F4-ISSUE-10 | Agent definition-level evals | LOW | P3 |
| F4-ISSUE-15 | Validate tool names in agent definitions against MCP surface | LOW | P3 |

---

## Database schema change

### New migration: `agent_definitions`

```sql
-- MIGRATION_026_AGENT_DEFINITIONS
CREATE TABLE agent_definitions (
  id           TEXT PRIMARY KEY,           -- ulid
  role         TEXT NOT NULL UNIQUE,       -- matches AgentRole enum
  display_name TEXT NOT NULL,
  description  TEXT NOT NULL,
  version      TEXT NOT NULL DEFAULT '0.1.0',
  stability    TEXT NOT NULL DEFAULT 'experimental'
               CHECK(stability IN ('stable','beta','experimental','deprecated')),
  system_prompt TEXT,
  model        TEXT,                        -- e.g. "claude-sonnet-4-6"
  provider     TEXT DEFAULT 'anthropic',
  tools_allow  TEXT,                        -- JSON array of tool names, null = all
  tools_deny   TEXT,                        -- JSON array of tool names, null = none
  capabilities TEXT,                        -- JSON array of capability strings
  output_schema TEXT,                       -- JSON Schema for output contract
  executor_uri TEXT,                        -- e.g. "claude-code://", "pi://", "subprocess://"
  a2a_card     TEXT,                        -- JSON A2A Agent Card
  eval_suites  TEXT,                        -- JSON array of eval suite IDs
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX agent_definitions_role ON agent_definitions(role);
```

### Deprecate `agent_profiles` (no deletion until -13 lands)

Add a `deprecated_at` column; existing rows remain but new writes go to
`agent_definitions`. After -02 and -13, drop the table.

---

## Task breakdown

### Task 4.1 — `agent_definitions` schema + migration (F4-ISSUE-01) [CRITICAL]

**Files:**
- Modify: `packages/core/src/migrations.ts` — add MIGRATION_026
- Modify: `packages/core/src/schema.ts` — add `AgentDefinition` type
- Modify: `packages/cli/src/index.ts` — add CRUD MCP tools for `agent_definitions`

**Steps:**

- [ ] Add migration SQL above to `migrations.ts`

- [ ] Add TypeScript type:
  ```ts
  export interface AgentDefinition {
    id: string;
    role: AgentRole;
    display_name: string;
    description: string;
    version: string;
    stability: 'stable' | 'beta' | 'experimental' | 'deprecated';
    system_prompt: string | null;
    model: string | null;
    provider: string;
    tools_allow: string[] | null;
    tools_deny: string[] | null;
    capabilities: string[];
    output_schema: Record<string, unknown> | null;
    executor_uri: string | null;
    a2a_card: Record<string, unknown> | null;
    created_at: number;
    updated_at: number;
  }
  ```

- [ ] Add MCP tools:
  - `create_agent_definition(role, display_name, description, ...)`
  - `get_agent_definition(role)`
  - `update_agent_definition(role, ...changes)`
  - `list_agent_definitions(stability?)`

- [ ] Write migration test

- [ ] Commit: `feat(core): agent_definitions schema — MIGRATION_026`

---

### Task 4.2 — Migrate role MDs to subagent format (F4-ISSUE-02) [CRITICAL]

**Files:**
- Modify: all 24 files in `agent-integration/claude/agents/`
  (created by P2-Task-2.3)

**Frontmatter schema:**

```yaml
---
name: fulcrum-software-engineer
description: >
  Writes, tests, and commits code for Fulcrum tasks. Runs in an isolated
  worktree. Calls start_agent_run on task pickup and complete_agent_run
  on finish.
model: claude-sonnet-4-6
tools:
  allowed:
    - mcp__fulcrum__start_agent_run
    - mcp__fulcrum__complete_agent_run
    - mcp__fulcrum__heartbeat_agent_run
    - mcp__fulcrum__recall_memory
    - mcp__fulcrum__write_memory
    - mcp__fulcrum__update_task
  denied:
    - mcp__fulcrum__invoke_team
    - mcp__fulcrum__create_team_template
capabilities:
  - write_code
  - edit_files
  - run_tests
  - commit_changes
---
```

**Steps:**

- [ ] For each of the 24 roles, determine:
  - Which MCP tools it should be allowed (from `canWriteCode`, `canEditFiles`, etc. helpers)
  - Which MCP tools it should be denied
  - Which model to use (default `claude-sonnet-4-6`, CoS uses `claude-opus-4-6`)

- [ ] Update each role's subagent MD with complete frontmatter

- [ ] Add CI test: parse frontmatter from all 24 files, assert no schema errors

- [ ] Commit: `feat(agents): complete frontmatter for all 24 role subagent MDs`

---

### Task 4.3 — Fix `orchestrator.md` drift (F4-ISSUE-08) [CRITICAL]

**Current issue:** `agent-integration/claude/agents/orchestrator.md` describes
a role that doesn't match `AgentRole.orchestrator` in `roles.ts`.

**Steps:**

- [ ] Read `orchestrator.md` and `roles.ts` side-by-side

- [ ] Option A: Update `orchestrator.md` to match `roles.ts` exactly
  (recommended — source of truth is the code)

- [ ] If `roles.ts` is wrong, update it and add a migration CHECK constraint fix

- [ ] Commit: `fix(agents): sync orchestrator.md with roles.ts`

---

### Task 4.4 — Wire definitions into `startAgentRun` (F4-ISSUE-03, -04, -05) [HIGH]

**Files:**
- Modify: `packages/worker/src/lifecycle.ts`
- Modify: `packages/teams/src/scheduler.ts`

**Steps:**

- [ ] In `startAgentRun`:
  ```ts
  const def = db.prepare('SELECT * FROM agent_definitions WHERE role = ?').get(role);
  if (def) {
    ctx.model       = def.model ?? ctx.model;
    ctx.toolsAllow  = JSON.parse(def.tools_allow ?? 'null');
    ctx.toolsDeny   = JSON.parse(def.tools_deny ?? 'null');
    ctx.systemPrompt = def.system_prompt ?? ctx.systemPrompt;
    ctx.executorUri = def.executor_uri ?? ctx.executorUri;
  }
  ```

- [ ] In `scheduler.ts` team slot assignment: check `def.capabilities` before
  assigning a role to a slot that requires specific capabilities

- [ ] Write test: create definition with `tools_deny: ['invoke_team']`, assert
  `chief_of_staff` is blocked from calling invoke_team when it shouldn't be

- [ ] Commit: `feat(worker): startAgentRun resolves agent_definitions — model, tools, executor_uri`

---

### Task 4.5 — Definition version + stability (F4-ISSUE-09) [HIGH]

**Steps:**

- [ ] In the `create_agent_definition` MCP tool, default `stability` to
  `'experimental'` for new definitions

- [ ] In `update_agent_definition`, auto-bump patch version on each update
  (or accept explicit version)

- [ ] Add CLI command: `fulcrum agent versions <role>` — show version history

- [ ] Commit: `feat(agents): version + stability tracking in agent_definitions`

---

### Task 4.6 — TeamInstance heartbeat (F4-ISSUE-14) [HIGH]

**Files:**
- Modify: `packages/teams/src/TeamInstance.ts`

**Steps:**

- [ ] Add heartbeat interval in `TeamInstance`:
  ```ts
  this.heartbeatTimer = setInterval(() => {
    if (this.runId) {
      db.prepare('UPDATE agent_runs SET heartbeat_at = unixepoch() WHERE id = ?')
        .run(this.runId);
    }
  }, 30_000);
  ```

- [ ] Clear interval on `stop()` / `complete()`

- [ ] Write test: assert `heartbeat_at` updates during long-running team

- [ ] Commit: `feat(teams): TeamInstance heartbeat every 30s`

---

### Task 4.7 — A2A Agent Card (F4-ISSUE-06) [MEDIUM]

**Files:**
- Create: `packages/core/src/a2a-card.ts`
- Modify: `packages/cli/src/index.ts` — add `get_agent_card` MCP tool

**A2A Agent Card schema (per R4 §A2A):**

```ts
interface A2AAgentCard {
  id: string;           // "fulcrum/<role>"
  name: string;
  description: string;
  version: string;
  capabilities: {
    streaming: boolean;
    push_notifications: boolean;
    state_transition_history: boolean;
  };
  input_modes: string[];  // ["text", "task"]
  output_modes: string[];
  endpoints: {
    type: "mcp" | "http";
    url?: string;
    tool_name?: string;
  }[];
}
```

**Steps:**

- [ ] Write `buildA2ACard(def: AgentDefinition): A2AAgentCard`

- [ ] On `create_agent_definition` or `update_agent_definition`, auto-generate
  the card and store in `def.a2a_card`

- [ ] Add `get_agent_card(role: string)` MCP tool

- [ ] Commit: `feat(agents): A2A Agent Card generation from agent_definitions`

---

### Task 4.8 — Typed output contracts (F4-ISSUE-07) [MEDIUM]

**Steps:**

- [ ] For each role that has a predictable output shape (e.g., `code_reviewer`
  outputs structured review JSON, `qa_engineer` outputs test results), define
  a JSON Schema and store in `def.output_schema`

- [ ] The `complete_agent_run` MCP tool should optionally validate `artifact_paths`
  against the output schema if one exists

- [ ] Commit: `feat(agents): typed output contracts — output_schema field`

---

### Task 4.9 — Delete hardcoded `AGENT_PROFILES` (F4-ISSUE-13) [HIGH]

**Precondition:** Tasks 4.2 and 4.4 must be complete.

**Steps:**

- [ ] Grep for `AGENT_PROFILES` in all source files

- [ ] Replace each reference with a DB query against `agent_definitions`

- [ ] Delete the hardcoded array

- [ ] Confirm tests still pass

- [ ] Commit: `chore(agents): delete hardcoded AGENT_PROFILES — reads from DB`

---

### Task 4.10 — `AGENTS.md` at repository root (F4-ISSUE-12) [LOW]

- [ ] Write `AGENTS.md` describing Fulcrum's agent system, roles, and how to
  use agent-specific instructions

- [ ] Commit: `docs: AGENTS.md — agent system documentation at repo root`

---

### Task 4.11 — Tool name validation on ingest (F4-ISSUE-15) [LOW]

- [ ] On `create_agent_definition` or `update_agent_definition`, validate that
  all names in `tools_allow` and `tools_deny` exist in the MCP tool registry

- [ ] Return a validation error if unknown tool names are provided

- [ ] Commit: `feat(agents): validate tools_allow/deny against MCP registry on ingest`

---

## Deeper Research

1. **A2A Agent Card format** — R4 §A2A and the official Google A2A spec at
   `google.github.io/A2A`. The exact field names may have evolved since R4 was written.
   Particularly verify: `capabilities`, `endpoints`, `input_modes`, `output_modes`.

2. **Claude Code subagent frontmatter schema** — confirm that `tools.allowed` and
   `tools.denied` are real frontmatter fields (vs prose instructions). The frontmatter
   may only support `tools: [list]` (allowlist) with no denylist. Source: Claude Code
   subagent docs.

3. **`executor_uri` scheme for PI agents** — the PI agent uses a custom executor.
   Confirm the URI scheme (e.g., `pi://`, `pi+mcp://`) with the PI codebase's
   `@mariozechner/pi-coding-agent` package. This is a peer dependency.

4. **Version bump strategy** — should `agent_definitions.version` follow SemVer?
   Or is a simple integer revision count sufficient? Consider what clients
   (Claude Code, team scheduler) need from the version field.

---

## Acceptance criteria

- `MIGRATION_026` runs cleanly on existing databases
- All 24 roles have entries in `agent_definitions` after install
- `startAgentRun` reads `model`, `tools_allow`, `tools_deny` from DB
- `list_agent_definitions` MCP tool returns all 24 roles
- `get_agent_card` returns valid A2A JSON for each role
- Hardcoded `AGENT_PROFILES` array deleted
- All 24 role MDs have valid YAML frontmatter
- `pnpm test --filter core` passes with migration and type tests
