# P2 — Plugin Integrations Fix

> Implements all issues from [F2 — Plugin Integrations Audit](../findings/f2-plugin-integrations.md).
> 12 issues. Covers Claude Code hooks/skills/subagents, Gemini extension wiring,
> Codex/opencode integrations, SessionStart/Stop hooks, and installer hardening.

---

## Goal

Make all agent integrations (Claude, Gemini, PI, Codex, opencode) correctly
wired according to the standards established in R2. Fix silently-broken Gemini
hooks, add missing lifecycle hooks (SessionStart, Stop, PreCompact), ship
Claude Code subagent files for all 24 roles, add slash commands, and harden
the installer.

---

## Issue index

| ID | Title | Severity | Priority |
|----|-------|----------|----------|
| F2-ISSUE-08 | Add SessionStart, SessionStop, PreCompact, UserPromptSubmit hooks | CRITICAL | P0 |
| F2-ISSUE-01 | Restructure skills to directory-form with `SKILL.md` | CRITICAL | P0 |
| F2-ISSUE-02 | Ship Claude Code subagent files for all 24 roles | CRITICAL | P0 |
| F2-ISSUE-04 | Fix Gemini hook wiring (broken schema) | CRITICAL | P0 |
| F2-ISSUE-03 | Convert Claude Code integration into a plugin | HIGH | P1 |
| F2-ISSUE-07 | Slash commands for Claude / Gemini / opencode | HIGH | P1 |
| F2-ISSUE-09 | Unified context-file generator | HIGH | P1 |
| F2-ISSUE-12 | Hook output JSON mode + normalized shape | HIGH | P1 |
| F2-ISSUE-05 | Ship Codex integration | MEDIUM | P2 |
| F2-ISSUE-06 | Ship opencode integration | MEDIUM | P2 |
| F2-ISSUE-10 | PI cockpit polish | MEDIUM | P2 |
| F2-ISSUE-11 | Installer hardening | MEDIUM | P2 |

---

## Task breakdown

### Task 2.1 — Add lifecycle hooks: SessionStart, Stop, PreCompact (F2-ISSUE-08) [CRITICAL]

This task overlaps with P0-Task-0.1. In P0, we add the TypeScript scripts.
Here we ensure they're registered correctly in the settings file.

**Files:**
- Modify: `agent-integration/claude/settings-hooks-snippet.json`
- Modify: `agent-integration/install.ts`

**Steps:**

- [ ] Update `settings-hooks-snippet.json` to include all required hooks:
  ```json
  {
    "hooks": {
      "SessionStart": [{"matcher": "*", "hooks": [{"type": "command", "command": "fulcrum hook claude session-start"}]}],
      "Stop": [{"matcher": "*", "hooks": [{"type": "command", "command": "fulcrum hook claude session-stop"}]}],
      "PreToolUse": [{"matcher": "*", "hooks": [{"type": "command", "command": "fulcrum hook claude pre"}]}],
      "PostToolUse": [{"matcher": "*", "hooks": [{"type": "command", "command": "fulcrum hook claude post"}]}],
      "PreCompact": [{"matcher": "*", "hooks": [{"type": "command", "command": "fulcrum hook claude pre-compact"}]}],
      "UserPromptSubmit": [{"matcher": "*", "hooks": [{"type": "command", "command": "fulcrum hook claude prompt"}]}]
    }
  }
  ```

- [ ] Implement `fulcrum hook claude session-start` in `packages/cli/src/index.ts`:
  reads `$CLAUDE_SESSION_ID` from env, calls `mcp__fulcrum__start_agent_run`,
  writes run_id to `.fulcrum/sessions/$CLAUDE_SESSION_ID.json`

- [ ] Implement `fulcrum hook claude session-stop`: reads session file,
  calls `mcp__fulcrum__complete_agent_run`

- [ ] Implement `fulcrum hook claude pre-compact`: writes a memory entry with
  the summary content from stdin

- [ ] Implement `fulcrum hook claude prompt`: optionally enriches the prompt
  with CoS context via `build_cos_context`

- [ ] Write tests for all four handlers

- [ ] Commit: `feat(hooks): SessionStart, Stop, PreCompact, UserPromptSubmit — Claude`

---

### Task 2.2 — Restructure skills to directory form (F2-ISSUE-01) [CRITICAL]

**Files:**
- Modify: `agent-integration/claude/skills/` — convert flat `.md` files to directories

**Current:** `agent-integration/claude/skills/chief-of-staff.md`
**Required:** `agent-integration/claude/skills/chief-of-staff/SKILL.md`

