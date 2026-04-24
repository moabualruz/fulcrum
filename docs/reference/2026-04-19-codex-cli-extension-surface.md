---
title: "Codex CLI extension surface — research snapshot (updated 2026-04-20)"
type: reference
date: 2026-04-19
updated: 2026-04-20
sources:
  - github.com/openai/codex @ commit 1dc3535 (verified 2026-04-20)
  - codex-rs/protocol/src/protocol.rs (HookEventName, HookHandlerType enums)
  - codex-rs/hooks/src/events/*.rs (per-event runtime)
  - codex-rs/hooks/src/schema.rs (stdin/stdout JSON)
  - codex-rs/core-plugins/src/{manifest,marketplace,loader,store,toggles}.rs
  - codex-rs/core-skills/src/{model,loader,system,manager}.rs
  - codex-rs/cli/src/marketplace_cmd.rs (codex plugin marketplace CLI)
  - codex-rs/app-server/README.md (JSON-RPC method catalog + stability markers)
  - docs/config.md (config.toml reference)
  - real-world plugin templates: openai/codex-plugin-cc, remotion-dev/codex-plugin, schuettc/codex-reviewer, zeabur/agent-skills, basilisk-labs/codex-swarm
---

# Codex CLI — extension surface reference

**NOTE**: 2026-04-20 update corrects 5 stale claims from the 2026-04-19 baseline — see `## v3.3 diff from 2026-04-19` at the end.

## 1. Hooks

### Feature flag + discovery
Feature gate: `[features] codex_hooks = true` (also `enable_hooks`) in `~/.codex/config.toml`. Shipping widely in alpha.11/12 as of 2026-04-20.

Discovery files: `~/.codex/hooks.json` (global) + `<repo>/.codex/hooks.json` (project) **OR** inline `[[hooks]]` in `config.toml`.

### Event taxonomy (6 events — **updated 2026-04-20**)

Enum `HookEventName` in `codex-rs/protocol/src/protocol.rs`:

```rust
pub enum HookEventName {
    PreToolUse,
    PermissionRequest,   // NEW since 2026-04-19 — write-class interceptor
    PostToolUse,
    SessionStart,
    UserPromptSubmit,
    Stop,
}
```

Per-event semantics:

- **`SessionStart`** — session init. Stdin carries `source: "startup" | "clear" | "resume"`. Returns `{continue: true, systemMessage: "...", hookSpecificOutput: {hookEventName: "SessionStart", additionalContext: "..."}}`.
- **`UserPromptSubmit`** — fires on user-message submit. Return shape supports `additionalContext` injection into the next model turn.
- **`PreToolUse`** — **Bash-only** (confirmed — `tool_name` is hard-coded to `"Bash"` in `codex-rs/hooks/src/events/pre_tool_use.rs`). Write/Edit/MultiEdit NOT intercepted here. Returns `{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "..."}}` (or legacy `{"decision":"block","reason":"..."}`).
- **`PermissionRequest`** (NEW) — fires for ALL tool approvals (Bash, Write, Edit, MultiEdit, task-call, etc.) in the approval path before guardian/user UI. Returns `Allow` or `Deny{message}`. Deny-wins fold; otherwise last-Allow wins. **Cannot rewrite tool input** (unlike PreToolUse). Closest thing Codex has to a write-class interceptor. Source: `codex-rs/hooks/src/events/permission_request.rs`.
- **`PostToolUse`** — Bash-only. `{decision: "block", reason: "...", hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: "..."}}`.
- **`Stop`** — conversation halts. `{decision:"block","reason":"..."}` → continues with `reason` as a new user prompt.

### Stdin (all events)

```json
{
  "session_id": "...",
  "turn_id": "... (turn-scoped only)",
  "transcript_path": "...|null",
  "cwd": "...",
  "hook_event_name": "...",
  "model": "...",
  "permission_mode": "...",
  "tool_name": "...",
  "tool_input": { ... },
  "tool_response": { ... },
  "tool_use_id": "..."
}
```

Schema source: `codex-rs/hooks/src/schema.rs`.

### Hook handler types (**NEW 2026-04-20, UPDATED 2026-04-20 — PR 6.3 verification**)

Enum `HookHandlerType` in `codex-rs/protocol/src/protocol.rs`:

- **`command`** — shell a command with event JSON on stdin. Prior-standard. **ONLY stable variant today.**
- **`prompt`** — declared in the protocol enum but the hook engine config parser (`codex-rs/hooks/src/engine/config.rs`) defines `Prompt {}` as an **empty struct** (no `command`, no `prompt` text, no fields). Similarly the dispatcher (`codex-rs/hooks/src/engine/dispatcher.rs`) hardcodes `handler_type: HookHandlerType::Command` in every `HookRunSummary` it produces — there is no divergent execution path for the prompt variant. **Wiring `type = "prompt"` in a hooks.json today configures a no-op hook that is accepted by the parser but has no executable form.** Do NOT wire this until upstream lands a schema + execution path.
- **`agent`** — same status as `prompt`: declared in protocol enum as `Agent {}` empty struct; no dispatcher path. **Not wirable.**

**PR 6.3 decision**: keep every Fulcrum Codex hook at the implicit `command` handler type (TOML default when `type` is omitted). Re-check `codex-rs/hooks/src/engine/config.rs` `HookHandlerConfig` enum in each subsequent PR — if either `Prompt { … }` or `Agent { … }` gains concrete fields + the dispatcher grows a matching execution branch, revisit the UserPromptSubmit handler wiring at that time.

### TOML schema

```toml
[[hooks]]
event = "PreToolUse"
command = "fulcrum hook codex pre"
allowed_tools = ["Bash"]   # narrows further; tool_name is always "Bash" in Pre/PostToolUse
```

### JSON schema variant (`hooks.json`)

```json
{
  "hooks": {
    "EVENT": [{
      "matcher": "regex",
      "hooks": [{
        "type": "command" | "prompt" | "agent",
        "command": "...",
        "statusMessage": "...",
        "timeout": 600
      }]
    }]
  }
}
```

### Exit semantics

Exit code `2` + stderr = block. Default timeout 600s. Multiple matching hooks run concurrently.

### Capability summary vs Claude Code

- `PreToolUse` / `PostToolUse`: Bash-only (hard-coded) — narrower than Claude.
- `PermissionRequest`: fires for all tools — **parity with Claude's PreToolUse write-path** (denial only; no input rewrite).
- Fulcrum's write-class interception on Codex lives in PermissionRequest (not PreToolUse). PR 6 wires this.

## 2. Sub-agents / roles

Codex remains a **single-agent** CLI. No `agents/*.md` discovery, no `mode: primary|subagent` schema (unlike opencode).

Internal `/side` conversation / guardian-thread exists but is not an extension point.

**Fulcrum plan implication**: Codex has no place for the 24 role MDs to land. Roles are enforced via MCP server's `--profile <role>` flag + AGENTS.md system-prompt injection.

## 3. Skills

### Storage + scopes (**updated 2026-04-20**)

Skills discovered from 4 scopes (`SkillScope` enum in `codex-rs/core-skills/src/model.rs`), higher-priority wins on dedup:

- **`Admin`** — system-administered (highest precedence)
- **`System`** — platform-provided
- **`User`** — `~/.codex/skills/<name>/` (global user)
- **`Repo`** — `.codex-plugin/skills/<name>/` (per-project, lowest precedence)

Filename: `SKILL.md`.

### Frontmatter

```yaml
---
name: my-skill            # required, ≤ 64 chars
description: "..."        # required, ≤ 1024 chars
metadata:
  short-description: "..." # optional, ≤ 1024 chars
---
```

Source: `codex-rs/core-skills/src/loader.rs`.

### Optional sidecar `agents/openai.yaml` (**NEW 2026-04-20**)

Adjacent to SKILL.md at `skills/<name>/agents/openai.yaml`:

```yaml
interface:
  display_name: "..."
  short_description: "..."
  icon_small: "path/to/small.png"
  icon_large: "path/to/large.png"
  brand_color: "#RRGGBB"
  default_prompt: "..."
dependencies:
  tools:
    - type: "mcp"
      value: "fulcrum_recall_memory"
      description: "..."
      transport: "stdio"
      command: "fulcrum serve mcp"
      url: null
policy:
  allow_implicit_invocation: false   # prevents auto-invoke without user/model intent
  products: ["codex"]                # ["chatgpt","codex",...]
```

Schema source: `codex-rs/core-skills/src/loader.rs` sidecar-loader branch.

### Current Fulcrum ship

`agent-integration/codex/plugin/skills/` — 6 hand-authored skills: `fulcrum-chief-of-staff`, `fulcrum-complete-task`, `fulcrum-recall-before-writing`, `fulcrum-session-start`, `fulcrum-start-task`, `fulcrum-write-memory`. PR 6 (v3.3 rescoped) fans these out to 33 from canonical source + adds openai.yaml sidecars.

## 4. Plugin system

### Manifest `.codex-plugin/plugin.json` (**expanded schema 2026-04-20**)

Required: `name`.

Optional fields (per `codex-rs/core-plugins/src/manifest.rs`):

- `version`, `description`
- `skills` (relative path like `"./skills"`)
- `mcp_servers` (relative path like `"./mcp_servers.json"`)
- `apps` (relative path; `apps` feature itself under development)
- `interface`:
  - `displayName`
  - `shortDescription`
  - `longDescription`
  - `developerName`
  - `category` (e.g. `"productivity"`)
  - `capabilities[]` (e.g. `["task_management", "memory"]`)
  - `websiteURL`, `privacyPolicyURL`, `termsOfServiceURL`
  - `defaultPrompt`
  - `brandColor`
  - `composerIcon`, `logo`
  - `screenshots[]`

All relative paths MUST start with `./`.

### Marketplace manifest

Codex reads EITHER (Claude-compat):

- `.agents/plugins/marketplace.json`
- `.claude-plugin/marketplace.json`

Schema (per `codex-rs/core-plugins/src/marketplace.rs`):

```json
{
  "name": "fulcrum",
  "owner": { "name": "Mo Abualruz" },
  "metadata": { "description": "...", "version": "1.0.0" },
  "plugins": [
    {
      "name": "fulcrum",
      "source": "./agent-integration/claude",
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL",
        "products": ["codex"]
      }
    },
    {
      "name": "fulcrum-codex",
      "source": { "url": "https://github.com/moabualruz/fulcrum.git", "ref": "main", "sha": "…", "path": "agent-integration/codex/plugin" }
    }
  ]
}
```

`policy.installation` values: `AVAILABLE | NOT_AVAILABLE | INSTALLED_BY_DEFAULT`.
`policy.authentication` values: `ON_INSTALL | ON_USE`.

### Marketplace CLI (**updated 2026-04-20 — previously said "no CLI"**)

`codex plugin marketplace add <src>` — subscribe.
`codex plugin marketplace upgrade <name>` — pull marketplace changes.
`codex plugin marketplace remove <name>` — unsubscribe.

Source: `codex-rs/cli/src/marketplace_cmd.rs`.

**Still TUI-gated**: per-plugin install / uninstall / enable / disable. Marketplace management is scripted; plugin toggling is not.

### App-server JSON-RPC API

From `codex-rs/app-server/README.md`:

**Stable (production-safe)**:
- `marketplace/add`
- `marketplace/remove`
- `skills/list`
- `skills/config/write`
- `skills/changed` (notification)
- `config/mcpServer/reload`
- `mcpServerStatus/list`
- `experimentalFeature/{list, enablement/set}`

**Under development (do NOT call from production clients)**:
- `plugin/list`
- `plugin/read`
- `plugin/install`
- `plugin/uninstall`
- `app/list`

PR 6 unit 6.8 wires the stable surface only.

## 5. Global context

Location: `AGENTS.md` at project root. Discovered via directory walk. Loaded into Codex's system prompt per the `AGENTS.md` spec.

Fulcrum ships `agent-integration/codex/AGENTS.md` → copied to project root by `installCodex()`. Global `~/.codex/config.toml` holds MCP + hooks.

## 6. MCP integration

Registration: `[mcp_servers.<name>]` in `~/.codex/config.toml`:

```toml
[mcp_servers.fulcrum]
command = "fulcrum"
args = ["serve", "mcp", "--mode", "filtered"]
env = { }
supports_parallel_tool_calls = true
default_tools_approval_mode = "prompt"  # "prompt" | "allow" | "deny"

[mcp_servers.fulcrum.tools.invoke_team]
approval_mode = "prompt"
```

Tool naming: `<server>_<tool>` (underscore separator).

Hot-reload: `config/mcpServer/reload` app-server RPC reloads without Codex restart.

## 7. Slash commands

Docs reference `codex/cli/slash-commands` but no user-authorable slash-command mechanism as of 2026-04-20. Confirmed: no extension surface for user-defined slash commands.

## 8. Authentication

Two modes (unchanged):
- **Sign in with ChatGPT** (OAuth) — unlocks `gpt-5`, `gpt-5-mini`, `gpt-5-nano` via Plus/Pro plan.
- **API key** (`OPENAI_API_KEY`) — standard metering.

## 9. Real-world plugin examples (templates)

Five public repos inspected 2026-04-20. Distribution model: **none are npm-published**. All distributed via `codex plugin marketplace add owner/repo`:

- **openai/codex-plugin-cc** — OFFICIAL reference. Full surface (`.claude-plugin/`, `plugins/codex/`, hooks JSON, skills, agents, commands, prompts, schemas, scripts). Canonical shape template.
- **remotion-dev/codex-plugin** — pure Codex plugin with full `interface` block (brandColor, composerIcon, logo, defaultPrompt[]) + skills.
- **schuettc/codex-reviewer** — v0.8.0 with `PUBLISHING.md` showing the marketplace-add distribution flow. No hooks, skills-only.
- **zeabur/agent-skills** — dual-target (Claude + Codex) from one skills repo.
- **basilisk-labs/codex-swarm** — local-agent swarm via `.codex-swarm/` overlay (NOT marketplace-installable).

## 10. Fulcrum-specific implications (for PR 6 v3.3 scope)

- **PermissionRequest** — Fulcrum's write-class interception on Codex. Wire `runCodexPermissionRequestHook`.
- **Hook handler type `prompt`** — UserPromptSubmit handler wired as `prompt`-type so rider content injects directly to model.
- **Skill fanout** — matches PR 4 c2 opencode pattern. `installCodex()` → `parseCanonicalSource + emitCodex` → 33 skills to `.codex-plugin/skills/fulcrum-<name>/SKILL.md`.
- **openai.yaml sidecars** — emit alongside SKILL.md per skill. Declares Fulcrum MCP tool deps + `policy.allow_implicit_invocation`.
- **Full plugin manifest** — ship production-quality `.codex-plugin/plugin.json` with interface block.
- **Shared marketplace** — one `.claude-plugin/marketplace.json` at repo root serves Claude + Codex.
- **App-server stable RPCs** — `config/mcpServer/reload` + `skills/list`.
- **PR 14.2 install path revised** — native `codex plugin marketplace add moabualruz/fulcrum`; per-plugin install still TUI via post-install message.

## v3.3 diff from 2026-04-19 (what changed)

Five items corrected in the 2026-04-20 update:

1. Hook event count: 5 → **6** (`PermissionRequest` added).
2. Hook handler types: `command` → **`command | prompt | agent`**.
3. Plugin manifest schema: "no dynamic API" → full schema with `interface` block documented.
4. Marketplace: "TUI-only management" → **`codex plugin marketplace {add|upgrade|remove}` CLI shipped**; reads Claude-compat `.claude-plugin/marketplace.json`.
5. Skills: `~/.codex/skills/<name>` (user-only) → **4 scopes** (Admin/System/User/Repo) + optional `agents/openai.yaml` sidecar.

Unchanged (still true as of 2026-04-20):
- PreToolUse/PostToolUse hard-coded to Bash-only.
- No user-defined sub-agents (Codex is single-agent).
- No user-authorable slash-command mechanism.
- Per-plugin install/uninstall not scripted (TUI-only + app-server RPCs marked unstable).
