# Plan: Skills Files & Agent Definitions

**Gaps addressed**: GAP-SKILLS-1 through GAP-SKILLS-9, GAP-AGENTDEF-1 through GAP-AGENTDEF-10  
**Files**: `agent-integration/skills/*/SKILL.md`, `packages/core/src/a2a-card.ts`, `packages/monitor/src/agent-card.ts`, `packages/core/src/db/migrations/m032b.ts`, `packages/core/src/db/migrations/m031.ts`, `packages/core/src/types.ts`

---

## Step 1 — Critical: Install skills where Claude Code reads them (GAP-SKILLS-9)

Add to the project `package.json` (root) scripts:

```json
"scripts": {
  "install-skills": "node scripts/install-skills.mjs"
}
```

Create `scripts/install-skills.mjs`:
```javascript
import { mkdirSync, symlinkSync, existsSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { homedir } from 'os'

const src = resolve('agent-integration/skills')
const globalDest = join(homedir(), '.claude', 'skills', 'fulcrum')
const projectDest = join('.claude', 'skills', 'fulcrum')

for (const dest of [globalDest, projectDest]) {
  mkdirSync(join(dest, '..'), { recursive: true })
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
  symlinkSync(src, dest, 'dir')
  console.log(`Linked ${src} → ${dest}`)
}
```

Document in README and in the onboarding guide.

---

## Step 2 — Critical: Populate system_prompt for core roles (GAP-SKILLS-4)

Create `packages/core/src/db/migrations/m041.ts` — patch the 3 most critical roles:

```typescript
export function runM041(db: Database.Database): void {
  const updates = [
    {
      role: 'chief_of_staff',
      system_prompt: `You are the Chief of Staff for Fulcrum. You orchestrate work — you NEVER write code, edit files, run builds, or commit changes directly. Your sole tool for getting work done is delegating to specialist L2 roles via agent runs and teams. Every task you spawn must have a tracked task_id. You must call mcp__fulcrum__start_agent_run at the start of every session. Respond using the artifact-first brief format: Status, Work Completed, Next Steps, Risks/Blockers.`
    },
    {
      role: 'integration_worker',
      system_prompt: `You are the Integration Worker. You are the ONLY role authorized to merge worktrees, resolve conflicts, and perform git merges. Before merging, verify: (1) the PR has a code_reviewer approval, (2) there are no blocked runs in the worktree, (3) all tests pass. Never merge without explicit merge queue authorization.`
    },
    {
      role: 'security_reviewer',
      system_prompt: `You are the Security Reviewer. You review code for vulnerabilities and policy violations — you never approve your own code. Your output is a structured security review with severity-labeled findings. You check: OWASP Top 10, secret exposure, injection vulnerabilities, authentication gaps, and policy violations. Report Critical findings immediately via block_agent_run.`
    },
  ]
  // ... INSERT OR REPLACE into agent_definitions for each update
}
```

Wire `runM041` into `packages/core/src/db/migrations/index.ts`.

---

## Step 3 — Major: Add `allowed-tools` to all skill frontmatter (GAP-SKILLS-3)

Audit each of the 20 skill files and classify:

**Read-only advisory** (no tools): `chief-of-staff-response-format`, `secret-hygiene`, `invoke-team-only-from-cos`, `integration-worker-merge-gate`
→ Add `allowed-tools: []` (or omit field with documented convention)

**MCP-read skills**: `recall-before-writing`, `workspace-status-on-session-start`, `session-start`
→ `allowed-tools: mcp__fulcrum__recall_memory, mcp__fulcrum__get_workspace_status`

**MCP-write skills**: `complete-agent-run`, `start-every-task`, `heartbeat-during-long-operations`, `block-when-stuck`, `escalate`, `spawn-agent`, `team-launch`
→ List exact MCP tool names

---

## Step 4 — Major: Add invocation control to skills (GAP-SKILLS-6)

Classify and add `user-invocable` / `disable-model-invocation`:

- `chief-of-staff-response-format`, `secret-hygiene`, `invoke-team-only-from-cos`: add `user-invocable: false`
- `complete-agent-run`, `team-launch`: add `disable-model-invocation: true`
- All others: leave default (both can invoke)