**Steps:**

- [ ] For each existing skill file in `agent-integration/claude/skills/`:
  1. Create directory `skills/<skill-name>/`
  2. Rename `<skill-name>.md` → `<skill-name>/SKILL.md`
  3. If skill has sub-documents, create them as sibling files in the directory

- [ ] Update any cross-references between skills (relative paths change)

- [ ] Update `agent-integration/install.ts` to register skills from directory form
  when writing to `~/.claude/skills/`

- [ ] Verify Claude Code discovery: skills must be at `~/.claude/skills/<name>/SKILL.md`

- [ ] Commit: `refactor(skills): directory-form restructure — SKILL.md per skill`

---

### Task 2.3 — Claude Code subagent files for 24 roles (F2-ISSUE-02) [CRITICAL]

**Files:**
- Create: `agent-integration/claude/agents/<role>.md` for each of the 24 canonical roles
- Modify: `agent-integration/install.ts` — copy agents to `~/.claude/agents/`

**Steps:**

- [ ] For each role in `packages/core/src/roles.ts`, generate a file:
  ```markdown
  ---
  name: fulcrum-<role>
  description: <one-line from role definition>
  tools: <comma-separated allowed MCP tools per capability mask>
  ---

  You are a Fulcrum <role> agent. <system prompt from role>.

  ## Fulcrum tools available

  <list of MCP tools this role can call, with brief descriptions>

  ## What to do when a task is assigned

  1. Call `mcp__fulcrum__start_agent_run` with your role and the task_id
  2. Do the work
  3. Call `mcp__fulcrum__complete_agent_run` with summary and artifact_paths
  ```

- [ ] Write a code generator script `scripts/gen-agent-mds.ts` to produce
  all 24 files automatically from `roles.ts` data

- [ ] Installer step: copy to `~/.claude/agents/fulcrum-<role>.md`

- [ ] Add test: assert all 24 files exist and have valid frontmatter

- [ ] Commit: `feat(agents): Claude Code subagent MDs for all 24 roles`

---

### Task 2.4 — Fix Gemini hook wiring (F2-ISSUE-04) [CRITICAL]

**Files:**
- Modify: `agent-integration/gemini/gemini-extension.json`

**Current (broken):** hooks inside `gemini-extension.json` as inline object
**Required:** hooks in a separate `hooks.json` registered via `hooksFile` reference

**Steps:**

- [ ] Read the Gemini extension schema from R2 research (`r2-plugin-systems.md` §4)
  to confirm the correct structure

- [ ] Restructure `gemini-extension.json`:
  ```json
  {
    "name": "fulcrum",
    "version": "0.0.1",
    "mcpServers": { "fulcrum": { "command": "fulcrum", "args": ["serve", "mcp"] } },
    "hooksFile": "./hooks.json"
  }
  ```

- [ ] Create `agent-integration/gemini/hooks.json` with the correct Gemini hook schema

- [ ] Update installer to copy both files

- [ ] Write test: validate `gemini-extension.json` against schema

- [ ] Commit: `fix(gemini): correct hook wiring — hooksFile reference`

---

### Task 2.5 — Slash commands (F2-ISSUE-07) [HIGH]

**Files:**
- Create: `agent-integration/claude/commands/` directory with:
  - `fulcrum-status.md`
  - `fulcrum-task.md`
  - `fulcrum-memory.md`
  - `fulcrum-run.md`

**Steps:**

- [ ] Write `fulcrum-status.md` slash command:
  ```markdown
  ---
  description: Show Fulcrum workspace status and active agent runs
  ---
  Call mcp__fulcrum__get_workspace_status with workspace_id from .fulcrum.json.
  Present results as a concise status summary.
  ```

- [ ] Write `fulcrum-task.md`:
  ```markdown
  ---
  description: Create or update a task in Fulcrum
  argument-hint: "[title]"
  ---
  Create a task with the given title using mcp__fulcrum__create_task.
  ```

- [ ] Write `fulcrum-memory.md` and `fulcrum-run.md` similarly

- [ ] Installer step: copy to `~/.claude/commands/`

- [ ] Commit: `feat(commands): Fulcrum slash commands for Claude Code`

---

### Task 2.6 — Hook output JSON mode (F2-ISSUE-12) [HIGH]

**Files:**
- Modify: `packages/cli/src/index.ts` — `hook` command handlers

**Steps:**

- [ ] Normalize hook output shape for all hook variants:
  ```ts
  type HookOutput = {
    continue: boolean;
    suppressOutput?: boolean;
    stopReason?: string;
    message?: string;
  }
  ```

