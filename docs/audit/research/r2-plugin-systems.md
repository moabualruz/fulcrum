# R2 — Agent CLI Plugin/Extension Systems Research

**Date:** 2026-04-14
**Scope:** Claude Code, Gemini CLI, PI (pi-coding-agent / pi-mono), OpenAI Codex CLI, opencode (sst/opencode)
**Purpose:** Document how each agent CLI exposes its plugin/extension surface so Fulcrum can
integrate uniformly, and so the audit standards can be written against real specs.

---

## 0. Terminology quick-map

Each system uses slightly different words for the same concept. Throughout this report:

| Generic concept       | Claude Code       | Gemini CLI                   | PI (pi-mono)          | Codex CLI            | opencode                 |
|-----------------------|-------------------|------------------------------|-----------------------|----------------------|--------------------------|
| Package/manifest      | `plugin.json`     | `gemini-extension.json`      | `package.json` + `pi.*` | `config.toml` (no formal plugin pkg) | `opencode.json` + plugin npm pkg |
| Unit of extensibility | Plugin            | Extension                    | Extension / Package   | (none; MCP only)     | Plugin                   |
| Reusable playbook     | Skill (`SKILL.md`)| Skill (`SKILL.md`)           | Skill (`.pi/skills/`)  | Skill (`.codex/skills/`) | Skill (`SKILL.md`)       |
| Slash command file    | `commands/*.md` (merged into Skills) | `commands/*.toml` | `registerCommand()` (TS) | n/a | `commands/*.md`          |
| Persona with own loop | Subagent (`agents/*.md`) | agents/*.md         | n/a (extension events) | n/a                  | Agent (`agents/*.md`)    |
| Context file          | `CLAUDE.md` + `.claude/rules/` | `GEMINI.md`          | `AGENTS.md` / `CLAUDE.md` / `SYSTEM.md` | `AGENTS.md`       | `AGENTS.md` / rules      |
| Event hook            | Hook event        | (hooks/hooks.json)           | Extension event (`pi.on`) | (none)           | Plugin hook (TS fn)      |
| Tool protocol         | MCP (stdio/http/sse) | MCP (same)                | MCP (plus native tools) | MCP               | MCP                      |

All five ship MCP as the common tool-integration path. Beyond MCP they diverge sharply.

---

## 1. Claude Code (Anthropic)

Claude Code has by far the broadest and most mature extension surface of the five. The
plugin system is the *top-level container* and bundles skills, subagents, hooks, MCP
servers, LSP servers, commands, output styles, and monitors into a single versioned unit.

Docs site as of this writing lives at `https://code.claude.com/docs/en/...`
(the older `docs.claude.com/en/docs/claude-code/...` URLs issue 301s to the new host).

### 1.1 Hooks — full event catalog

Hooks are deterministic, code-driven reactions to lifecycle events. A hook can inject
context, block a tool call, rewrite tool input, or force the model to keep working.

#### 1.1.1 Event types (v2.1+, verbatim from the docs)

**Session-level**
- `SessionStart` — session begins or resumes
- `SessionEnd` — session terminates
- `InstructionsLoaded` — when `CLAUDE.md` or `.claude/rules/*.md` is loaded

**Per-turn**
- `UserPromptSubmit` — user submits a prompt, before Claude sees it
- `Stop` — Claude finishes responding
- `StopFailure` — turn ends due to API error (output/exit ignored)

**Tool execution**
- `PreToolUse` — before a tool call; can block or rewrite input
- `PostToolUse` — after a tool call succeeds
- `PostToolUseFailure` — after a tool call fails
- `PermissionRequest` — when a permission dialog would appear
- `PermissionDenied` — auto-mode classifier denied a call (can retry)

**Subagent / task**
- `SubagentStart`
- `SubagentStop`
- `TaskCreated`
- `TaskCompleted`
- `TeammateIdle` — agent-team teammate about to go idle

**System**
- `Notification` (matchers: `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_dialog`)
- `ConfigChange` (matchers: `user_settings`, `project_settings`, `local_settings`, `policy_settings`, `skills`)
- `CwdChanged`
- `FileChanged` (matcher = literal filename, not regex)
- `WorktreeCreate` / `WorktreeRemove`
- `PreCompact` / `PostCompact`

**MCP**
- `Elicitation` — MCP server requests user input during a tool call
- `ElicitationResult` — user responded to an MCP elicitation

#### 1.1.2 Common input fields (all hooks)

```json
{
  "session_id": "abc123",
  "transcript_path": "/path/to/transcript.jsonl",
  "cwd": "/current/working/directory",
  "permission_mode": "default|plan|acceptEdits|auto|dontAsk|bypassPermissions",
  "hook_event_name": "EventName",
  "agent_id": "optional-subagent-id",
  "agent_type": "optional-agent-name"
}
```

Field naming is **snake_case** throughout.

#### 1.1.3 Per-event input payloads (load-bearing fields)

```json
// PreToolUse
{ "tool_name": "Bash", "tool_input": { "command": "npm test" }, "tool_use_id": "toolu_01…" }

// PostToolUse
{ "tool_name": "Write", "tool_input": { "file_path": "…", "content": "…" },
  "tool_response": { "filePath": "…", "success": true }, "tool_use_id": "toolu_01…" }

// PostToolUseFailure
{ "tool_name": "Bash", "tool_input": {…}, "tool_use_id": "toolu_01…",
  "error": "Command exited with non-zero status code 1", "is_interrupt": false }

// PermissionDenied
{ "tool_name": "Bash", "tool_input": {…}, "tool_use_id": "toolu_01…",
  "reason": "Auto mode denied: command targets a path outside the project" }

// UserPromptSubmit
{ "prompt": "Write a function to calculate factorial" }

// SubagentStart
{ "agent_id": "agent-abc123", "agent_type": "Explore" }

// SubagentStop
{ "stop_hook_active": false, "agent_id": "def456", "agent_type": "Explore",
  "agent_transcript_path": "~/.claude/projects/…/subagents/agent-def456.jsonl",
  "last_assistant_message": "Analysis complete…" }

// SessionStart
{ "source": "startup|resume|clear|compact", "model": "claude-sonnet-4-6",
  "agent_type": "optional-agent-name" }

// InstructionsLoaded
{ "file_path": "/Users/…/CLAUDE.md",
  "memory_type": "User|Project|Local|Managed",
  "load_reason": "session_start|nested_traversal|path_glob_match|include|compact",
  "globs": ["…"], "trigger_file_path": "…", "parent_file_path": "…" }

// FileChanged
{ "file_path": "/path/to/changed/file", "change_type": "create|modify|delete" }
```

#### 1.1.4 Hook output

Two mutually exclusive output modes — pick one.

**Exit code mode:**
| Exit | Meaning |
|------|---------|
| 0 | Success; stdout is parsed as JSON |
| 2 | Blocking error; stdout ignored, stderr surfaced appropriately |
| other | Non-blocking error; stderr shown to Claude/user |

Warning from the docs: "Exit code 1 is treated as non-blocking. Use exit code 2 to enforce
policies."

**JSON-on-stdout mode** (exit 0, write a JSON object):

```json
{
  "continue": true,
  "stopReason": "optional-stop-message",
  "suppressOutput": false,
  "systemMessage": "optional-warning-to-user",
  "decision": "block",
  "reason": "explanation-shown-to-claude",
  "additionalContext": "context-added-to-conversation",
  "hookSpecificOutput": {
    "hookEventName": "EventName",
    "permissionDecision": "allow|deny|ask|defer",
    "permissionDecisionReason": "explanation",
    "updatedInput": { "modified": "parameters" },
    "retry": true
  }
}
```

`PreToolUse` precedence when multiple hooks conflict: `deny` > `defer` > `ask` > `allow`.

Exit-code-2 behaviour is event-specific. From the docs, events that block on code 2:
`PreToolUse`, `PermissionRequest`, `UserPromptSubmit`, `Stop`, `SubagentStop`,
`TeammateIdle`, `TaskCreated`, `TaskCompleted`, `ConfigChange`, `PreCompact`,
`Elicitation`, `ElicitationResult`, `WorktreeCreate`. Events that do *not* block:
`PostToolUse`, `PostToolUseFailure`, `PermissionDenied` (uses JSON `retry`),
`Notification`, `SubagentStart`, `SessionStart`/`End`, `CwdChanged`, `FileChanged`,
`PostCompact`, `InstructionsLoaded`, `WorktreeRemove`, `StopFailure`.

#### 1.1.5 Hook configuration schema in `settings.json`

Three levels of nesting — **`hooks` → event name → array of matcher groups → array
of handler objects**.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/script.sh",
            "if": "Bash(rm *)",
            "timeout": 600,
            "statusMessage": "Validating…",
            "async": false,
            "asyncRewake": false,
            "shell": "bash"
          }
        ]
      }
    ]
  }
}
```

Matcher patterns:

| Pattern | Evaluation |
|---------|------------|
| `"*"`, `""`, omitted | Match all |
| Letters, digits, `_`, `|` | Exact match or `|`-separated list (`Bash`, `Edit|Write`) |
| Other characters | JS regex (`^Notebook`, `mcp__memory__.*`) |

**Handler types:**
- `type: "command"` — exec shell script; env vars include `$CLAUDE_PROJECT_DIR`,
  `$CLAUDE_PLUGIN_ROOT`, `$CLAUDE_PLUGIN_DATA`, `$CLAUDE_CODE_REMOTE`, and a
  `$CLAUDE_ENV_FILE` path that `SessionStart`/`CwdChanged`/`FileChanged` hooks
  can `echo 'export FOO=bar' >>` to set persistent session env vars.
- `type: "http"` — POST the event JSON to `url`, optional `headers` with
  `allowedEnvVars` allowlist for interpolation.
- `type: "prompt"` — evaluate a prompt with an LLM (uses `$ARGUMENTS`).
- `type: "agent"` — run a subagent verifier for complex checks.

Common fields: `if` (permission-rule syntax, e.g. `"Bash(git *)"` or `"Edit(*.ts)"`),
`timeout` (600s default for commands, 30s for prompts, 60s for agents), `statusMessage`,
`once` (skills only — run once per session).

Settings files that can hold `hooks`:
- `~/.claude/settings.json` — all projects (personal)
- `.claude/settings.json` — single project, shareable
- `.claude/settings.local.json` — single project, gitignored
- plugin `hooks/hooks.json` — bundled with plugin
- skill/agent frontmatter — scoped to the component's lifetime

`disableAllHooks: true` at the settings level kills everything except hooks installed
from managed settings.

#### 1.1.6 PreCompact and SessionStart in practice

- **`PreCompact`**: fires just before context compaction. Can block with exit 2 or
  `decision: "block"`. Typical use is to archive a transcript or forbid compaction
  while a long task is running.
- **`SessionStart`**: fires on `startup`, `resume`, `clear`, or `compact` (the `source`
  field tells you which). Can inject `additionalContext` and write `export` lines to
  `$CLAUDE_ENV_FILE` to persist environment variables for the rest of the session.

### 1.2 Skills

Skills are the Claude Code incarnation of the **Agent Skills open standard** (agentskills.io).
Claude Code layers extra features on top — invocation control, forked subagent execution,
dynamic context injection — but the core `SKILL.md` layout is portable.

**Directory form is current and recommended.** Flat `.claude/commands/*.md` files still
work but skills get more features.

```text
my-skill/
├── SKILL.md           # Required entrypoint
├── reference.md       # Optional — loaded on demand
├── examples/
└── scripts/
    └── helper.py
```

**Locations (higher priority wins; plugin skills live in a separate namespace):**

| Location   | Path                                         | Scope                     |
|------------|----------------------------------------------|---------------------------|
| Enterprise | (managed settings)                           | All users in org          |
| Personal   | `~/.claude/skills/<name>/SKILL.md`           | All your projects         |
| Project    | `.claude/skills/<name>/SKILL.md`             | This project              |
| Plugin     | `<plugin>/skills/<name>/SKILL.md`            | Where plugin is enabled   |

Priority: `enterprise > personal > project`. Plugin skills are namespaced
`plugin-name:skill-name`, so they cannot collide with other scopes.

Nested `.claude/skills/` dirs along the walked tree are also discovered automatically
(monorepo-friendly).

**Frontmatter reference:**

```yaml
---
name: my-skill                 # Optional; defaults to dir name. [a-z0-9-]{1,64}
description: What & when       # Recommended. Combined desc+when_to_use capped at 1536 chars
when_to_use: Additional hint   # Optional
argument-hint: "[issue-number]"
disable-model-invocation: false  # true => only user can /invoke
user-invocable: true             # false => only model can invoke, hidden from /menu
allowed-tools: Read Grep         # Pre-approve tools while skill is active
model: sonnet                    # Model override
effort: medium                   # low|medium|high|max (Opus 4.6)
context: fork                    # Run in forked subagent context
agent: Explore                   # Which agent to fork into
hooks: {…}                       # Skill-scoped hooks
paths: ["src/api/**/*.ts"]       # Auto-activate only when editing matching files
shell: bash                      # Shell for inline !`…` blocks
---

