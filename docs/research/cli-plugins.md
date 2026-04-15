# CLI Plugin/Extension Architecture Research

## Industry Standards Summary

Research covers Claude Code, Gemini CLI, OpenCode (sst/opencode), and Codex CLI (openai/codex).

### Claude Code — hooks + MCP servers

Claude Code's extension surface has two layers:

**1. Hooks** (`~/.claude/settings.json` or `.claude/settings.json`):
Shell commands, HTTP endpoints, LLM prompts, or sub-agents that fire at named
lifecycle events: `SessionStart`, `SessionEnd`, `UserPromptSubmit`,
`PreToolUse`, `PostToolUse`, `PermissionRequest`, `Stop`, `FileChanged`,
`SubagentStart`, `SubagentStop`. Configuration nests inside `"hooks": { "EventName": [{ "matcher": "...", "hooks": [...] }] }`. Matchers accept exact names, `|`-separated lists, or JS regex. Exit code 2 blocks the action; exit code 0 with JSON enables fine-grained control (allow/deny/modify-input). Four hook types: `command`, `http`, `prompt`, `agent`.

**2. MCP servers as plugins**: any package that exposes tools via the MCP
protocol is a first-class extension. Defined in `mcpServers` inside
`settings.json`. The extension gallery (`~/.raise/profiles/`) bundles custom
skills, agents, and hook configurations as Markdown files loaded by convention.

**Lifecycle**: settings are merged from user → project → local → managed
policies at startup; file watchers reload changes without restart.

### Gemini CLI — `gemini-extension.json` manifest + MCP + hooks

Gemini uses a formal extension format (`~/.gemini/extensions/<name>/`). Each
extension carries a `gemini-extension.json` manifest declaring:
- `mcpServers` (MCP tools exposed to the model)
- `contextFileName` (a GEMINI.md context file)
- `excludeTools` (tool blocklist)
- `settings[]` with `envVar`, `sensitive` (keychain storage) for secrets
- A `commands/` subdirectory for TOML slash-command shortcuts
- A `hooks/hooks.json` for lifecycle interception
- A `skills/` directory for agent skills (SKILL.md files)

Install/uninstall/update via `gemini extensions install <github-url>`,
`gemini extensions update --all`, `gemini extensions link <local-path>`.
Workspace scope overrides user scope. Auto-update flag available.
Hooks fire at `BeforeTool`, `AfterTool`, `BeforeAgent`, `AfterAgent`,
`BeforeModel`. Only `"command"` hook type currently supported. JSON on stdout;
exit 2 blocks.

**Sources**: `google-gemini/gemini-cli` docs/extensions/ and docs/hooks/

### OpenCode (sst/opencode) — TypeScript plugin API

OpenCode uses a typed in-process plugin API (`packages/plugin/src/index.ts`).
Plugins are async functions of signature:
`Plugin = (input: PluginInput, options?: PluginOptions) => Promise<Hooks>`
where `Hooks` is a rich interface with:
- `tool` — register new tools
- `event` — observe all SSE events
- `config` — mutate the runtime config
- `auth` / `provider` — custom auth flows and model providers
- `"tool.execute.before"` / `"tool.execute.after"` — pre/post interceptors
- `"chat.params"` / `"chat.headers"` — LLM request mutation
- `"permission.ask"` — permission policy hooks
- `"shell.env"` — environment injection

Config entry in `opencode.json`: `"plugin": ["pkg-name", ["pkg-name", {opts}]]`.
Plugins run in-process (no sandbox), loaded by the server on startup.

**Sources**: `sst/opencode` packages/plugin/src/index.ts (2026-04-14)

### Codex CLI (openai/codex) — no plugin system

Codex CLI (`@openai/codex`, written in Rust `codex-rs/` + a thin TS wrapper
`codex-cli/`) has no documented plugin or extension API. Extension point is
limited to IDE integrations (VS Code, Cursor, Windsurf) which consume the Codex
API. No manifest format, no hook system. The `.codex/` folder at the repo root
is a project-local AGENTS.md, not a plugin registry.

### Cursor — rules files (`.cursor/rules/*.mdc`)