- [ ] All hook handlers print to stdout as JSON: `console.log(JSON.stringify(output))`

- [ ] Exit codes: 0 = allow, 2 = block (Claude uses exit code 2 for blocked hooks)

- [ ] Write test: verify JSON output shape for `pre` and `post` hook variants

- [ ] Commit: `fix(hooks): normalized JSON output + exit code 2 for block`

---

### Task 2.7 — Codex integration (F2-ISSUE-05) [MEDIUM]

**Files:**
- Create: `agent-integration/codex/` directory
  - `AGENTS.md` — Codex-style agent instructions
  - `mcp-config.json` — MCP server registration

**Steps:**

- [ ] Research Codex's `AGENTS.md` format (from R2 §5 and official Codex docs)

- [ ] Write `AGENTS.md` with Fulcrum tool descriptions in Codex format

- [ ] Write `mcp-config.json`:
  ```json
  {
    "mcpServers": {
      "fulcrum": { "command": "fulcrum", "args": ["serve", "mcp"] }
    }
  }
  ```

- [ ] Add `setup:codex` command to `package.json`

- [ ] Commit: `feat(codex): Codex integration — AGENTS.md + MCP config`

---

### Task 2.8 — opencode integration (F2-ISSUE-06) [MEDIUM]

**Files:**
- Create: `agent-integration/opencode/opencode.json`

**Steps:**

- [ ] Research opencode MCP configuration format from R2 §6

- [ ] Write `opencode.json` with correct MCP server registration

- [ ] Add `setup:opencode` command

- [ ] Commit: `feat(opencode): opencode integration — MCP config`

---

### Task 2.9 — Installer hardening (F2-ISSUE-11) [MEDIUM]

**Files:**
- Modify: `agent-integration/install.ts`

**Steps:**

- [ ] Add idempotency: check if each step is already done before running it

- [ ] Add rollback: on failure, print what was changed and how to undo

- [ ] Add `--check` flag output: print each step's status (done/not-done/broken)

- [ ] Add post-install smoke test (F0-ISSUE-14): spawn `fulcrum serve mcp`,
  send `{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}`,
  assert valid response

- [ ] Commit: `fix(install): idempotency, rollback, post-install smoke test`

---

### Task 2.10 — Unified context-file generator (F2-ISSUE-09) [HIGH]

**Files:**
- Create: `scripts/gen-context-files.ts`

**Steps:**

- [ ] Write a script that reads the live tool list and generates context files
  for all agents:
  - `agent-integration/claude/CLAUDE.md`
  - `agent-integration/gemini/GEMINI.md`
  - `agent-integration/codex/AGENTS.md`

- [ ] Each file lists current MCP tools with descriptions, usage examples

- [ ] Add to `package.json` as `"gen:context"` and run in CI to detect drift

- [ ] Commit: `feat(scripts): unified context-file generator for all agents`

---

## Deeper Research

1. **Claude Code `SessionStart` hook payload** — confirm what env vars and stdin
   JSON shape are available (session_id, cwd, model). Source: Claude Code hooks
   docs (`~/.claude/settings.json` spec).

2. **Gemini hook schema** — the exact format of `hooks.json` for Gemini. The
   R2 research doc §4 covers this; validate against the Gemini CLI source if
   accessible. Gemini's hook events (pre-tool, post-tool) may differ from Claude's.

3. **Codex `AGENTS.md` format** — is it plain Markdown or does it have YAML
   frontmatter? Are there word-count limits? Source: OpenAI Codex docs and R2 §5.

4. **Claude Code skill directory scan path** — confirm whether Claude Code scans
   `~/.claude/skills/<name>/SKILL.md` or `~/.claude/skills/<name>/<name>.md`.
   The convention matters for Task 2.2.

5. **opencode MCP format stability** — opencode is newer and its config schema
   may have changed. Check R2 §6 and official opencode docs before writing Task 2.8.

---

## Acceptance criteria

- `pnpm setup:claude` writes all hooks into `~/.claude/settings.json` correctly
- A new Claude session fires `SessionStart` and writes `.fulcrum/sessions/<id>.json`
- `pnpm setup:gemini` writes valid Gemini extension files
- `ls ~/.claude/agents/ | grep fulcrum` shows 24 files
- `ls ~/.claude/commands/ | grep fulcrum` shows 4 slash commands
- `ls ~/.claude/skills/` shows directory-form skills
- Codex and opencode config files exist and are valid JSON
- Installer `--check` runs without crashing and reports per-step status