Body is markdown; loaded once when the skill is invoked.
```

**String substitutions inside skill content:**
- `$ARGUMENTS` — full arg string
- `$ARGUMENTS[N]` / `$N` — positional arg (shell-quoted)
- `${CLAUDE_SESSION_ID}` — current session
- `${CLAUDE_SKILL_DIR}` — absolute path to the skill dir (stable across installs)

**Dynamic context injection:** ``` !`gh pr diff` ``` inside the body runs a shell
command **before** the body is sent to Claude; the command's stdout replaces the
placeholder. Multi-line variant uses fenced `````!` blocks. This can be disabled
globally with `"disableSkillShellExecution": true` in settings.

**Script execution in skills:** yes — the skill directory can bundle arbitrary
scripts (`.py`, `.sh`, etc.) and the body can instruct Claude to run them via
`Bash`. `${CLAUDE_SKILL_DIR}` gives a stable path to them.

**Skill content lifecycle:** when invoked, the rendered body enters the
conversation as one message and stays there for the rest of the session
(Claude Code does not re-read the file). After auto-compaction the most-recent
invocation of each skill is re-attached, keeping the first 5k tokens each, with
a combined 25k budget across skills.

**Permission control:** `Skill`, `Skill(name)`, `Skill(name *)` can be put in
the `permissions.allow`/`deny` list.

### 1.3 MCP servers

MCP is the universal tool-integration protocol. Claude Code supports stdio, HTTP, and
SSE (deprecated) transports.

**Registration:**

```bash
# Remote HTTP
claude mcp add --transport http notion https://mcp.notion.com/mcp
# Remote SSE (deprecated)
claude mcp add --transport sse asana https://mcp.asana.com/sse
# Local stdio
claude mcp add --transport stdio --env AIRTABLE_API_KEY=… airtable -- npx -y airtable-mcp-server
```

**Scope flags:**
- `--scope local` (default) — only you, this project (was called `project`)
- `--scope project` — shared via `.mcp.json` at project root
- `--scope user` — all projects (was called `global`)

**Config file formats:**
- Project `.mcp.json`:
  ```json
  { "mcpServers": { "server-name": { "command": "…", "args": [], "env": {} } } }
  ```
- User-level `~/.claude.json` — also holds per-project state, MCP local scope, etc.
- Plugin `.mcp.json` at plugin root (or inline in `plugin.json`).

**Tool naming:** `mcp__<server>__<tool>` (double underscore). Matcher example for hooks:
`mcp__memory__.*`.

Other controls:
- `MCP_TIMEOUT` env var for startup timeouts
- `MAX_MCP_OUTPUT_TOKENS` (default warn at 10k)
- `/mcp` slash command for status and OAuth
- Managed-settings `allowedMcpServers` / `deniedMcpServers` / `allowManagedMcpServersOnly`

### 1.4 Slash commands

Custom commands live in `~/.claude/commands/` and `.claude/commands/`. Files are flat
`.md` with YAML frontmatter that uses the same fields as skills. As of current Claude
Code, **commands have been merged into skills** — a file at `.claude/commands/deploy.md`
and a skill at `.claude/skills/deploy/SKILL.md` both expose `/deploy`. When both exist
the skill wins.

### 1.5 `CLAUDE.md` context hierarchy

- **Managed policy:** `/Library/Application Support/ClaudeCode/CLAUDE.md` (macOS),
  `/etc/claude-code/CLAUDE.md` (Linux/WSL), `C:\Program Files\ClaudeCode\CLAUDE.md`
  (Windows) — org-wide, cannot be excluded.
- **Project:** `./CLAUDE.md` or `./.claude/CLAUDE.md`.
- **User:** `~/.claude/CLAUDE.md`.
- **Local:** `./CLAUDE.local.md` (gitignored).

Files in the directory hierarchy **above** the working directory are loaded in full at
launch. Files in subdirs are lazy-loaded when Claude reads a file inside that subdir.
All discovered files are **concatenated** (not overridden). Within a dir, `CLAUDE.local.md`
is appended after `CLAUDE.md` so personal notes come last.

Import syntax: `@path/to/file` (relative or absolute, recursive up to 5 hops). First
time an external import is encountered the CLI asks for approval; declining disables it.

`AGENTS.md` support: Claude Code does *not* read `AGENTS.md` directly — the recommended
pattern is `@AGENTS.md` at the top of your `CLAUDE.md`.

For path-scoped rules, use `.claude/rules/*.md` with YAML `paths: [...]` frontmatter.

Auto-memory (v2.1.59+): Claude writes notes to `~/.claude/projects/<project>/memory/MEMORY.md`
(first 200 lines or 25KB loaded each session). Configurable via `autoMemoryEnabled`,
`autoMemoryDirectory`, `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`.

### 1.6 Subagents

Subagents are Markdown files with YAML frontmatter in `.claude/agents/<name>.md` (project),
`~/.claude/agents/<name>.md` (user), or bundled by plugins. They have their own system
prompt, tool set, and context window; Claude delegates by description matching.

```markdown
---
name: code-reviewer
description: Reviews code for quality and best practices
tools: Read, Glob, Grep           # allowlist
disallowedTools: Write, Edit       # denylist (subtracted from pool)
model: sonnet                      # or opus, haiku, claude-opus-4-6, inherit
permissionMode: plan
maxTurns: 20
skills: [my-skill]                 # preloaded
mcpServers: [slack]
hooks: {...}
memory: user                       # persistent memory scope
background: false
effort: medium
isolation: worktree                # run in a tmp git worktree
color: blue
initialPrompt: "…"                 # auto-submitted as first user turn
---

You are a senior code reviewer. Focus on quality, security, best practices.
```

Built-in agents include `Explore` (Haiku, read-only), `Plan` (read-only, used in plan
mode), `general-purpose` (all tools), plus helpers `statusline-setup` and `Claude Code Guide`.

Subagent precedence: managed > `--agents` CLI > project > user > plugin.
Plugin-shipped subagents **cannot** define `hooks`, `mcpServers`, or `permissionMode`.

**Skills vs subagents:** a skill is a playbook reused in the current context; a subagent
spawns a new context window with its own system prompt and tool restrictions. The
frontier is: use a skill when you want Claude to *follow* instructions; use a subagent
when you want to *isolate* work (exploration, research) or enforce strict tool limits.

### 1.7 Plugins — the container

A plugin is a directory bundling any combination of the above components.

**Manifest (`.claude-plugin/plugin.json`, optional):**

```json
{
  "name": "plugin-name",
  "version": "1.2.0",
  "description": "…",
  "author": { "name": "…", "email": "…", "url": "…" },
  "homepage": "…",
  "repository": "…",
  "license": "MIT",
  "keywords": ["…"],
  "skills": "./custom/skills/",
  "commands": ["./custom/commands/special.md"],
  "agents": "./custom/agents/",
  "hooks": "./config/hooks.json",
  "mcpServers": "./mcp-config.json",
  "outputStyles": "./styles/",
  "lspServers": "./.lsp.json",
  "monitors": "./monitors.json",
  "userConfig": {
    "api_endpoint": { "description": "…", "sensitive": false },
    "api_token":    { "description": "…", "sensitive": true  }
  },
  "channels": [
    { "server": "telegram",
      "userConfig": { "bot_token": { "sensitive": true }, "owner_id": { "sensitive": false } } }
  ]
}
```

Only `name` is required.

**Standard layout (components live at plugin root, NOT inside `.claude-plugin/`):**

```text
enterprise-plugin/
├── .claude-plugin/plugin.json
├── skills/<name>/SKILL.md
├── commands/*.md
├── agents/*.md
├── output-styles/*.md
├── monitors/monitors.json
├── hooks/hooks.json
├── bin/<executable>          # added to Bash tool PATH
├── settings.json             # default settings (only `agent` + `subagentStatusLine` honoured)
├── .mcp.json
├── .lsp.json
├── scripts/
├── LICENSE
└── CHANGELOG.md
```

**Special env vars:**
- `${CLAUDE_PLUGIN_ROOT}` — plugin install dir (changes on update)
- `${CLAUDE_PLUGIN_DATA}` — persistent dir surviving updates at
  `~/.claude/plugins/data/{id}/`

**Installation scopes:** `user`, `project`, `local`, `managed` — same scheme as settings.
CLI: `claude plugin install <name>[@marketplace] [--scope …]`, `uninstall`, `enable`,
`disable`, `update`. `--keep-data` preserves `${CLAUDE_PLUGIN_DATA}` on uninstall.

Plugin security restrictions: plugin-shipped subagents cannot define `hooks`,
`mcpServers`, or `permissionMode`. Paths must be relative and start with `./` —
`../shared-utils` traversal is blocked. Symlinks inside plugin root are preserved.

### 1.8 `settings.json` reference (truncated)

Full docs list 100+ fields. The ones relevant for an integration layer:

- `agent` — run the main thread as a named subagent
- `hooks` — lifecycle event handlers (see 1.1.5)
- `permissions` — `allow`/`deny`/`ask`, `defaultMode`, `additionalDirectories`
- `env` — environment variables applied to every session
- `apiKeyHelper`, `awsAuthRefresh`, `otelHeadersHelper` — script-based auth
- `model`, `availableModels`, `modelOverrides` — model selection
- `mcpServers` block (also via `.mcp.json` / `~/.claude.json`)
- `disableAllHooks`, `disableSkillShellExecution` — kill-switches
- `allowedMcpServers` / `deniedMcpServers` / `allowManagedMcpServersOnly` — mgmt
- `allowedHttpHookUrls`, `httpHookAllowedEnvVars` — restrict HTTP hook targets
- `enabledPlugins`, `allowedChannelPlugins`, `blockedMarketplaces`,
  `strictKnownMarketplaces`, `pluginTrustMessage` — plugin management
- `autoMemoryEnabled`, `autoMemoryDirectory` — auto memory
- `claudeMdExcludes` — skip CLAUDE.md files in monorepos
- `statusLine`, `fileSuggestion`, `spinnerTips*` — UI customization
- `worktree.symlinkDirectories`, `worktree.sparsePaths` — worktree ergonomics
- `attribution`, `includeCoAuthoredBy` — git commit attribution
- `cleanupPeriodDays`, `plansDirectory`

Settings files and precedence (lowest → highest):
1. Managed (`managed-settings.json` and drop-in `managed-settings.d/*.json`)
2. `~/.claude/settings.json` (user)
3. `.claude/settings.json` (project)
4. `.claude/settings.local.json` (local)
5. `--setting-sources` / command-line overrides

Global-only state lives in `~/.claude.json` (OAuth, per-project trust, MCP local-scope
servers, caches). Putting any of those keys into `settings.json` triggers a schema error.

---

## 2. Gemini CLI (Google)

Gemini CLI's extension model is intentionally narrower than Claude Code's. It leans on
MCP plus a filesystem layout of commands, skills, sub-agents, hooks, policies, and themes.

**Distribution:** single manifest `gemini-extension.json` installed to
`~/.gemini/extensions/<name>/`. Managed via `gemini extensions install|uninstall|
enable|disable|update|new|link|config <name>`. The interactive slash-command
`/extensions list` shows what is installed; most mutations require a CLI restart.

### 2.1 `gemini-extension.json` schema

```json
{
  "name": "my-extension",
  "version": "1.0.0",
  "description": "My awesome extension",
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["${extensionPath}/my-server.js"],
      "cwd": "${extensionPath}"
    }
  },
  "contextFileName": "GEMINI.md",
  "excludeTools": ["run_shell_command"],
  "settings": [
    { "name": "API Key", "envVar": "MY_SERVICE_API_KEY", "sensitive": true }
  ],
  "migratedTo": "https://github.com/new-owner/new-extension-repo",
  "plan": { "directory": ".gemini/plans" },
  "themes": [ /* … */ ],
  "policies": [ /* .toml safety rules */ ]
}
```

| Field              | Type        | Notes |
|--------------------|-------------|-------|
| `name`             | string      | required; lowercase-dashes |
| `version`          | string      | required; semver |
| `description`      | string      | required; shown on geminicli.com/extensions |
| `mcpServers`       | map         | same shape as Claude Code (`command`, `args`, `cwd`, `env`) but **no double-underscore tool prefix convention** — tools appear snake_case within the model |
| `contextFileName`  | string      | file loaded as system context (defaults to `GEMINI.md` if present in dir) |
| `excludeTools`     | string[]    | blocklist applied to the model's tool pool |
| `settings`         | object[]    | user-configurable values stored in `.env` files (each entry has `envVar`, `sensitive`) |
| `migratedTo`       | string      | redirect users to a new repo on update |
| `plan.directory`   | string      | where plan-mode artifacts go |
| `themes`           | array       | custom colours |
| `policies`         | string      | `.toml` safety rules |

**Variable substitution:** `${extensionPath}`, `${workspacePath}`, `${/}` (platform path
separator). Use them inside `mcpServers.*.command`/`args`/`cwd` so the manifest stays
portable across install dirs.

### 2.2 Directory layout per extension

```text
~/.gemini/extensions/my-extension/
├── gemini-extension.json
├── GEMINI.md                   # context file (or whatever contextFileName points to)
├── commands/*.toml             # slash commands (namespace with colons: /fs:grep-code)
├── hooks/hooks.json            # CLI behaviour hooks
├── skills/<name>/SKILL.md      # Agent Skills standard
├── agents/*.md                 # subagents
├── policies/*.toml             # safety rules / checkers
└── themes/*.json
```

**Commands are TOML, not Markdown.** They use `{{args}}` for substitution and
`` !{command} `` for shell injection. They support hierarchical namespacing
through colons in filenames (e.g. `fs:grep-code.toml` → `/fs:grep-code`).

### 2.3 Hooks

Gemini CLI ships `hooks/hooks.json` support that parallels Claude Code's structure.
Gemini uses **camelCase** field names throughout (`toolName`, `conversationId`,
`sessionId` etc.), so a hook written against Claude Code's schema will not just drop in.
Event coverage is smaller than Claude Code (roughly pre/post tool, user input, and
session lifecycle). The docs are thin here — the authoritative reference is the
geminicli.com extensions spec, which was updated early 2026 to include hooks alongside
commands and skills.

### 2.4 How extensions are discovered

At startup, Gemini CLI walks `~/.gemini/extensions/` and loads every directory containing
a valid `gemini-extension.json`. A `--scope workspace` variant lets an extension only
apply in `/your/repo/.gemini/extensions/`. MCP servers declared in a manifest start in
parallel with MCP servers in `~/.gemini/settings.json`.

### 2.5 Differences to note vs. Claude Code

- **Field naming:** `toolName`, `conversationId`, `sessionId` (Gemini) vs
  `tool_name`, `session_id` (Claude). Tool prefix `snake_case` vs `mcp__<server>__<tool>`.
- **Command file format:** TOML vs Markdown.
- **Context file name:** `GEMINI.md` by default, configurable per extension.
- **Per-extension `settings`:** Gemini stores user-config values in `.env` files; Claude
  splits sensitive values into the system keychain and exposes them as
  `${user_config.KEY}` / `CLAUDE_PLUGIN_OPTION_KEY`.
- **Plan mode** has its own `.gemini/plans/` directory, configurable from the manifest.
- **No LSP story.** No `monitors` equivalent. No `channels`/message-injection.

---

## 3. PI (pi-coding-agent / pi-mono, Mario Zechner)

PI is a TypeScript-native agent CLI. Its plugin story is unusual: instead of a flat
manifest, **extensions are real TypeScript modules** loaded via `jiti`, with a rich
`ExtensionAPI` at runtime. Everything else (skills, prompts, themes) is file-based.

Source of truth: `https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent`
(the public npm package is `@mariozechner/pi-coding-agent`).

### 3.1 Package manager

```bash
pi install npm:@foo/pi-tools              # npm
pi install npm:@foo/pi-tools@1.2.3        # pinned
pi install git:github.com/user/repo       # git
pi install git:github.com/user/repo@v1
pi install ssh://git@github.com/user/repo
pi install https://github.com/user/repo
pi install <local-path>                   # local dev

pi list
pi update
pi remove <name>
pi config
```

Packages land in `~/.pi/agent/git/` (git sources) or the usual global npm location.
Flag `-l`/`--local` installs into `.pi/` next to your project instead.

### 3.2 Package manifest (`package.json`)

A pi package *reuses* `package.json` with a `pi` section:

```json
{
  "name": "my-pi-package",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "skills":     ["./skills"],
    "prompts":    ["./prompts"],
    "themes":     ["./themes"]
  }
}
```

Without an explicit `pi` section, PI auto-discovers from conventional directories
(`extensions/`, `skills/`, `prompts/`, `themes/`).

Extensions may be single `.ts` files or subdirectories with `index.ts`. PI also scans:
- `~/.pi/agent/extensions/*.ts` (global)
- `.pi/extensions/*.ts` (project-local)
- Paths in `settings.json` `"extensions"` array

### 3.3 `ExtensionAPI`

An extension is a TS module exporting a default function that receives an `ExtensionAPI`.

```typescript
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "bash" && /rm -rf/.test(event.input.command)) {
      return { block: true, reason: "destructive" };
    }
  });

  pi.registerTool({
    name: "tool_name",
    label: "Display Name",
    description: "What it does",
    parameters: Type.Object({ path: Type.String() }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return { content: [{ type: "text", text: "hello" }], details: {} };
    }
  });

  pi.registerCommand("mycommand", {
    description: "…",
    handler: async (args, ctx) => { /* … */ }
  });
}
```

**Methods available on `pi` (non-exhaustive):**
- Events: `on(event, handler)`
- Tools: `registerTool(def)`, `getActiveTools()`, `setActiveTools(names)`
- Commands: `registerCommand(name, opts)`, `registerShortcut(shortcut, opts)`,
  `registerFlag(name, opts)`
- Messages: `sendMessage(msg, opts)`, `sendUserMessage(content, opts)`
- Session: `setSessionName`, `getSessionName`, `appendEntry(customType, data)`
- Model: `setModel(model)`, `getThinkingLevel`, `setThinkingLevel`
- Rendering: `registerMessageRenderer(customType, renderer)`

### 3.4 Event catalog

**Session lifecycle:**
- `session_start` (payload has `reason: "startup"|"new"|"resume"|"fork"`)
- `session_before_switch`, `session_before_fork` — cancellable via return value
- `session_shutdown`
- `session_before_compact`, `session_compact`
- `session_before_tree`, `session_tree`

**Resource discovery:**
- `resources_discover` — contribute skill/prompt/theme paths

**Agent execution:**
- `before_agent_start` — inject messages, modify prompts
- `agent_start`, `agent_end`
- `turn_start`, `turn_end`
- `message_start`, `message_update`, `message_end` — streaming

**Tool execution:**
- `tool_execution_start`, `tool_execution_update`, `tool_execution_end`
- `tool_call` — **pre-tool, blockable** via `return { block: true, reason }`
- `tool_result` — post-tool, can modify result

**Other:**
- `model_select`
- `input` — user input, interceptable/transformable
- `user_bash`
- `context` — modify messages before provider request
- `before_provider_request` — inspect or replace the full LLM payload

**Tool-call event fields:** `toolName`, `input`, `toolCallId`. (Note: **camelCase**, like
Gemini CLI but unlike Claude Code's `tool_name`/`tool_input`.)

### 3.5 `ExtensionContext` (the `ctx` argument)

Available in every handler:

```typescript
ctx.ui.notify(message, type)
ctx.ui.confirm(title, message)
ctx.ui.input(prompt, options)
ctx.ui.select(options)
ctx.ui.setStatus(id, text)
ctx.ui.setWidget(id, lines)         // the "widget" / dashboard API
ctx.ui.custom(component)            // arbitrary TUI components

