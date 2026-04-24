# Plugin & Extension Standards Per Agent Harness

Research for Fulcrum's per-host integration upgrade. Captures the standard each harness exposes in 2026 so we can standardize across `/home/mkh/workspace/pi-stack-plan/agent-integration/*`.

Primary sources: Claude (https://code.claude.com/docs/en/), Gemini CLI (in-tree `docs/` at google-gemini/gemini-cli), Codex (https://developers.openai.com/codex/), OpenCode (https://opencode.ai/docs/ + `sst/opencode/packages/plugin/src/index.ts`), Copilot (docs.github.com/copilot/), Pi (local). `[verified]` = doc/file fetched; `[unverified]` = secondary source.

---

## Cross-cutting principles

**MCP is the convergence layer.** All six harnesses either (a) ship an MCP
client or (b) treat MCP as the interop surface. Stdio is universal; HTTP/SSE is
available everywhere but Pi. Per-server tool filtering is emerging (OpenCode has
per-agent glob enable/disable; Codex has per-tool `approval_mode`; Claude Code
supports `settings.json` allow/deny per tool) — Fulcrum's own `--mode filtered
--runtime-capability hooks` is philosophically aligned but only wired on one
host at a time.

**Skills-as-directory-of-markdown is the other convergence point.** Every
harness except Copilot-Chat-only now understands `<root>/skills/<name>/SKILL.md`
with YAML frontmatter (`name`, `description`, optional `license`,
`argument-hint`, `disable-model-invocation`). OpenCode, Claude Code, Codex, and
VS Code Copilot Agent Skills all fall back to `.agents/skills/` as a
cross-agent shared location [verified]. This is the single biggest leverage
point: one skill library, six consumers.

**Hooks cluster into four universal events.** Every harness has some variant
of (1) session-start, (2) pre-tool, (3) post-tool, (4) session-end/stop. Claude
Code has the richest taxonomy (~26 events); OpenCode has event-bus style
("event") with ~25 sub-events; Gemini has 11 named events; Codex hooks are
still feature-flagged (`features.codex_hooks`) as of April 2026. Payload
transport is stdio JSON in every harness except OpenCode (TypeScript callback)
and Pi (native TS module).

**CLI-first (`fulcrum action exec ...`) works on all six hosts** because every
one of them exposes `Bash` or an equivalent shell tool. The only host where
CLI-first is *suboptimal* rather than unworkable is GitHub Copilot Chat in its
pure chat form (no direct shell) — there the MCP-install or
Copilot-Extension-install fallback is required, and Copilot CLI / agent mode
handle Bash natively.

---

## Claude Code

### Plugin / extension structure [verified]

Manifest at `<plugin-root>/.claude-plugin/plugin.json`. Only `plugin.json` lives
inside `.claude-plugin/`; every other directory sits at plugin root.

Canonical layout:

```
my-plugin/
  .claude-plugin/plugin.json      # required manifest
  skills/<name>/SKILL.md          # model-invoked skills
  commands/*.md                   # user-invoked slash commands (legacy flat)
  agents/*.md                     # sub-agent definitions
  hooks/hooks.json                # event handlers
  .mcp.json                       # MCP servers
  .lsp.json                       # LSP servers
  monitors/monitors.json          # background watchers
  bin/                            # added to Bash PATH while plugin enabled
  settings.json                   # default settings (currently only `agent`, `subagentStatusLine`)
```

`plugin.json` required fields: `name`, `description`, `version`. Optional:
`author{name,email,url}`, `homepage`, `repository`, `license`, `keywords`.

### Hook taxonomy [verified]

Claude Code ships 24+ events. Payloads arrive on stdin as JSON; hook returns
JSON on stdout. Exit 2 = deprecated block form (use JSON `decision: "block"`).
All tool-targeted events support a `matcher` field (regex of tool names).

Key events (B = can block, C = can inject context, M = matcher-based):

| Event | Fires | B | C | M |
|---|---|---|---|---|
| `SessionStart` | session open/resume/clear/compact | — | yes (`additionalContext`) | source |
| `SessionEnd` | session terminates | — | — | reason |
| `UserPromptSubmit` | before prompt processed | yes | yes | — |
| `PreToolUse` | before tool runs | yes (`permissionDecision: allow/deny/ask/defer`) | yes | tool |
| `PostToolUse` | after tool succeeds | soft | yes (+`updatedMCPToolOutput`) | tool |
| `PostToolUseFailure` | after tool error | — | yes | tool |
| `PermissionRequest` | permission dialog | yes | — | tool |
| `Notification` | CC notification | — | yes | type |
| `SubagentStart` / `SubagentStop` | subagent lifecycle | Stop | Start | agent_type |
| `TaskCreated` / `TaskCompleted` | TaskCreate tool | yes | — | — |
| `Stop` / `StopFailure` | turn ends | Stop | — | StopFailure:error_type |
| `CwdChanged` / `FileChanged` | dir/file change | — | — | FileChanged |
| `WorktreeCreate` / `WorktreeRemove` | worktree lifecycle | Create | — | — |
| `ConfigChange` | settings file changes | yes (not policy) | — | source |
| `PreCompact` / `PostCompact` | compaction | Pre | — | trigger |
| `Elicitation` / `ElicitationResult` | MCP elicitation | yes | — | server |
| `TeammateIdle` | team teammate about to idle | yes | — | — |
| `InstructionsLoaded` | CLAUDE.md/rule file loaded | — | — | load_reason |

### Skills / commands [verified]

- Skills: `skills/<name>/SKILL.md` with frontmatter `description`,
  `disable-model-invocation?`, `argument-hint?`. Body = instruction text.
  `$ARGUMENTS` placeholder captures user text. Plugin skills are namespaced
  (`/my-plugin:hello`); standalone `.claude/skills/` skills are not.
- Slash commands: legacy `commands/*.md` (flat markdown), frontmatter-driven;
  new code should use `skills/`.
- Sub-agents: `agents/*.md` with frontmatter `name`, `description`, `model`,
  `tools: { allowed, denied }`.

### MCP integration [verified]

Project `.mcp.json` (user) or plugin-root `.mcp.json` (distribution). Schema:
`{ mcpServers: { <name>: { command, args, env?, url? } } }`. Stdio + HTTP
both supported. Per-tool allow/deny in `settings.json`
(`permissions.allow/deny`).

### Native tool surface [verified]

Bash, Read, Write, Edit, Glob, Grep, WebFetch, WebSearch, Agent (sub-agent
dispatcher), AskUserQuestion, ExitPlanMode, Monitor (background watcher),
NotebookEdit. MCP tools namespaced `mcp__<server>__<tool>`. All available to
plugin-defined sub-agents via `tools.allowed`.

### Authentication / identity

Session identified by `session_id` (injected in every hook payload) and
`transcript_path`. User auth via `claude login`. No per-plugin auth surface —
plugins piggyback on the user session. Env-file handoff for CwdChanged /
FileChanged / SessionStart via `CLAUDE_ENV_FILE`.

### Lifecycle [verified]

- Install: `/plugin install` (from marketplace) or `--plugin-dir <path>` for
  dev. When a `--plugin-dir` plugin shares a name with an installed marketplace
  plugin, the local copy wins (except force-enabled managed settings).
- Hot reload: `/reload-plugins` picks up changes to skills, agents, hooks, MCP
  servers, LSP servers without restart.
- Uninstall: `/plugin uninstall`.

### Configuration format

JSON everywhere (`plugin.json`, `.mcp.json`, `hooks/hooks.json`,
`settings.json`, `.lsp.json`, `monitors/monitors.json`). Skills/commands use
markdown with YAML frontmatter.

### Distribution [verified]

Official marketplace submission at claude.ai/settings/plugins/submit and
platform.claude.com/plugins/submit. Team marketplaces are repos. CLI prompt
install via `plugin-hints`.

### Agent SDK / custom agents [verified]

`@anthropic-ai/claude-agent-sdk` (TS) and `claude-agent-sdk` (Python).
Exposes `query()` with `ClaudeAgentOptions` for: `allowedTools`, `mcpServers`,
`hooks`, `agents` (subagent definitions), `permissionMode`, `resume`,
`settingSources`. SDK loads `.claude/` settings by default. Supports Bedrock,
Vertex, Azure via env vars.

### Fulcrum's current integration vs. the standard

Inspected: `agent-integration/claude/{CLAUDE.md, .mcp.json, settings-hooks-snippet.json, agents/*.md (24), commands/*.md (4)}`. We have MCP wired (stdio, no filter), 5 hooks (SessionStart/Stop/PreCompact/PreToolUse/PostToolUse all with `*` matcher), 24 sub-agent roles, 4 flat commands, a memory file.

### Gaps Fulcrum should close

- No `.claude-plugin/plugin.json` manifest — we ship standalone `.claude/`-style, not a bundled plugin. Blocks `/plugin install`, marketplace, namespacing.
- No `skills/` dir — `commands/` (legacy flat) forces user to type `/fulcrum-*`; nothing is model-invoked.
- Missing hooks: `UserPromptSubmit` (inject workspace context pre-plan), `SessionEnd` (definitive terminator), `SubagentStart`/`SubagentStop` (Fulcrum's model IS agent runs), `Notification` (surface blockers), `TaskCreated` (sync TodoWrite → Fulcrum tasks).
- `PreToolUse`/`PostToolUse` matchers are `*` — scope to write-ish tools (`Bash|Write|Edit|MultiEdit|Task|NotebookEdit`).
- `settings.json` ships nothing — could set default `agent` (chief_of_staff) and `subagentStatusLine`.
- MCP server isn't role-filtered at install — `mcp.json` hard-codes `fulcrum serve mcp` with no `--profile <role>`.

---

## Gemini CLI

### Plugin / extension structure [verified]

Manifest `gemini-extension.json` at extension root. Install via
`gemini extensions install <github-url>` or `/extensions list` in the TUI.

Top-level fields we observed in our own manifest: `name`, `version`,
`description`, `contextFileName` (which markdown file is auto-loaded —
defaults to `GEMINI.md`), `mcpServers`. Extension gallery at
https://geminicli.com/extensions/browse/.

### Hook taxonomy [verified]

Configured in `settings.json` (`.gemini/settings.json` project, `~/.gemini/
settings.json` user, `/etc/gemini-cli/settings.json` system, or via an
extension). Hooks are **synchronous** — agent loop waits. Events:

| Event | When | Impact |
|---|---|---|
| `SessionStart` | session begins | inject context |
| `SessionEnd` | session ends | advisory |
| `BeforeAgent` | after user prompt, before planning | block turn / inject context |
| `AfterAgent` | agent loop ends | retry / halt |
| `BeforeModel` | before LLM request | block / mock / rewrite prompt |
| `AfterModel` | after LLM response | redact / block / log |
| `BeforeToolSelection` | before LLM picks tools | filter available tools |
| `BeforeTool` | before tool runs | block / rewrite args |
| `AfterTool` | after tool runs | block result / inject context |
| `PreCompress` | before context compression | advisory |
| `Notification` | system notification | advisory |

Golden rule: stdout must be JSON-only (silence → break). Debug on stderr. Exit
0 = parse stdout as JSON; exit 2 = system block (stderr = rejection reason);
other = warning, proceed. Matchers: tool events use regex; lifecycle events
use exact strings; `"*"` or `""` = all.

Env passed: `GEMINI_PROJECT_DIR`, `GEMINI_PLANS_DIR`, `GEMINI_SESSION_ID`,
`GEMINI_CWD`, `CLAUDE_PROJECT_DIR` (compat alias).

### Skills / commands [verified]

- Extensions bundle "agent skills" and commands.
- Commands: TOML format in our current `agent-integration/gemini/commands/
  *.toml`. Schema: `prompt` field with `{{args}}` / `!{shell}` templating.
- Skills: `skills/<name>/SKILL.md` (markdown + frontmatter). Our current
  skills use only `name` + `description`, which is correct.

### MCP integration [verified]

Bundled in `gemini-extension.json.mcpServers`. Same shape as Claude:
`command`, `args`, `env`. Stdio is the documented path.

### Native tool surface

Bash/`run_shell_command`, `read_file`, `write_file`, `replace`, `glob`,
`search_file_content`, `web_fetch`, `google_web_search` — available to every
agent.

### Authentication / identity

Google auth (`gemini auth login`) at the CLI level. Session identity via
`GEMINI_SESSION_ID` env in hooks. No per-extension auth.

### Lifecycle

- Install: `gemini extensions install <url>` or local path.
- Manage: `/extensions list|enable|disable` (TUI) or `gemini extensions`
  (shell).
- Fingerprinting: project-level hooks are fingerprinted; changes prompt for
  trust re-approval.
- Hot reload: `/hooks` TUI sub-panel supports enable/disable without restart.

### Configuration format

JSON (extension manifest, settings.json, hooks config). TOML for commands.

### Distribution [verified]

Extension gallery at geminicli.com/extensions/browse/. Installs from any
GitHub URL.

### Agent SDK / custom agents

No documented public SDK equivalent to Claude's `claude-agent-sdk`. Gemini CLI
is consumed as a harness, not as a library. Sub-agents are bundled within
extensions.

### Fulcrum's current integration vs. the standard

Inspected: `agent-integration/gemini/{gemini-extension.json, hooks/hooks.json, commands/*.toml (6), skills/*/SKILL.md (6), agents/*.md (2), GEMINI.md}`. Manifest has `mcpServers` (filtered + hooks-capable). Hooks: `SessionStart`, `BeforeAgent`, `BeforeTool`, `AfterTool`, `SessionEnd` (all matcher `*`). 6 TOML commands, 6 skills, only 2 agent role files (vs Claude's 24).

### Gaps Fulcrum should close

- Missing hooks: `BeforeModel`/`AfterModel` (secret redaction + prompt injection), `BeforeToolSelection` (role-based tool menu), `AfterAgent` (proper run-complete signal — we abuse `SessionEnd`), `PreCompress` (memory checkpoint before compression loses state), `Notification`.
- Only 2 agent files vs Claude's 24 — port the role set.
- No default `settings.json` — extensions can pre-set default agent.
- `BeforeTool`/`AfterTool` matchers are `*` — scope to write-ish tools.
- Hooks are in a separate `hooks/hooks.json`, not in `gemini-extension.json` — consolidate per extension spec.

---

## Codex CLI

### Plugin / extension structure [verified]

Manifest at `<plugin-root>/.codex-plugin/plugin.json`. Plugin marketplace
launched March 27, 2026 (Slack, Figma, Notion, Sentry ship plugins at launch).

Directory:

```
my-plugin/
  .codex-plugin/plugin.json
  skills/<name>/SKILL.md
  .mcp.json
  .app.json                # ChatGPT connector mappings
  assets/
```

Manifest fields: `name` (kebab), `version`, `description`, `skills` (path),
`mcpServers` (path to `.mcp.json`), `apps` (path to `.app.json`), `author`,
`homepage`, `repository`, `license`, `keywords`, `interface` object with
`displayName`, `shortDescription`, `longDescription`, `developerName`,
`category`, `capabilities`, `websiteURL`, `privacyPolicyURL`,
`termsOfServiceURL`, `defaultPrompt[]`, `brandColor`, `composerIcon`, `logo`,
`screenshots`.

Marketplace JSON at `$REPO_ROOT/.agents/plugins/marketplace.json` (repo) or
`~/.agents/plugins/marketplace.json` (personal). Each entry needs
`source.source` (`"local"` | `"git"` | `"url"`), `source.path` (relative
starting with `./`), `policy.installation` (`AVAILABLE` |
`INSTALLED_BY_DEFAULT`), `policy.authentication` (`ON_INSTALL` |
`ON_FIRST_USE`), `category`.

Install: `codex marketplace add <url-or-path>` then `codex plugin install
<name>`. Catalogs resolved in order: official OpenAI > repo `.agents/plugins/
marketplace.json` > user `~/.agents/plugins/marketplace.json`.

### Hook taxonomy [unverified — under development]

Per `/codex/config-reference`, `features.codex_hooks` is a boolean feature
flag, **off by default**, marked "under development" as of April 2026. The
reference mentions a `hooks.json` file but no public schema. Our current
`codex/config.toml` uses `[[hooks]]` TOML entries with `event = "SessionStart"
| "PreToolUse" | "PostToolUse" | "Stop"` — these names are taken from our
in-house `fulcrum hook codex` wiring, not from official Codex docs. Treat as
beta.

Separately documented: `notify` hook — Codex runs a notification command when
the agent finishes a turn. Config key `notify` in `~/.codex/config.toml`;
legacy payload includes top-level `client` field (`codex-tui` or
`clientInfo.name` from app-server `initialize`).

### Skills / commands [verified]

Skills: `SKILL.md` with frontmatter `name`, `description`. Discovery scans
`.codex/skills`, `~/.codex/skills`, `.agents/skills`, `~/.agents/skills`,
system locations, bundled system skills. Progressive disclosure: metadata
loaded always, body loaded on selection. Explicit (`$skill-name`) and
implicit activation.

Slash commands: `docs/slash_commands.md` in `openai/codex` defers to
https://developers.openai.com/codex/cli/slash-commands — format is markdown
with frontmatter, discovered from `.codex/commands/` and the active
plugin set.

### MCP integration [verified]

`~/.codex/config.toml`:

```toml
[mcp_servers.<name>]
command = "..."
args = [...]
env = { ... }
default_tools_approval_mode = "approve" | "prompt" | "deny"

[mcp_servers.<name>.tools.<tool_name>]
approval_mode = "prompt"
```

Per-tool approval modes is a feature **only Codex** has; it's a strictly
better hook-less policy surface than Claude/Gemini/OpenCode. Stdio + HTTP
supported (HTTP uses reqwest + custom CA via `CODEX_CA_CERTIFICATE`).

Register MCP via `codex mcp add <name> -- <command> [args]`.

### Native tool surface

Bash / shell, read/write/patch, grep-like search. Codex is Rust-based
(`codex-rs/`), not JS.

### Authentication / identity

Codex auth via `codex login` (ChatGPT / OpenAI account). SQLite-backed state
at `$sqlite_home` / `$CODEX_SQLITE_HOME`. No per-plugin auth; apps
(connectors) use ChatGPT's OAuth layer.

### Lifecycle

- Install: `codex plugin install <name>` or `codex marketplace add <src>`.
- Marketplace add supports GitHub, git URLs, local dirs, direct marketplace.json
  URLs.
- Hot reload: `/reload` in TUI (not yet verified for plugin hot-swap).

### Configuration format

TOML (`~/.codex/config.toml`, marketplace entries are JSON).

### Distribution [verified]

Official OpenAI directory (self-serve publishing "coming soon" as of April
2026); repo marketplace; user marketplace. 20+ plugins at launch (Slack,
Figma, Notion, Sentry).

### Agent SDK / custom agents

Codex ships an SDK folder (`sdk/` in the repo) but public agent-SDK docs are
not yet published on developers.openai.com for custom agent construction.
Codex exposes an app-server protocol (`clientInfo.name` in `initialize`) that
third parties can implement — Fulcrum could present itself as a Codex
app-server client.

### Fulcrum's current integration vs. the standard

Inspected: `agent-integration/codex/{AGENTS.md, config.toml, marketplace.json, plugin/.codex-plugin/plugin.json, plugin/.mcp.json, plugin/skills/*/SKILL.md (6)}`. We have a partial plugin bundle — `plugin.json` matches the published schema well.

### Gaps Fulcrum should close

- `marketplace.json` has `PLACEHOLDER_PLUGIN_PATH` — replace with `./plugin`.
- No `.app.json` — register Fulcrum as a ChatGPT composer `$` connector.
- `[[hooks]]` block is speculative — Codex hooks are feature-flagged (`features.codex_hooks = false` by default). Gate install on detection.
- Missing `notify` hook — Codex's STABLE turn-end signal, documented. Wire as primary run-complete, `Stop` as fallback.
- Unused per-tool `approval_mode` — `[mcp_servers.fulcrum.tools.invoke_team] approval_mode = "prompt"` replaces hook-based team-invoke policy.
- Plugin `plugin.json` lists `skills` but not `mcpServers` pointer — add `"mcpServers": "./.mcp.json"` so the bundle carries MCP config through distribution.
- Skills live at `plugin/skills/` only — symlink to `.agents/skills/` for pre-install use.

---

## OpenCode (sst)

### Plugin / extension structure [verified]

No single "manifest" — plugins are TypeScript files auto-loaded from:
- `.opencode/plugins/*.ts` (project)
- `~/.config/opencode/plugins/*.ts` (global)

Also registrable in `opencode.json.plugin[]` as an array of paths or npm
package names.

### Hook taxonomy [verified — from `sst/opencode/packages/plugin/src/index.ts`]

Plugin exports a default async function returning a `Hooks` object. Every
hook is a TypeScript callback (not stdio). Full list:

| Hook | Purpose |
|---|---|
| `event` | general event bus receiver (see sub-events below) |
| `config` | observe resolved config |
| `tool` | register custom tools (returns `{[name]: ToolDefinition}`) |
| `auth`, `provider` | register auth / LLM providers |
| `chat.message`, `chat.params`, `chat.headers` | mutate outgoing LLM call |
| `permission.ask` | `Permission → {status: ask\|deny\|allow}` |
| `command.execute.before` | slash command interception |
| `tool.execute.before` | pre-tool, can mutate args via return |
| `tool.execute.after` | post-tool, can rewrite output/metadata |
| `shell.env` | inject env vars for shell calls |
| `tool.definition` | dynamic tool description |
| `experimental.chat.system.transform` | append/rewrite system prompt |
| `experimental.chat.messages.transform` | rewrite message history |
| `experimental.session.compacting` | inject context before compression |
| `experimental.compaction.autocontinue` | control auto-continue on overflow |
| `experimental.text.complete` | lowest-level completion hook |

Event-bus sub-events (via `event` hook): `command.executed`, `file.edited`, `file.watcher.updated`, `installation.updated`, `lsp.*`, `message.*`, `permission.asked/.replied`, `server.connected`, `session.{created, compacted, deleted, diff, error, idle, status, updated}`, `todo.updated`, `tui.{prompt.append, command.execute, toast.show}`.

Hooks are TS callbacks — throw to hard-block.

### Skills / commands [verified]

- Skills: `.opencode/skills/<name>/SKILL.md` (project) or
  `~/.config/opencode/skills/<name>/SKILL.md` (global). Also reads
  `.claude/skills/` and `.agents/skills/` for cross-agent portability. Name
  regex: `^[a-z0-9]+(-[a-z0-9]+)*$` (1-64 chars). Discovery walks up from
  cwd to git worktree root, plus global dirs.
- Commands: `.opencode/commands/*.md` (project) or
  `~/.config/opencode/commands/*.md` (global). Frontmatter + body as
  template. `$ARGUMENTS`, `$1..$N` for positional args. Shell injection
  via `!`command`` and file references via `@filename`.

### MCP integration [verified]

`opencode.json.mcp.<name>`:
```json
{
  "type": "local" | "remote",
  "command": ["cmd", "arg1", ...],   // local
  "url": "https://...",              // remote
  "enabled": true,
  "headers": { ... },                // remote
  "env": { ... }                     // local
}
```
Automatic OAuth with DCR for remote. Per-agent glob enable/disable.

### Native tool surface

Bash, read, write, edit, glob, grep, todowrite, task (subagent), webfetch.
Plus TUI/LSP events. Plugins can register **custom tools** via the `tool`
hook returning a tool map — Fulcrum's current plugin does this for 10 tools.

### Authentication / identity

Auth provider registered via `auth` hook (for LLM providers). Session
identity via `sessionID` in every hook payload + `OPENCODE_SESSION_ID` env.
No per-plugin user auth.

### Lifecycle

- Install: drop `*.ts` into `.opencode/plugins/` or add to
  `opencode.json.plugin[]` as path/npm name.
- TypeScript loaded natively.
- Hot reload: not documented; assume restart for new plugins.

### Configuration format

JSON/JSONC for `opencode.json`; TS for plugins; Markdown (+ YAML frontmatter)
for skills and commands.

### Distribution [verified]

No dedicated marketplace. Distribution is npm packages (`opencode-plugin-*`)
or git repos. The "5,400+ skills" number cited in the task prompt is
**unverifiable** from official docs — downgrade the claim to "OpenCode reads
the shared `.agents/skills/` ecosystem, which is large."

### Agent SDK / custom agents

OpenCode supports multiple built-in agents (`build`, `plan`) swappable via
Tab. Custom agents configured via `AGENTS.md` auto-loaded at session start;
structured sub-agents defined in config.

### Fulcrum's current integration vs. the standard

Inspected: `agent-integration/opencode/{opencode.jsonc, plugins/fulcrum.ts (320 LOC), command/*.md (5), opencode.md}`. TS plugin uses `experimental.chat.system.transform`, `shell.env`, `tool.execute.before/after`, `permission.ask`, and registers 10 custom tools.

### Gaps Fulcrum should close

- `command/` (singular) vs docs' `commands/` (plural) — verify and rename.
- No `skills/` dir — no model-invoked `SKILL.md`s; parity with Codex/Claude.
- `event` bus unused — subscribe `session.idle`, `session.compacted`, `todo.updated` for auto-heartbeat / auto-checkpoint / task sync.
- `experimental.session.compacting` unused — memory checkpoint before compression.
- `tool.definition` unused — role-aware tool descriptions.
- Plugin shells out to `fulcrum hook auto` for every non-fulcrum tool including Read/Glob/Grep — add in-plugin allowlist; saves ~10-40ms × every tool call.
- Not published on npm — users must clone repo.

---

## GitHub Copilot

### Plugin / extension structure

Copilot has three distinct extension surfaces, pick one per feature:

1. **MCP servers** — configured in `.vscode/mcp.json` (repo-shared) or
   user `settings.json` (personal). Shape:
   ```json
   {
     "servers": {
       "fulcrum": {
         "command": "fulcrum",
         "args": ["serve", "mcp"]
       }
     }
   }
   ```
   Remote MCP uses `{ "url": "https://..." }`. Registry at
   github.com/mcp. Supported clients: VS Code 1.99+, Visual Studio 17.14+,
   JetBrains, Xcode, Eclipse 2024-09+, Copilot CLI, Copilot cloud agent
   [verified].

2. **Copilot Extensions (GitHub App based)** — two flavors:
   - **Agents**: full GitHub App. Users invoke via `@your-agent` in Chat.
     Communication is server-sent events (SSE) over HTTPS. Requests receive
     `X-GitHub-Token` header with a scoped GitHub API token. Callback URL
     configured in GitHub App settings. Agent sends `confirmation`, `status`,
     `reference`, `text` SSEs; platform sends `resp_message` SSE with user
     messages.
   - **Skillsets**: lightweight alternative. Developer defines up to ~5 API
     endpoints as "skills"; GitHub handles routing, prompt crafting,
     function-call evaluation, response generation. No AI expertise required
     on developer side. Still a GitHub App.

3. **Agent Skills (VS Code)** — NEW, announced Dec 2025 ("GitHub Copilot
   now supports Agent Skills" changelog). Shares the `SKILL.md` format and
   shared `.agents/skills/` directory with Claude/Codex/OpenCode. Locations:
   - Project: `.github/skills/`, `.claude/skills/`, `.agents/skills/`
   - Personal: `~/.copilot/skills/`, `~/.claude/skills/`, `~/.agents/skills/`
   - Configurable via `chat.agentSkillsLocations` VS Code setting.
   Frontmatter: `name`, `description`, `argument-hint?`, `user-invocable?`,
   `disable-model-invocation?`.

### Hook taxonomy

**No plugin-side hook surface equivalent to Claude/Gemini.** Extensions
integrate via HTTP callbacks (SSE) or by being tools/MCP. Observability is
via GitHub App webhooks (install/uninstall/permissions-changed) at the
platform boundary, not per-turn.

### Skills / commands

- Agent Skills (above) for model-invoked skills.
- `@participants` (extension agents) for explicit user invocation.
- Slash commands: `/help`, `/explain`, `/tests`, `/fix` are built in; custom
  `/commands` are registered via agent extension `capabilities`.

### MCP integration [verified]

As above — `.vscode/mcp.json` or user `settings.json`. MCP is the low-friction
path for custom tools. GitHub MCP Registry is the discovery surface.

### Native tool surface

Bash / Terminal (agent mode only — not Chat), file read/write/edit, VS Code
problem pane, debugger. Copilot Chat (no agent mode) does NOT have Bash —
this is the harness where CLI-first fails.

### Authentication / identity

GitHub OAuth via Copilot subscription. Agent extensions receive scoped
`X-GitHub-Token` per request. Cloud agent runs in a sandbox with limited
network. MCP server stdio inherits user's shell env.

### Lifecycle

- MCP install: manual (`.vscode/mcp.json` edit), VS Code command palette
  `MCP: Add Server`, or GitHub MCP Registry "Install in VS Code" button.
- Extension install: GitHub Marketplace (`github.com/marketplace/category/
  copilot-extensions`).
- Agent Skills: drop files in recognized dirs; reload window.
- Custom instructions: `.github/copilot-instructions.md` auto-loaded by Chat
  and cloud agent (Markdown, ≤2 pages recommended, no strict size schema).

### Configuration format

JSON (settings, mcp.json), YAML frontmatter + Markdown (skills, instructions),
OpenAPI/JSON for skillset definitions.

### Distribution

- MCP servers: GitHub MCP Registry (github.com/mcp).
- Copilot Extensions: GitHub Marketplace.
- Agent Skills: copied via repo or package.

### Agent SDK / custom agents

No dedicated agent SDK. Building an "agent" means building a Copilot Extension
(GitHub App + SSE agent) or a cloud-agent-side CLI extension.

### Fulcrum's current integration vs. the standard

**None.** There is no `agent-integration/copilot/` directory. Fulcrum has
zero Copilot presence.

### Gaps Fulcrum should close (ordered by leverage)

1. Ship an MCP-only integration (~30 min): `agent-integration/copilot/.vscode/mcp.json` wiring `fulcrum serve mcp --mode filtered`.
2. Share `agent-integration/skills/` across hosts (~1 hr) — Copilot Agent Skills read `.agents/skills/`; symlink once, all non-Pi hosts benefit.
3. Ship `.github/copilot-instructions.md` stub (~15 min) pointing at monitor URL and the `fulcrum` MCP server. No shell needed.
4. **Defer:** Copilot Extension (GitHub App + hosted HTTPS SSE endpoint) and Skillset — high infra cost, only needed for hosted Fulcrum-as-a-service.

**Copilot feasibility: YES at low cost** via MCP + shared Agent Skills + copilot-instructions.md. The GitHub App route is optional.

---

## Pi (Fulcrum's own cockpit)

Fulcrum IS the canonical Pi extension; there are no upstream docs to chase.
Registration is via `package.json.pi.extensions: ["./index.ts"]`.

### Canonical shape (for third-party Pi plugins)

```
my-pi-plugin/
  package.json    # { "pi": { "extensions": ["./index.ts"] } }
  index.ts        # default export: (api: ExtensionAPI) => void | Promise<void>
```

`ExtensionAPI` (from `@mariozechner/pi-coding-agent`) registers: native LLM tools, slash commands, dashboard widgets, footer status line, and tool-call hooks. Pi has a `BeforeTool` hook and lifecycle callbacks (`onRunStart`, `onHeartbeat`, `onRunComplete`, `onRunBlocked`, `onCoSDispatch`, `onStatusQuery`) that Fulcrum maps to native `fulcrum_*` tools. `fulcrum.extension.json` in our repo is a pseudo-manifest Pi does not read.

**Skills/commands:** 12 slash commands shipped in the cockpit (`/fulcrum-*` + `/cos`). No skills/ dir (Pi doesn't document one).

**MCP:** intentionally MCP-free in cockpit mode — 11 native `fulcrum_*` tools bypass MCP overhead. MCP is a fallback for non-cockpit environments.

**Identity:** `workspace_id`/`project_id` = sha256[:12] of cwd abspath (no file written); env overrides `FULCRUM_WORKSPACE_ID`, `FULCRUM_PROJECT_ID`, `FULCRUM_PORT`.

**Install/lifecycle:** `pi install ./path | git:<url> | npm:<name>`. Cockpit auto-spawns `fulcrum serve monitor` on session open, polls `/status` every 5s.

**Config format:** TS for extension; JSON for `package.json.pi.extensions`.

**Distribution:** not yet published on npm; git install from this repo works.

### Gaps

- `fulcrum.extension.json` is dead JSON — delete or upstream a real manifest schema.
- Not published on npm — blocks one-line install.
- No skills dir — adopt `.agents/skills/` if Pi adds support.
- Cockpit auto-spawns monitor but not `fulcrum serve mcp` — needed for sub-processed Claude sessions.

---

## Consolidated gap list

Legend: **H** = we have it; **P** = partial / incorrect; **M** = missing.

| Surface | Claude | Gemini | Codex | OpenCode | Copilot | Pi |
|---|---|---|---|---|---|---|
| Plugin manifest | M (no `.claude-plugin/`) | H | P (placeholder path) | — (no manifest) | M | P (pseudo-manifest) |
| Hook bundle | P (`*` matchers, missing UserPromptSubmit/SessionEnd/SubagentStop/Notification/TaskCreated) | P (missing BeforeModel/AfterModel/BeforeToolSelection/AfterAgent/PreCompress/Notification) | P (speculative — Codex hooks are feature-flagged) | P (no `event`, `experimental.session.compacting`, `tool.definition`) | M | H (policy hook wired) |
| Skills dir | M | H (6 skills, add more) | P (skills exist but only in plugin/, not `.agents/skills/`) | M | M | — (not supported yet) |
| Commands dir | P (4 cmds vs Pi's 12) | H (6 cmds) | M | P (named `command/` not `commands/`) | M | H (12 cmds) |
| Sub-agent defs | H (24 roles) | P (2 roles) | M | M (no agent dir) | M | — |
| MCP server config | H | H (filtered+hooks) | H (filtered) | H (filtered) | M | — (MCP-free by design) |
| Per-tool approval / filter | M | M | M (feature exists, unused) | P (plugin-side gate for all tools; too coarse) | M | H (policy hook) |
| Settings defaults | M | M | M | M | M | — |
| Marketplace registration | M | M | P (placeholder) | M (no npm package) | M | M (no npm package) |
| Distribution channel | M | M | P | M | M | P |
| Custom-instructions file | H (CLAUDE.md) | H (GEMINI.md) | H (AGENTS.md) | H (opencode.md + AGENTS.md) | M (.github/copilot-instructions.md) | H (PI.md) |

---

## Recommendations for per-host upgrade (ordered by leverage)

### Tier 1 — do first (cheap × high leverage)

1. **Create shared `agent-integration/skills/` and symlink into each host.**
   One set of `SKILL.md` files. Consumed by Claude, Codex, OpenCode, Copilot
   Agent Skills (via `.agents/skills/`), Gemini (copy into
   `.gemini/skills/`). Estimated: 2 hrs.
   - Files to create: `agent-integration/skills/fulcrum-session-start/SKILL.md`,
     `fulcrum-start-task`, `fulcrum-complete-task`, `fulcrum-recall-before-
     writing`, `fulcrum-write-memory`, `fulcrum-chief-of-staff`.
   - Symlinks: `agent-integration/{claude,codex/plugin,opencode,copilot}/
     skills/` → `../skills/`.

2. **Fix Codex `marketplace.json` placeholder + publish skills under
   `.agents/skills/`.** 15 minutes.
   - Edit `agent-integration/codex/marketplace.json`: set `source.path`
     to `./plugin`.
   - Symlink `agent-integration/codex/plugin/skills/` to shared skills dir
     (tier 1 item 1).

3. **Ship Copilot MCP integration.** 30 minutes.
   - Create `agent-integration/copilot/.vscode/mcp.json` with
     `{ "servers": { "fulcrum": { "command": "fulcrum", "args": ["serve",
     "mcp", "--mode", "filtered"] } } }`.
   - Create `agent-integration/copilot/.github/copilot-instructions.md`
     with Fulcrum orientation text.

4. **Scope Claude/Gemini/OpenCode hook matchers.** 15 minutes × 3.
   - Claude `settings-hooks-snippet.json`: change `PreToolUse/PostToolUse`
     matcher from `*` to `Bash|Write|Edit|MultiEdit|Task|NotebookEdit`.
   - Gemini `hooks/hooks.json`: same narrowing for `BeforeTool/AfterTool`.
   - OpenCode `plugins/fulcrum.ts`: add in-plugin early-return for non-
     write tools in `tool.execute.before` / `tool.execute.after`.

### Tier 2 — do second (moderate × high leverage)

5. **Bundle Claude as an actual plugin.** Create
   `agent-integration/claude/.claude-plugin/plugin.json` and move
   `agents/`, `commands/`, shared `skills/`, `hooks/hooks.json` under the
   plugin root. This unlocks `/plugin install` distribution. 2 hrs.

6. **Wire the missing high-value hooks.** Per host:
   - Claude: add `UserPromptSubmit` (inject workspace context before planning),
     `SessionEnd` (definitive run terminator), `SubagentStart`/`SubagentStop`
     (track sub-agent runs as Fulcrum runs), `Notification`.
   - Gemini: add `BeforeModel` (secret redaction + workspace snapshot),
     `AfterAgent` (primary run-complete signal), `PreCompress` (memory
     checkpoint), `BeforeToolSelection` (role-based tool menu).
   - OpenCode: subscribe `event` hook to `session.idle`, `session.compacted`,
     `todo.updated`; implement `experimental.session.compacting` for
     memory checkpointing; use `tool.definition` for role-aware tool descs.
   - Codex: gate our `[[hooks]]` entries behind `features.codex_hooks = true`
     detection; wire `notify` as the stable turn-end signal.

7. **Per-tool Codex approval mode.** Replace hook-based team-invoke guard
   with `[mcp_servers.fulcrum.tools.invoke_team] approval_mode = "prompt"`
   in `config.toml`. 10 minutes.

### Tier 3 — do third (larger × targeted leverage)

8. **Publish npm packages.** `fulcrum-opencode-plugin`,
   `fulcrum-cockpit` (Pi). Enables one-line install. ~half day each.

9. **Gemini sub-agents parity.** Port the 24 Claude role definitions into
   `agent-integration/gemini/agents/`. 2 hrs.

10. **Codex `.app.json` connector mapping.** Register Fulcrum in the `$`
    composer menu. 1 hr.

11. **OpenCode: rename `command/` → `commands/`** to match docs. 2 minutes
    (verify opencode actually requires the plural).

### Tier 4 — defer

- **Copilot GitHub App Extension (agent or skillset)** — high effort, only
  needed for hosted-Fulcrum-as-a-service. MCP + Agent Skills + instructions
  file cover 80%+ of the value at <1% of the cost.
- **Claude `settings.json` default `agent` pre-selection** — nice polish but
  not critical.
- **Pi `fulcrum.extension.json` cleanup** — either delete the dead file or
  propose a real schema upstream to Pi.

---

## Appendix — source URLs

- Claude: https://code.claude.com/docs/en/{plugins, plugins-reference, skills, hooks, mcp, agent-sdk, sub-agents}
- Gemini (in-tree): `docs/extensions/index.md`, `docs/hooks/index.md` in https://github.com/google-gemini/gemini-cli
- Codex: https://developers.openai.com/codex/{plugins, plugins/build, skills, config-reference, cli/slash-commands}; `openai/codex` `docs/{config.md, skills.md, slash_commands.md}`
- OpenCode: https://opencode.ai/docs/{plugins, skills, commands, mcp-servers}; `sst/opencode` `packages/plugin/src/index.ts`
- Copilot: https://docs.github.com/copilot/customizing-copilot/using-model-context-protocol/extending-copilot-chat-with-mcp; https://code.visualstudio.com/docs/copilot/customization/agent-skills; https://docs.github.com/en/copilot/concepts/extensions/skillsets; https://github.blog/changelog/2025-12-18-github-copilot-now-supports-agent-skills/; https://github.com/mcp
- Local: `/home/mkh/workspace/pi-stack-plan/agent-integration/{claude,gemini,codex,opencode,pi}/`
