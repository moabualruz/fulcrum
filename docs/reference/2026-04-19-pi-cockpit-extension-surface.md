---
title: "PI (@mariozechner/pi-coding-agent) extension surface — research snapshot 2026-04-19"
type: reference
date: 2026-04-19
sources:
  - node_modules/@mariozechner/pi-coding-agent/README.md (v0.66.1 — installed in agent-integration/pi/cockpit/node_modules/)
  - node_modules/@mariozechner/pi-coding-agent/docs/extensions.md (authoritative ExtensionAPI doc, 31k tokens)
  - node_modules/@mariozechner/pi-coding-agent/docs/skills.md
  - node_modules/@mariozechner/pi-coding-agent/docs/packages.md
  - npm: @mariozechner/pi-coding-agent (v0.66.1)
  - repo: github.com/badlogic/pi-mono (monorepo; CI workflow confirmed)
---

# PI — `@mariozechner/pi-coding-agent` extension surface reference

Provenance confirmed via user + local `node_modules` + npm + GitHub CI badge.

## 1. PI identity + positioning

- **npm:** `@mariozechner/pi-coding-agent` (plus sibling `@mariozechner/pi-ai`, `@mariozechner/pi-tui`, `@mariozechner/pi-agent-core`).
- **GitHub:** `badlogic/pi-mono` monorepo. Author: @badlogicgames on X / `badlogic` on GitHub.
- **Install:** `npm install -g @mariozechner/pi-coding-agent` → `pi` binary.
- **Self-description:** "a minimal terminal coding harness. Adapt pi to your workflows, not the other way around, without having to fork and modify pi internals."
- **Ships NO sub-agents + NO plan mode by design** — user extends PI via Extensions, Skills, Prompt Templates, Themes, and Pi Packages.

Run modes: `interactive`, `print` / `json`, `RPC`, `SDK`. Fulcrum cockpit lives as a Pi Package.

## 2. Extensions (the primary extension primitive)

Location: `extensions/*.ts` inside a Pi Package, OR bare `.ts` files discovered by `pi`:
- Global:  `~/.pi/agent/extensions/`
- Project: `.pi/extensions/`
- Packages: `extensions/` directory or `pi.extensions` entries in `package.json`

Entry point shape (from `docs/extensions.md`):
```ts
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => { ... });
  pi.registerTool({ name: "...", description: "...", parameters: {...}, execute: async (args, ctx) => ... });
  pi.registerCommand("hello", { description: "...", handler: async (args, ctx) => ... });
}
```

`ExtensionAPI` surface (partial — full surface in `docs/extensions.md`):
- `pi.on(event, handler)` — lifecycle event subscription.
- `pi.registerTool(definition)` — LLM-callable tool (appears in system prompt).
- `pi.registerCommand(name, options)` — slash command.
- `pi.registerMessageRenderer(customType, renderer)` — custom message type UI.
- `pi.registerShortcut(shortcut, options)` — keybinding.
- `pi.registerFlag(name, options)` — CLI flag contribution.
- `pi.registerProvider(name, config)` — custom LLM provider.
- `pi.sendMessage`, `pi.sendUserMessage`, `pi.appendEntry` — session-write primitives.
- `pi.setSessionName` / `pi.getSessionName` / `pi.setLabel` — session metadata.
- `pi.getCommands` / `pi.getActiveTools` / `pi.getAllTools` / `pi.setActiveTools` — introspection / gating.
- `pi.setModel` / `pi.getThinkingLevel` / `pi.setThinkingLevel` — model control.
- `pi.exec(command, args, options?)` — shell from extension.
- `pi.events` — EventEmitter.

Receives an `ExtensionContext` per event:
- `ctx.ui` — TUI primitives
- `ctx.cwd` — working dir
- `ctx.sessionManager` — read-only session state
- `ctx.modelRegistry` / `ctx.model`
- `ctx.signal` — AbortSignal tied to current turn
- `ctx.isIdle()`, `ctx.abort()`, `ctx.hasPendingMessages()`
- `ctx.shutdown()`, `ctx.getContextUsage()`, `ctx.compact()`, `ctx.getSystemPrompt()`

Command context is richer (has `ctx.waitForIdle()`, `ctx.newSession()`, `ctx.fork()`, `ctx.navigateTree()`, `ctx.switchSession()`, `ctx.reload()`).

## 3. Lifecycle events (EXHAUSTIVE, from extensions.md)

**Session events:**
`session_start` · `session_before_switch` (cancellable) · `session_before_fork` (cancellable) · `session_before_compact` (cancellable/customizable) · `session_compact` · `session_before_tree` (cancellable/customizable) · `session_tree` · `session_shutdown`

**Resource events:**
`resources_discover` (after session_start — extensions contribute additional skill / prompt / theme paths).

**Agent events:**
`before_agent_start` · `agent_start` · `agent_end` · `turn_start` · `turn_end` · `message_start` · `message_update` · `message_end` · `tool_execution_start` · `tool_execution_update` · `tool_execution_end`

**Model events:**
`context` (before each LLM call — modify messages non-destructively) · `before_provider_request` · `model_select`

**Tool events:**
`tool_call` (before tool runs, after sibling tool-calls drained) · `tool_result`

**User bash events:**
`user_bash`

**Input events:**
`input`

**Resources events:**
`resources_discover`

This is by far the **richest event taxonomy** of any of the 8 agents.