ctx.sessionManager                  // access session storage
ctx.modelRegistry / ctx.model
ctx.cwd
ctx.signal                          // AbortSignal
ctx.isIdle() / ctx.abort() / ctx.hasPendingMessages()
```

Command handlers also get `ctx.waitForIdle()`, `ctx.newSession()`, `ctx.fork(entryId)`,
`ctx.navigateTree(targetId, opts)`, `ctx.switchSession(path)`, `ctx.reload()`.

### 3.6 Widgets, slash commands, cockpit

- **Slash commands** are lightweight triggers registered via `pi.registerCommand`. They
  exist purely as TypeScript function pointers — no Markdown file format. Built-ins
  include `/model`, `/settings`, `/new`, `/resume`, `/fork`.
- **Widgets** are lines of TUI text rendered in the footer or sidebar area via
  `ctx.ui.setWidget(id, lines)`. Multiple widgets can coexist; each has an ID for
  updates.
- **Cockpit / dashboard:** the docs use "widget" for individual panels and "cockpit" for
  a full-screen custom TUI component created via `ctx.ui.custom(component)`. A cockpit
  is effectively a React-like component rendered inside the CLI; extensions can hijack
  rendering entirely for things like live model status dashboards. The difference from
  a plain extension is purely *presentational* — a cockpit is the full-screen variant.

### 3.7 Available imports inside extensions

Because PI loads extensions through `jiti`, TS Just Works. You get:
- `@mariozechner/pi-coding-agent` — `ExtensionAPI` types
- `@sinclair/typebox` — `Type.Object`, `Type.String` etc. for tool parameter schemas
- `@mariozechner/pi-ai` — common AI utilities
- `@mariozechner/pi-tui` — TUI components
- `node:*` builtins
- any npm packages listed in the extension's `package.json`

### 3.8 Built-in vs MCP vs native tools

Extensions register **native** tools (running in-process TS). PI also supports MCP
servers configured in `~/.pi/agent/settings.json` (or `.pi/settings.json`). The
naming convention for MCP tools in PI follows the `mcp__<server>__<tool>` pattern.

### 3.9 Context files

PI reads all three of `AGENTS.md`, `CLAUDE.md`, and `SYSTEM.md` from the project root.
`SYSTEM.md` replaces the base system prompt if present; the other two are appended as
additional context.

### 3.10 Extension vs cockpit — clarification

An **extension** is a TS module that registers capabilities. A **cockpit** is a way
for that same extension to take over the main TUI frame with a custom component. They
are not two different package types — "cockpit" is jargon for a certain kind of
extension UI.

---

## 4. Codex (OpenAI)

The short version: **OpenAI's current coding agent CLI is `openai/codex`** (the old
Codex model is unrelated). It's a Rust-based CLI published as `@openai/codex` on npm
and available via `brew install --cask codex` or direct binaries.

### 4.1 Repository layout

```text
codex/
├── codex-cli/       # CLI front-end
├── codex-rs/        # core Rust implementation
├── sdk/             # SDK
└── .codex/
    └── skills/
        ├── babysit-pr/
        ├── codex-bug/
        ├── remote-tests/
        └── test-tui/