Cursor's extension mechanism is rules files. Project rules live in `.cursor/rules/`
as `.mdc` files with YAML frontmatter (`description`, `globs`, `alwaysApply`).
User-global rules in `~/.cursor/rules/`. Rules inject text into the model's
system prompt; they are not executable interceptors. Cursor has no hook system
or plugin installation CLI. MCP servers serve as the tool-extension point,
configured in `.cursor/mcp.json`. Note: Cursor's official docs redirected during
research; details here are based on the widely-documented `.mdc` format and may
not reflect the latest changes.

### Convergent patterns across tools

1. **Manifest file** (`gemini-extension.json`, `opencode.json` `plugin[]`, `package.json` `"fulcrum"` key) declares what an extension provides.
2. **MCP as the tool extension point** — all four tools that support extensions use MCP servers to expose new tools to the model.
3. **Lifecycle hooks** fire at named events; stdin/stdout JSON is the communication contract. Exit code 2 = block.
4. **Skills/context files** (Markdown) for injecting durable model instructions.
5. **Scope layering**: user-global → project → local, later scopes override.
6. **CLI management commands** for install, update, link (local dev), list.
7. **Settings/secrets** declared in manifest, stored in keychain for sensitive values.

---

## Gap Analysis

### GAP-PLUGIN-1: Plugin discovery is never wired in

- **Standard**: Gemini calls its discovery on every startup and loads all extensions in `~/.gemini/extensions/`; OpenCode resolves plugin modules by name from `opencode.json` before the server starts.
- **Fulcrum**: `packages/cli/src/plugin-discovery.ts` implements `discoverPlugins()` and `registerPlugins()` with full test coverage but is **never imported anywhere in `packages/cli/src/index.ts`**. The `PluginRegistration` result (skills, agents, hookModules) is never consumed. Plugins cannot activate.
- **Severity**: Critical
- **Fix direction**: Import `discoverPlugins`/`registerPlugins` near the top of `index.ts` (before routing to `group`), pass `registration.hookModules` to the hook dispatcher, and expose `registration.skills` and `registration.agents` to `serve mcp` and the agent spawner.

---

### GAP-PLUGIN-2: No inbound hook lifecycle for Fulcrum's own runtime

