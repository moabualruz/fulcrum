# P3 — Skills Rebuild

> Implements all issues from [F3 — Skills Audit](../findings/f3-skills.md).
> 11 issues. The core problem: 100% prose skills, 0% scripted, 7/13 reference
> non-existent MCP tools. Rebuild around the scripted skill pattern.

---

## Goal

Rebuild Fulcrum's skill library so that procedural steps are executable scripts,
not prose. Ship as a Claude Code plugin. Add 20+ new skills for missing domains.
Align skill recommendations with the actual MCP tool surface. Fix tool references.

---

## Issue index

| ID | Title | Severity | Priority |
|----|-------|----------|----------|
| F3-ISSUE-01 | Rebuild skill library around scripted pattern | CRITICAL | P0 |
| F3-ISSUE-02 | Ship 20+ new skills for missing domains | CRITICAL | P0 |
| F3-ISSUE-03 | Audit MCP tool surface against skill recommendations | CRITICAL | P0 |
| F3-ISSUE-04 | Ship skills as a Claude Code plugin | HIGH | P1 |
| F3-ISSUE-05 | Move chief-of-staff out of skills → system prompt/context | HIGH | P1 |
| F3-ISSUE-06 | Move policy enforcement out of skills → hook layer | HIGH | P1 |
| F3-ISSUE-07 | Add pressure tests for every skill | MEDIUM | P2 |
| F3-ISSUE-08 | Source-drive every procedural claim | MEDIUM | P2 |
| F3-ISSUE-09 | Add `disable-model-invocation` / `paths` / `triggers` to skill headers | MEDIUM | P2 |
| F3-ISSUE-10 | Document skill-authoring guide for Fulcrum | LOW | P3 |
| F3-ISSUE-11 | Delete `index.md` as a skill; keep as README | LOW | P3 |

---

## Skill taxonomy (target state)

### Existing skills to retrofit (scripted + fix tool refs)

| Skill | Status | Issues |
|-------|--------|--------|
| `start-task` | Fix tool refs: `start_agent_run` exists | Needs scripted steps |
| `complete-task` | Fix: `complete_agent_run` exists | Needs scripted steps |
| `block-task` | Fix: `block_agent_run` exists | Needs scripted steps |
| `recall-context` | Fix: `recall_memory` exists | Tool ref OK |
| `write-memory` | Fix: `write_memory` exists | Tool ref OK |
| `invoke-team` | Fix: `invoke_team` exists | Needs scripted steps |
| `create-task` | OK | Add scripted steps |
| `update-task` | OK | Add scripted steps |
| `build-cos-context` | OK | Already prose-only — add scripted |
| `check-wip` | Fix: `get_workspace_status` | Tool ref OK |
| `list-tasks` | OK | Add scripted steps |
| `get-run-status` | OK | Add scripted steps |
| `chief-of-staff` | MOVE OUT → F3-ISSUE-05 | |

### New skills to add (F3-ISSUE-02)

- `session-start` — call `start_agent_run`, stash run_id
- `session-end` — call `complete_agent_run` with summary
- `heartbeat` — call `heartbeat_agent_run` while doing long work
- `spawn-agent` — invoke a child agent via `start_agent_run` with a role
- `delegate-task` — create a subtask and assign it to a role
- `review-pr` — QA/reviewer workflow using Fulcrum tasks
- `memory-compact` — summarise current context, write to memory
- `team-launch` — `invoke_team` with template + goal
- `team-status` — poll `list_team_instances` until done
- `escalate` — `block_agent_run` with escalation reason
- `worktree-checkout` — allocate worktree for code work
- `worktree-merge` — merge worktree back to base
- `create-plan` — create a planning task and populate subtasks
- `daily-standup` — `build_cos_context` formatted as standup report
- `policy-check` — validate action against WIP limits before proceeding
- `search-memory` — `recall_memory` with query construction guidance
- `write-decision` — write an architectural decision record to memory
- `debug-session` — attach run tracing to current session
- `run-workflow` — invoke workflow via `invoke_team` with workflow template
- `list-agents` — `list_agent_profiles` + format output

---

## Task breakdown

### Task 3.1 — Audit existing tool references (F3-ISSUE-03) [CRITICAL]