```

Skills *do* exist — each subfolder houses a skill — but the on-disk format is not
publicly documented to the same depth as Claude Code's. The directory names strongly
suggest the same Agent-Skills / `SKILL.md` convention.

### 4.2 Plugin story

**Codex has no dedicated plugin package format as of April 2026.** Extensibility is
via MCP servers declared in the top-level `~/.codex/config.toml`:

```toml
[mcp_servers.docs]
command = "docs-server"
supports_parallel_tool_calls = true

[mcp_servers.docs.tools.search]
approval_mode = "approve"
```

Notable fields:
- `supports_parallel_tool_calls` — enables concurrent execution for thread-safe servers
- `[mcp_servers.<name>.tools.<tool>]` with `approval_mode = "approve"` — per-tool
  approval overrides

Other config pieces:
- `sqlite_home` / `CODEX_SQLITE_HOME` — state storage
- `CODEX_CA_CERTIFICATE`, `SSL_CERT_FILE` — custom CA trust
- Webhook-based turn-complete notifications
- `plan_mode_reasoning_effort`
- `experimental_realtime_start_instructions`

### 4.3 Auth and distribution

Supports both ChatGPT sign-in (Plus/Pro/Business/Edu/Enterprise) and API-key mode. The
repo's "MCP Registry" section says "Integrate external tools" — so the installation UX
is MCP-server install, not a plugin install.

### 4.4 Differences vs the other four

- **No hooks.** No `PreToolUse`/`PostToolUse` analogue. Tool approvals are the only
  interception point, and they happen via the MCP server's own `approval_mode`.
- **Config language: TOML**, not JSON.
- **Native tools vs MCP** is the only boundary — no user-registered tools without an
  MCP server.
- **Skills directory exists** (`.codex/skills/`) but the public surface for user-installed
  skills is not documented; most docs point users to add MCP servers instead.

**Practical implication for Fulcrum:** to integrate with Codex, ship an MCP server.
That's the only supported surface right now.

---

## 5. opencode (sst/opencode)

opencode is fully open source and has a small but concrete plugin API. Docs live at
`https://opencode.ai/docs/`.