## 4. Skills

Location:
- Global: `~/.pi/agent/skills/` + `~/.agents/skills/`
- Project: `.pi/skills/` + `.agents/skills/` (CWD + ancestors up to repo/root)
- Packages: `skills/` directory or `pi.skills` entries in `package.json`
- CLI: `--skill <path>` (repeatable)

Discovery rules:
- `~/.pi/agent/skills/` and `.pi/skills/`: root `.md` files + `SKILL.md` dirs both load.
- `~/.agents/skills/` and `.agents/skills/`: ONLY `SKILL.md` dirs load (root `.md` ignored).

`--no-skills` disables auto-discovery; `--skill <path>` always loads.

**Cross-harness import:**
```json
{ "skills": ["~/.claude/skills", "~/.codex/skills"] }
```
PI natively reads Claude Code and Codex skill dirs — huge leverage point for the parity plan.

Frontmatter per Agent Skills spec:
- `name` (max 64, lowercase + hyphens, match parent dir) — required.
- `description` (max 1024) — required.
- `license`, `compatibility`, `metadata`, `allowed-tools`, `disable-model-invocation` — optional.

Skills register as `/skill:name` slash commands. `/skill:pdf-tools extract` passes `extract` as the skill args (`User: <args>` appended).

## 5. Slash commands

Via `pi.registerCommand("name", { description, handler })`. Command context has session control methods (`newSession`, `fork`, `navigateTree`, `switchSession`, `reload`).

`/skill:name` is auto-generated for every skill.

## 6. Pi Packages (the install primitive)

Install:
```bash
pi install npm:@mariozechner/pi-coding-agent
pi install git:github.com/user/repo@v1
pi install /absolute/path   # ← Fulcrum uses this
pi install ./relative/path
pi -e npm:...               # try without installing
```

Settings: `~/.pi/agent/settings.json` (global) + `.pi/settings.json` (project). `pi install -l` writes to project settings.

Package manifest in `package.json`:
```json
{
  "keywords": ["pi-package"],
  "pi": { "extensions": ["./extensions"], "skills": ["./skills"], "prompts": ["./prompts"], "themes": ["./themes"] }
}
```

Or rely on convention directories (`extensions/`, `skills/`, `prompts/`, `themes/`) with no manifest.

`peerDependencies` with `"*"` range is the expected way to declare PI runtime deps. Fulcrum cockpit's `package.json` does this correctly.

## 7. Global context

PI reads context from:
- `.pi/settings.json` "context" field (not covered in this session's fetches — research owes a follow-up if needed).
- Extension injection via `session_start` event → `pi.sendMessage` or systemPrompt assembly.

Fulcrum cockpit's `PI.md` is installed into PI's extension dir as part of the cockpit package.

## 8. MCP integration

PI's MCP support as of v0.66.1: not documented explicitly in `docs/extensions.md` — PI exposes an extension-native tool system (`pi.registerTool`) that can act as a shim to MCP without PI consuming MCP directly.

The Fulcrum cockpit uses `pi.registerTool` to surface 11 Fulcrum-native PI tools for the high-value lifecycle, task, memory, workspace-status, and CoS-context paths. It does not mirror the full 32-tool MCP compatibility catalog one-for-one; PI gets a smaller native tool surface that bypasses MCP overhead.

## 9. Authentication

Subscription logins: Anthropic Claude Pro/Max, OpenAI ChatGPT Plus/Pro (Codex), GitHub Copilot, Google Gemini CLI, Google Antigravity. API keys: Anthropic, OpenAI, Azure OpenAI, Gemini, Vertex, Bedrock.

`/login` switches providers interactively. `/model` cycles models within provider. Ctrl+P cycles models.

## 10. Unique surfaces

- **Broadest event taxonomy of the 8 agents** — `context` event modifies outgoing messages, `before_provider_request` intercepts the raw provider call, `session_before_*` events CANCEL session transitions, `tool_call` / `tool_result` pairs are synchronous-within-turn.
- **Cross-harness skill loading** — PI natively consumes Claude Code and Codex skill dirs via settings. This is a parity accelerator for Fulcrum.
- **No sub-agents / no plan mode by design** — extensions substitute.
- **Session tree navigation** (`/navigate`, `/fork`, `session_tree`) — branching sessions without spawning sub-agents.
- **Custom providers** (`pi.registerProvider`) — extensions can add new LLM backends.
- **Pi Packages via git** — `pi install git:github.com/user/repo@v1` without publishing to npm.

## Implications for Fulcrum parity plan

- PI's **extension API is the superset** of every other CLI agent's extension surface. Everything Fulcrum needs to inject it can inject here, at high fidelity.
- **34-skill set already lands** on PI via the cockpit's byte-identical copy. No skill parity gap.
- **The "Fulcrum-first" behavioral bias** on PI should ride on the `context` event (modify outgoing messages non-destructively) OR the `session_start` → `pi.sendMessage` path. Cleaner than skill-description discovery.
- **PI can consume Claude Code + Codex skill dirs directly** via its own settings. Parity plan should leverage this: one canonical source of skill text, readable by 3 agents without copying.
- **No sub-agents to worry about** — PI's "no sub-agents by design" means parity on the 24 roles concept requires the cockpit extension to implement role-switching itself. Fulcrum's cockpit already has this concept partially built (roles via MCP + chief_of_staff boundary); plan may need to deepen it.