- **Standard**: Both Claude Code and Gemini CLI let third-party extensions intercept the tool-call lifecycle (`PreToolUse`/`BeforeTool`, `PostToolUse`/`AfterTool`, session start/stop). OpenCode's `Hooks` interface includes `"tool.execute.before"`, `"tool.execute.after"`, `"chat.params"`, `"shell.env"`.
- **Fulcrum**: `packages/cli/src/index.ts` implements hook *handlers* (outbound — Fulcrum acts as a provider for Claude Code's `PreToolUse`, Gemini's `BeforeTool`, and PI's hook) but exposes **no inbound hook points** that third-party Fulcrum plugins can subscribe to. The MCP server in `mcp-server.ts` (line 77–146) dispatches every tool call through a single `handleToolCall` function with no middleware chain.
- **Severity**: Major
- **Fix direction**: Add an async middleware chain to `handleToolCall` (e.g., `pre-tool`, `post-tool`, `pre-run`, `post-run` events). Plugin hook modules loaded via `registration.hookModules` should be able to register handlers on this chain.

---

### GAP-PLUGIN-3: No manifest-level settings/secrets management

- **Standard**: Gemini's `gemini-extension.json` has a `settings[]` array where each entry declares `envVar`, `description`, and `sensitive: true` (stored in system keychain). Prompts user on install. OpenCode's `PluginInput` receives a typed `options` object and the plugin can declare its config schema.
- **Fulcrum**: `FulcrumPluginManifest` in `plugin-discovery.ts` (line 10–18) only has `type`, `hooks`, `skills`, and `agents`. No mechanism to declare, prompt for, or store plugin configuration values. Plugins needing credentials must read raw environment variables with no install-time guidance.
- **Severity**: Major
- **Fix direction**: Add a `settings?: Array<{ name: string; envVar: string; description?: string; sensitive?: boolean }>` field to `FulcrumPluginManifest`. Honour it during a `fulcrum plugin install` command that writes to a `.env` under `globalDataDir()/plugins/<name>/`.

---

### GAP-PLUGIN-4: No install/update/remove CLI commands

- **Standard**: Gemini provides `gemini extensions install <github-url>`, `gemini extensions update --all`, `gemini extensions uninstall <name>`, `gemini extensions link <local-path>` (symlink for local dev), `gemini extensions disable <name> --scope workspace`.
- **Fulcrum**: Zero plugin management commands in the CLI (`packages/cli/src/index.ts` usage string, lines 19–113). Plugins must be installed manually as npm packages in the project's `node_modules`. No `fulcrum plugin install/update/remove/list` surface exists.
- **Severity**: Major
- **Fix direction**: Add a `plugin` command group to `index.ts` with `plugin list` (calls `discoverPlugins()`), `plugin install <npm-pkg>` (runs `npm install` then validates the manifest), and `plugin link <path>` (creates a symlink into `node_modules`).

---

### GAP-PLUGIN-5: Plugin discovery scoped to project node_modules only

- **Standard**: Claude Code discovers hooks from user-global `~/.claude/settings.json` and project `.claude/settings.json`. Gemini loads from `~/.gemini/extensions/` (user-global, always active) and workspace-scope enables/disables. Both support user-global plugins that activate across all projects.
- **Fulcrum**: `discoverPlugins()` in `plugin-discovery.ts` (line 35–64) only walks up from `process.cwd()` looking for a `node_modules` directory. There is no user-global plugin directory (e.g., `globalDataDir()/plugins/`) scanned on startup. A plugin that a developer wants active in every workspace must be re-installed per project.
- **Severity**: Major
- **Fix direction**: Add a second scan of `globalDataDir()/plugins/` (analogous to `~/.gemini/extensions/`) before or after the project-local `node_modules` scan, and merge results. Respect a `FULCRUM_PLUGIN_DIRS` env override for CI.

---

### GAP-PLUGIN-6: No plugin isolation or sandboxing

- **Standard**: Gemini runs MCP servers as child processes (command + args in manifest), providing OS-level isolation. Claude Code hook handlers are separate shell processes. OpenCode plugins run in-process but explicitly documents that they are trusted code.
- **Fulcrum**: `registerPlugins()` returns raw file paths (`hookModules` array) intended to be imported into the main process with no documented sandboxing model, permission boundary, or trust declaration. There is no `trusted: true` manifest field or capability gating. Third-party code loaded this way runs with full CLI privileges.
- **Severity**: Minor (acceptable at current scale, but should be documented)
- **Fix direction**: Add a `"fulcrum": { "type": "plugin", "trust": "verified|community|local" }` field to the manifest. At minimum, document in a `PLUGIN-AUTHORING.md` that hook modules run in-process with full privileges and must be vetted before installation.

---

### GAP-PLUGIN-7: MCP tool schemas are hardcoded, not plugin-extensible

- **Standard**: Gemini extensions can declare additional `mcpServers` in their manifest; the CLI merges them with user-configured servers at startup. OpenCode's `Hooks.tool` map lets plugins register named tool definitions directly.
- **Fulcrum**: `TOOL_SCHEMAS` in `packages/cli/src/mcp-tools.ts` (line 29) is a hardcoded constant array. `createFulcrumMcpServer()` in `mcp-server.ts` (line 77–83) iterates only over this static list. Plugins cannot contribute new MCP tools to the Fulcrum server. Adding a tool requires modifying `mcp-tools.ts` directly.
- **Severity**: Major
- **Fix direction**: Accept an optional `additionalTools: ToolSchema[]` parameter in `createFulcrumMcpServer()` and concatenate with `TOOL_SCHEMAS` before registration. The CLI startup path should collect tool contributions from loaded plugin hook modules and pass them in.

---

*Research conducted 2026-04-15. Primary sources: Claude Code docs (code.claude.com/docs/en/hooks), google-gemini/gemini-cli docs/extensions/ and docs/hooks/, sst/opencode packages/plugin/src/index.ts (commit 2026-04-14), openai/codex README.md.*