### 5.1 Plugins

Plugins are TypeScript/JS modules distributed as npm packages or local files. Installed
via `opencode.json`:

```json
{
  "plugin": ["opencode-helicone-session", "opencode-wakatime", "@my-org/custom-plugin"]
}
```

Both bare and scoped npm packages are supported. `bun install` runs at startup; packages
are cached in `~/.cache/opencode/node_modules/`. Plugin files can also live in:

- `.opencode/plugins/` (project)
- `~/.config/opencode/plugins/` (user)

**Load order:** global config → project config → global plugins → project plugins.

**Plugin API surface** — an async function that returns an event-handler map:

```javascript
export const MyPlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool === "read" && output.args.filePath.includes(".env")) {
        throw new Error("Do not read .env files");
      }
    }
  };
};
```

Context includes `project`, `directory`, `worktree`, `client` (opencode SDK),
`$` (Bun's shell API).

### 5.2 Event catalog

| Category     | Events |
|--------------|--------|
| Command      | `command.executed` |
| File         | `file.edited`, `file.watcher.updated` |
| Installation | `installation.updated` |
| LSP          | `lsp.client.diagnostics`, `lsp.updated` |
| Messages     | `message.part.removed`, `message.part.updated`, `message.removed`, `message.updated` |
| Permissions  | `permission.asked`, `permission.replied` |
| Server       | `server.connected` |
| Sessions     | `session.created`, `session.compacted`, `session.deleted`, `session.diff`, `session.error`, `session.idle`, `session.status`, `session.updated` |
| Todos        | `todo.updated` |
| Shell        | `shell.env` |
| Tools        | `tool.execute.after`, `tool.execute.before` |
| TUI          | `tui.prompt.append`, `tui.command.execute`, `tui.toast.show` |

Naming is **dotted lowercase**, not camelCase or snake_case — third variation in five
systems.

Blocking is done by **throwing** inside the handler (Node-style), not by returning a
decision object.

### 5.3 Agents

```markdown
---
description: Writes and maintains project documentation
mode: subagent               # primary | subagent | all
temperature: 0.4
model: anthropic/claude-3-5-sonnet-20241022
tools:
  bash: false
permission:
  write: ask
---

You are a technical writer. Create clear, comprehensive documentation.
```

Locations: `~/.config/opencode/agents/` (global), `.opencode/agents/` (project). The
filename becomes the agent name.

- **Primary agents** are toggled with Tab in the TUI — they are the main chat
  interface.
- **Subagents** are invoked by primary agents or via `@mention`.
- `mode: all` makes the agent available in both modes.

### 5.4 Commands

Commands are Markdown files in `~/.config/opencode/commands/` or `.opencode/commands/`.
Filename → `/name`. Frontmatter fields:

```yaml
---
description: Run tests with coverage
agent: build
model: anthropic/claude-3-5-sonnet-20241022
subtask: true            # force a subagent to execute
---
```

Body is the template sent to the LLM. Supports `$ARGUMENTS`, `$1`, `$2`, …,
`` !`cmd` `` for bash injection, and `@filename` for file includes.

### 5.5 Skills

opencode also implements Agent Skills. `SKILL.md` with frontmatter:

- **Required:** `name` (1–64 chars, `[a-z0-9]+(-[a-z0-9]+)*`), `description` (1–1024)
- **Optional:** `license`, `compatibility`, `metadata` (string→string map)

Search order is notable — it **also reads Claude Code skill directories**:

1. `.opencode/skills/<name>/SKILL.md`
2. `~/.config/opencode/skills/<name>/SKILL.md`
3. `.claude/skills/<name>/SKILL.md`
4. `~/.claude/skills/<name>/SKILL.md`
5. `.agents/skills/<name>/SKILL.md`
6. `~/.agents/skills/<name>/SKILL.md`

Skill access is controlled in `opencode.json` via pattern rules (`allow`/`deny`/`ask`),
per-agent frontmatter, or the nuclear `tools: { skill: false }`.

### 5.6 `opencode.json` top-level fields

| Field | Purpose |
|-------|---------|
| `model` | Primary LLM |
| `small_model` | Small model for titles etc. |
| `provider` | Provider-specific settings/auth |
| `tools` | Per-tool enable/disable |
| `agent` | Inline agent defs |
| `default_agent` | Which agent to start as |
| `server` | `opencode serve` / `opencode web` config |
| `share` | `manual`/`auto`/`disabled` |
| `command` | Inline command templates |
| `permission` | Tool approval rules |
| `mcp` | MCP server configurations |
| `formatter` | Code formatter plug-in |
| `instructions` | Paths to rule/instruction files |
| `snapshot` | Change tracking (default true) |
| `autoupdate` | `true|false|"notify"` |
| `compaction` | Compaction parameters |
| `watcher` | File-watch ignore patterns |
| `plugin` | npm plugin list |
| `disabled_providers` / `enabled_providers` |
| `experimental` |

**Config precedence (lowest → highest):**

1. Remote `.well-known/opencode` (org defaults)
2. `~/.config/opencode/opencode.json`
3. `OPENCODE_CONFIG` env path
4. Project `opencode.json`
5. `.opencode/` directories
6. `OPENCODE_CONFIG_CONTENT` env
7. Managed system config files
8. macOS MDM preferences (highest)

Non-conflicting settings merge across layers.

---

## 6. Cross-system comparison matrix

| Feature | Claude Code | Gemini CLI | PI | Codex | opencode |
|---|---|---|---|---|---|
| **Plugin manifest** | `.claude-plugin/plugin.json` (JSON) | `gemini-extension.json` (JSON) | `package.json` with `pi: {...}` section | none (config.toml only) | `opencode.json` `plugin: [...]` + plugin TS file |
| **MCP support** | stdio/http/sse; `.mcp.json`, `~/.claude.json`, `claude mcp add`, plugin `.mcp.json` | stdio/http; `mcpServers` in manifest and `~/.gemini/settings.json` | stdio; via settings.json | stdio; `~/.codex/config.toml` `[mcp_servers.*]` | stdio/http; `mcp` key in `opencode.json` |
| **Tool naming convention** | `mcp__<server>__<tool>` (double underscore) | snake_case, no prefix | `mcp__<server>__<tool>` for MCP; free-form for native | snake_case | snake_case / plugin-declared |
| **Hook types** | ~25 events, JSON stdin, 4 handler types (command/http/prompt/agent), matchers, `$CLAUDE_PROJECT_DIR` | Smaller set (pre/post tool, user input, session), `hooks/hooks.json` | 25+ TS events, blockable via return value, in-process | **None** | 20+ dotted events, TS only, throw-to-block |
| **Context files** | `CLAUDE.md` hierarchy + `.claude/rules/*.md` with `paths:` + auto-memory `MEMORY.md` | `GEMINI.md` (configurable per extension) | `AGENTS.md` / `CLAUDE.md` / `SYSTEM.md` | `AGENTS.md` | `AGENTS.md` + `instructions:` paths + rules |
| **Slash commands** | `commands/*.md` (now skills) with `$ARGUMENTS`, `$N`, `!`cmd`` | `commands/*.toml` with `{{args}}`, `!{cmd}`, colon namespacing | `pi.registerCommand()` — pure TS | none | `commands/*.md` with `$ARGUMENTS`, `$N`, `!`cmd``, `@file` |
| **Subagent support** | Yes, `.claude/agents/*.md` with rich frontmatter, built-in `Explore`/`Plan`/`general-purpose` | Yes, `agents/*.md` (less documented) | Not as a separate primitive — extensions own the loop | No | Yes, `agents/*.md` with `mode: primary|subagent|all` |
| **User scope vs project scope** | user `~/.claude/`, project `.claude/`, local `.claude/...local.json`, managed | user `~/.gemini/`, workspace `<repo>/.gemini/`, managed | user `~/.pi/agent/`, project `.pi/` | user `~/.codex/` | user `~/.config/opencode/`, project `.opencode/`, managed |
| **Skills / knowledge system** | Full Agent Skills + progressive disclosure + hooks-in-frontmatter + `paths:` | Agent Skills | `skills/` dir; PI events can discover more | `.codex/skills/` (undocumented format) | Agent Skills; **also reads Claude Code skill dirs** |
| **SDK for building extensions** | `@anthropic-ai/claude-code` SDK (Python + TS), hooks are language-agnostic stdio/http | ad-hoc JS via MCP SDK | `@mariozechner/pi-coding-agent` typed API | MCP SDK only | opencode SDK `client` + Bun `$` + TS types |
| **LSP servers as a plugin type** | Yes — `.lsp.json`, pyright/typescript/rust plugins in marketplace | No | No | No | LSP events exposed, not packaged as plugin LSP |
| **Monitors / background tasks** | Yes — `monitors.json` | No | Yes (via extension events + `setInterval`) | No | No formal monitor abstraction |
| **Channel / message injection** | Yes — `channels` in plugin manifest, requires `channelsEnabled` managed setting | No | No | No | No |
| **Kill-switches** | `disableAllHooks`, `disableSkillShellExecution`, managed allow/denylists for MCP and plugins, `forceLoginMethod` | `excludeTools`, `--scope` flags | Feature flags via `pi.registerFlag` | `approval_mode` per MCP tool | `permission` in config, `tools: { x: false }` |

---

## 7. Interoperability

### 7.1 Can you write a plugin once and have it work across all 5? (Short answer: No)

No single artifact runs on all five. The closest thing to a common substrate is:

1. **MCP servers** — supported by all five. A well-designed MCP server is the most
   portable unit of agent tooling today.
2. **Agent Skills open standard** (`SKILL.md` with YAML frontmatter, `name` +
   `description` required) — explicitly supported by Claude Code and opencode, used by
   Codex on-disk, mentioned by Gemini. PI has a `skills/` directory but its schema is
   tighter to its own types. A skill written to the minimal common subset
   (`name`, `description`, markdown body only) loads in Claude Code and opencode
   verbatim, and works in Gemini with a file move.
3. **`AGENTS.md`** as a shared context file — read directly by PI, Codex, opencode;
   Claude Code needs a `@AGENTS.md` import from `CLAUDE.md`; Gemini uses `GEMINI.md`
   but can be pointed elsewhere via `contextFileName`.

Nothing else transfers directly. Hooks, commands, plugin manifests, and event schemas
are all incompatible at the schema level.

### 7.2 What *is* shared across hook event schemas?

Common fields across Claude Code / Gemini / PI / opencode tool-execution events:

| Concept | Claude Code | Gemini CLI | PI | opencode |
|---------|-------------|------------|-----|----------|
| Tool name | `tool_name` | `toolName` | `toolName` | `input.tool` |
| Tool input | `tool_input` | `toolInput` | `input` | `output.args` |
| Call id | `tool_use_id` | `toolCallId` | `toolCallId` | implicit |
| Session id | `session_id` | `sessionId` / `conversationId` | session scoped to ctx | `session.id` |
| CWD | `cwd` | `cwd` (implicit) | `ctx.cwd` | `directory` |
| Decision (block) | `hookSpecificOutput.permissionDecision` OR exit 2 | exit 2 | return `{block:true}` | throw Error |
| Reason string | `permissionDecisionReason` / `reason` | depends on event | `reason` on return | Error message |

Every system has **tool name, tool input, a way to block, and a CWD**. Everything else
(session ids, permission dialogs, subagent ids, compaction hooks, worktree hooks,
elicitations) is runtime-specific.

### 7.3 Recommended abstraction for Fulcrum

If Fulcrum wants to integrate with all five deeply:

- **Ship core functionality as an MCP server.** Required. The 80% of functionality
  that works across all targets.
- **For Claude Code:** also ship a plugin that bundles the MCP server + hooks
  (`PreToolUse` for policy enforcement, `SessionStart` for env injection,
  `InstructionsLoaded` for debugging context loads) + skills + subagents. This is the
  richest integration point and most of Fulcrum's differentiation lives here.
- **For Gemini CLI:** ship an extension that just wraps the same MCP server with a
  `gemini-extension.json` + a `GEMINI.md` pointing at a minimal set of skills.
- **For PI:** write a TS extension that registers a command entry point, subscribes
  to `tool_call` for policy, and mounts the MCP server via settings. Distribute as an
  npm package so `pi install npm:fulcrum-pi-ext` works.
- **For Codex:** MCP server only. Nothing else is installable.
- **For opencode:** a TS plugin that registers `tool.execute.before`/`after` handlers
  + a `SKILL.md` that also lives in `.claude/skills/` (opencode reads both).

**Abstraction layer:** the cleanest abstraction is a **policy engine** that consumes a
normalized `ToolCallEvent { toolName, input, sessionId, cwd, callId }` and returns a
normalized `Decision { allow | deny | ask | modify; reason; rewrittenInput? }`. Each
target gets a thin adapter that translates its native event shape into that normalized
form. Everything else (skills, commands, context files) is content, not code, and can
be duplicated into each target's preferred location at install time.

---

## 8. Standards checklist for Fulcrum audit

Every integration Fulcrum ships should be measured against these. MUSTs are
table-stakes for correctness and safety; SHOULDs improve UX; MAYs are nice-to-haves.

### 8.1 MUST

- **M1** Ship an MCP server as the primary tool surface. Every target supports stdio MCP.
- **M2** Declare the tool set in a schema the host runtime validates (JSON Schema for
  MCP, `Type.*` for PI, OpenAPI-ish for tool metadata).
- **M3** Use a stable tool naming prefix. For Claude Code/PI: `mcp__fulcrum__*`. For
  opencode/Gemini/Codex: `fulcrum_*` (underscore-separated).
- **M4** Ship a skill (`SKILL.md`) in the **Agent Skills common subset**: YAML
  frontmatter with only `name` (lowercase dashes, ≤64 chars) and `description` (≤1024
  chars), markdown body. Usable directly on Claude Code and opencode; portable to
  others with a copy.
- **M5** Have a `BeforeTool` / `PreToolUse` equivalent on every target that lets
  policies block destructive actions. For Codex this means wrapping in an MCP server
  that enforces its own approval logic (since Codex has no hooks).
- **M6** Write context files in both `AGENTS.md` and `CLAUDE.md` styles (or have
  `CLAUDE.md` `@import` `AGENTS.md`). Gemini users need a `GEMINI.md` symlink.
- **M7** Never use `../` path traversal in any plugin manifest — all five systems
  either forbid it outright or break on cache/install.
- **M8** Use `${CLAUDE_PLUGIN_ROOT}` / `${extensionPath}` / explicit TS paths — never
  hardcode `/home/...`.
- **M9** Version every manifest with semver. Claude Code's cache keys updates off
  `version`; a missing bump means existing users don't see changes.
- **M10** Declare all required environment variables up front via the target's
  user-config mechanism (`userConfig` for Claude Code plugins, `settings` entries
  in Gemini, `pi config` entries for PI, `provider` blocks in opencode).

### 8.2 SHOULD

- **S1** Provide at least one slash command per workflow (`/fulcrum-*`) — all targets
  except Codex support them with roughly equivalent UX.
- **S2** Provide a subagent definition for Claude Code and opencode with strict
  `tools:` / `disallowedTools:` lists. Subagents are the best UX for "focused, isolated
  task" on those two platforms.
- **S3** Use path-scoped rules (`paths:` frontmatter in Claude Code rules, per-skill
  `paths` field) so instructions only load when relevant files are open.
- **S4** Register lifecycle hooks with deterministic exit semantics — prefer exit-2 /
  blocking returns over JSON decision objects where possible; they're easier to debug.
- **S5** Declare `$CLAUDE_ENV_FILE` writes (Claude Code) or equivalent to set session
  env vars rather than exporting them from hook stdout.
- **S6** For Claude Code, provide both `user` and `project` scope installation paths
  so teams can pin Fulcrum at the project level.
- **S7** Ship a `hooks/hooks.json` or Gemini `hooks/hooks.json` for PostToolUse
  observability (telemetry, audit log, etc.).
- **S8** Provide a validator/linter that runs against every target's manifest (Claude:
  `claude plugin validate`; Gemini: `gemini extensions new --template`; opencode:
  config parser).