---

## Step 5 — Major: Consolidate A2A card builders (GAP-AGENTDEF-3)

Replace the split builder architecture with one canonical builder in `packages/core/src/a2a-card.ts`.

The unified `buildA2ACard(def, options)` must include:
- `protocolVersion: "0.3.0"` (GAP-AGENTDEF-1)
- `securitySchemes: { bearer: { type: "http", scheme: "bearer" } }` (GAP-AGENTDEF-2)
- `iconUrl` field (optional, GAP-AGENTDEF-9)
- `examples` field on `A2ASkill` (GAP-AGENTDEF-4)
- Proper MIME types (`text/plain`, `application/json`)
- `provider` object

Delete `packages/monitor/src/agent-card.ts` and update the monitor to call `buildA2ACard` from core for each definition, then assemble the workspace-level aggregate card.

---

## Step 6 — Major: Fix UNIQUE constraint (GAP-AGENTDEF-10)

Create `packages/core/src/db/migrations/m042.ts`:

```typescript
export function runM042(db: Database.Database): void {
  // SQLite doesn't support ALTER TABLE DROP CONSTRAINT
  // Must recreate the table
  db.exec(`
    CREATE TABLE agent_definitions_new AS SELECT * FROM agent_definitions;
    DROP TABLE agent_definitions;
    -- Recreate with (workspace_id, role) UNIQUE
    CREATE TABLE agent_definitions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL DEFAULT 'default',
      role TEXT NOT NULL,
      ...
      UNIQUE(workspace_id, role)
    );
    INSERT INTO agent_definitions SELECT * FROM agent_definitions_new;
    DROP TABLE agent_definitions_new;
  `)
}
```

Update `createAgentDefinition` in `agent-definitions.ts` — the application-level `workspace_id` check already does the right thing; only the DB constraint needs fixing.

---

## Step 7 — Major: Add input/output contracts to key skills (GAP-SKILLS-2)

Add `## Contract` section to the 5 most-used skills:

`start-every-task/SKILL.md`:
```markdown
## Contract
**Input**: `run_id` from current context (or auto-created), `workspace_id`, `agent_role`
**Output**: `run_id` stored in session context; `task.status` set to `running`
```

`complete-agent-run/SKILL.md`, `block-when-stuck/SKILL.md`, `spawn-agent/SKILL.md`, `team-launch/SKILL.md`.

---

## Step 8 — Major: Document capabilities ↔ enforcement connection (GAP-AGENTDEF-6)

Add a comment block at the top of `packages/core/src/roles.ts` and `packages/core/src/agent-definitions.ts`:

```typescript
/**
 * IMPORTANT: AgentDefinition.capabilities[] is A2A/discovery metadata only.
 * It does NOT affect runtime enforcement. Runtime capability enforcement
 * is in packages/core/src/roles.ts (roleCapabilities function).
 * 
 * To make capabilities drive enforcement, see plan-skills-agents.md step 8b.
 */
```

Include a note in the audit about whether to wire them together (requires roadmap decision).

---

## Step 9 — Minor: Skill file versioning (GAP-SKILLS-5)

Add `metadata.version: "1.0.0"` to all skill frontmatter headers. Add a CI lint step:

```typescript
// scripts/lint-skills.mjs — verify all SKILL.md have metadata.version set
```

---

## Acceptance Criteria

- [ ] `npm run install-skills` creates symlinks in `~/.claude/skills/fulcrum/` and `.claude/skills/fulcrum/`
- [ ] Migration m041 seeds system_prompt for CoS, integration_worker, security_reviewer
- [ ] All 20 skill files have `allowed-tools` frontmatter
- [ ] Advisory skills have `user-invocable: false`, write skills have `disable-model-invocation: true`
- [ ] Single `buildA2ACard` in core includes `protocolVersion`, `securitySchemes`, MIME types
- [ ] `agent_definitions` has `UNIQUE(workspace_id, role)` constraint
- [ ] All existing tests pass; new migration tests added