**Files:**
- Modify: all 12 skill files in `agent-integration/claude/skills/`

**Steps:**

- [ ] For each skill, grep for tool name references (e.g., `list_tasks`,
  `start_agent_run`, etc.)

- [ ] Cross-check each referenced tool name against the actual tool list from
  `packages/cli/src/index.ts` (`TOOL_REGISTRY` after Task 1.1)

- [ ] For each mismatch:
  - Wrong name: fix to actual name
  - Tool doesn't exist: remove reference or mark `TODO: add tool`

- [ ] Commit: `fix(skills): correct tool references to match actual MCP surface`

---

### Task 3.2 — Convert skills to scripted pattern (F3-ISSUE-01) [CRITICAL]

**Scripted skill anatomy:**

```markdown
---
name: start-task
description: Start a Fulcrum task — registers an agent run and stashes the run_id
triggers: ["starting a task", "begin work", "pick up task"]
paths: ["**/*.ts", "**/*.md"]
---

## When to use

Use this skill before beginning work on any Fulcrum-tracked task.

## Steps

```bash
#!/usr/bin/env bash
# Step 1: Get current workspace info
WORKSPACE_INFO=$(fulcrum workspace status --json)
WORKSPACE_ID=$(echo "$WORKSPACE_INFO" | jq -r '.workspace_id')
PROJECT_ID=$(echo "$WORKSPACE_INFO" | jq -r '.project_id')

# Step 2: Start the agent run
RUN=$(fulcrum run start --role software_engineer --task-id "$TASK_ID" --json)
RUN_ID=$(echo "$RUN" | jq -r '.run_id')

# Step 3: Stash run_id for session
echo "$RUN_ID" > .fulcrum/current-run-id
echo "Run started: $RUN_ID"
```

## MCP tool reference

Calls: `mcp__fulcrum__start_agent_run`
```

**Steps:**

- [ ] For each of the 12 existing skills, rewrite to scripted pattern:
  1. YAML frontmatter with `name`, `description`, `triggers`, `paths`
  2. `## When to use` section (prose — one paragraph)
  3. `## Steps` section with executable bash block
  4. `## MCP tool reference` table
  5. `## Outputs` section describing what the script produces

- [ ] Skills that reference multiple tools: use a multi-step bash script
  with error handling

- [ ] Commit per skill or one commit for all 12:
  `feat(skills): scripted pattern conversion — all 12 skills`

---

### Task 3.3 — Add 20 new skills (F3-ISSUE-02) [CRITICAL]

**Steps:**

For each new skill in the taxonomy above:

- [ ] Create `agent-integration/claude/skills/<skill-name>/SKILL.md`
  (directory form from Task 2.2)

- [ ] Follow the scripted pattern from Task 3.2

- [ ] Key priority order:
  1. `session-start` and `session-end` (ties into P0/P2)
  2. `heartbeat` (used in long-running tasks)
  3. `escalate` and `delegate-task`
  4. `spawn-agent` and `team-launch`
  5. Rest in any order

- [ ] Commit after every 5 skills:
  `feat(skills): add session-start, session-end, heartbeat, escalate, delegate-task`

---

### Task 3.4 — Move chief-of-staff out of skills (F3-ISSUE-05) [HIGH]

**Current:** `agent-integration/claude/skills/chief-of-staff.md` — large skill
document with CoS workflow, team orchestration, role dispatch.

**Target:** CoS instructions should live in:
1. The `chief_of_staff` role's subagent MD (`agent-integration/claude/agents/chief-of-staff.md`)
2. The `CLAUDE.md` context file for CoS-specific guidance
3. Individual operational skills (team-launch, build-cos-context, etc.)

**Steps:**

- [ ] Read `chief-of-staff.md` and identify which sections are:
  - Agent identity/capabilities → move to subagent MD
  - Operational procedures → convert to separate skills
  - Tool usage guides → move to CLAUDE.md

- [ ] Delete `chief-of-staff.md` skill

- [ ] Ensure the subagent MD (`agents/chief-of-staff.md`) has complete CoS
  instructions

- [ ] Commit: `refactor(skills): extract chief-of-staff skill → subagent MD + operational skills`