### 8.3 MAY

- **m1** Bundle an LSP server — only Claude Code currently packages LSP as a first-class
  plugin component. Useful for language-specific ergonomics but not required.
- **m2** Use monitors (Claude Code only) for background watchers.
- **m3** Use channels / message injection (Claude Code only) for push notifications
  from CI or remote processes.
- **m4** Support progressive disclosure via Claude Code skill supporting files
  (`reference.md`, `examples.md`).
- **m5** Provide an opencode plugin that reads `.claude/skills/` directly (opencode
  already does this), dual-purposing one skill tree across two runtimes.
- **m6** Expose telemetry through each target's OTEL env-var scheme where available.
- **m7** Ship theme files for Gemini CLI and PI where branding matters.

---

## 9. References

### Claude Code
- Docs hub: https://code.claude.com/docs/en/overview
- Hooks: https://code.claude.com/docs/en/hooks
- Skills: https://code.claude.com/docs/en/skills
- MCP: https://code.claude.com/docs/en/mcp
- Slash commands: https://code.claude.com/docs/en/slash-commands
- Sub-agents: https://code.claude.com/docs/en/sub-agents
- Settings: https://code.claude.com/docs/en/settings
- Memory / CLAUDE.md: https://code.claude.com/docs/en/memory
- Plugins reference: https://code.claude.com/docs/en/plugins-reference
- Agent Skills standard: https://agentskills.io

### Gemini CLI
- Main repo: https://github.com/google-gemini/gemini-cli
- Extension reference: https://geminicli.com/docs/extensions/reference/
- Writing extensions: https://geminicli.com/docs/extensions/writing-extensions/
- Getting started: https://geminicli.com/docs/extensions/getting-started-extensions/
- MCP servers: https://geminicli.com/docs/tools/mcp-server/
- Google-hosted docs mirror: https://google-gemini.github.io/gemini-cli/docs/extensions/
- Community guide: https://gist.github.com/tanaikech/0a1426535ab3af0c68cf8d79bca770a0

### PI (pi-coding-agent / pi-mono)
- npm package: https://www.npmjs.com/package/@mariozechner/pi-coding-agent
- Repo: https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent
- Extensions docs: https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md
- README: https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/README.md
- Mirror: https://hochej.github.io/pi-mono/coding-agent/extensions/

### Codex CLI (OpenAI)
- Repo: https://github.com/openai/codex
- Skills dir: https://github.com/openai/codex/tree/main/.codex/skills

### opencode (sst)
- Repo: https://github.com/sst/opencode
- Docs home: https://opencode.ai/docs/
- Plugins: https://opencode.ai/docs/plugins/
- Agents: https://opencode.ai/docs/agents/
- Commands: https://opencode.ai/docs/commands/
- Skills: https://opencode.ai/docs/skills/
- Config: https://opencode.ai/docs/config/
- Rules: https://opencode.ai/docs/rules/