---

### Task 3.5 — Move policy enforcement to hooks (F3-ISSUE-06) [HIGH]

**Current:** policy enforcement instructions in skill prose
**Target:** `PreToolUse` hook performs WIP limit checks; skills just document behaviour

**Steps:**

- [ ] Identify policy checks currently in skill prose:
  - WIP limit checks
  - Role boundary checks (L1 vs L2)
  - Team-invoke guard

- [ ] Move these checks into the `fulcrum hook claude pre` handler
  (already partially done — verify it's complete)

- [ ] Update skills to remove duplicated policy prose; add a single line
  `"Policy is enforced automatically by the PreToolUse hook."`

- [ ] Commit: `refactor(skills): move policy enforcement to hook layer`

---

### Task 3.6 — Pressure tests for all skills (F3-ISSUE-07) [MEDIUM]

**Files:**
- Create: `agent-integration/claude/skills/tests/` directory
- Create: one test file per skill

**Steps:**

- [ ] Write a skill test framework: given a skill and a scenario description,
  assert that the skill's steps produce the expected tool calls and outputs

- [ ] Write at least one pressure test per skill covering:
  - Happy path (normal execution)
  - Missing required parameter (should error gracefully)
  - Wrong role using skill (should be blocked or warned)

- [ ] Commit: `test(skills): pressure tests for all 32 skills`

---

### Task 3.7 — YAML frontmatter fields (F3-ISSUE-09) [MEDIUM]

**Steps:**

- [ ] For every skill, add to frontmatter if not present:
  ```yaml
  disable-model-invocation: false  # set true for pure-script skills
  paths: ["**"]                     # file patterns that trigger skill context
  triggers: ["<natural language phrase>"]
  ```

- [ ] Commit: `feat(skills): disable-model-invocation + paths + triggers in frontmatter`

---

### Task 3.8 — Skill authoring guide (F3-ISSUE-10) [LOW]

**Files:**
- Create: `docs/guides/skill-authoring.md`

**Steps:**

- [ ] Document:
  1. Skill file structure (frontmatter fields, sections, scripted blocks)
  2. How to reference MCP tools
  3. How skills are discovered by Claude Code
  4. How to write pressure tests
  5. When to use scripted vs prose

- [ ] Commit: `docs(guides): skill authoring guide`

---

### Task 3.9 — Delete index.md as skill (F3-ISSUE-11) [LOW]

- [ ] Rename `agent-integration/claude/skills/index.md` → `README.md`
  (same content, but not discoverable as a skill)

- [ ] Commit: `fix(skills): rename index.md → README.md`

---

## Deeper Research

1. **Claude Code skill discovery** — exactly which YAML frontmatter fields are
   supported. Confirmed from R3 §2: `name`, `description`, `triggers`, `paths`,
   `disable-model-invocation`. Verify `triggers` field name hasn't changed in
   newer Claude Code versions.

2. **Scripted skill execution model** — when Claude Code executes a skill's
   bash block, what environment is it in? Does it have access to `CLAUDE_SESSION_ID`?
   Can it call `fulcrum` CLI directly? Confirm from R3 §3.

3. **Skill plugin packaging** — F3-ISSUE-04 says "ship skills as Claude Code plugin."
   Determine if this means a `~/.claude/plugins/<name>/` structure or an npm package.
   R2 §3 and official Claude Code plugin docs are the authoritative sources.

4. **20-skill count** — the target state table lists 20 new skills. Before committing
   to all 20, verify which ones map to actual frequently-used workflows. The session
   lifecycle skills (session-start, session-end, heartbeat) are clearly needed;
   more exotic ones (run-workflow, debug-session) may be deferred to P2/P3.

---

## Acceptance criteria

- All skills use directory form (`skills/<name>/SKILL.md`)
- All skills have YAML frontmatter with `name`, `description`, `triggers`
- All skills have at least one executable bash block in a `## Steps` section
- Zero skill files reference non-existent MCP tool names
- `chief-of-staff.md` skill deleted; content migrated to subagent MD
- 20+ new skills added
- Skill authoring guide exists at `docs/guides/skill-authoring.md`
- `pnpm setup:claude` installs all skills to `~/.claude/skills/`
