# Install Paths — Per-agent Matrix

> **PR 14.6** — Covers every Fulcrum-supported agent. Referenced by `README.md` and `ONBOARDING.md`.

`agent-integration/install.ts` is the canonical installer. Run `fulcrum install apply --agent <name>` (or `pnpm install:<agent>`) to execute the install path for a given agent.

---

## Summary table

| Agent | Plugin standard | Native install command | Manual fallback | Sentinel for verify |
|---|---|---|---|---|
| **Claude Code** | ✅ Claude Plugin marketplace | `claude plugin marketplace add moabualruz/fulcrum` + `claude plugin install fulcrum@fulcrum` | Copy files to `~/.claude/` | `claude mcp list` shows `fulcrum`; `~/.claude/` dirs present |
| **Gemini CLI** | ✅ Gemini Extension | `gemini extensions install` (auto-loads `gemini-extension.json`) | Copy to `~/.gemini/extensions/fulcrum/` | `~/.gemini/extensions/fulcrum/gemini-extension.json` |
| **PI** | ✅ PI Package | `pi install @fulcrum-agent-os/pi-cockpit` (npm) or `pi install <local-path>` | Manual copy | `pi list` shows `fulcrum`; local path install |
| **Codex** | ⚠️ Marketplace-register only | `codex marketplace add moabualruz/fulcrum` → activate via `/plugins` TUI | Manual `~/.codex/config.toml` + skills + rules | `~/.codex/config.toml` has `[mcp_servers.fulcrum]`; `~/.codex/skills/fulcrum-*/` present |
| **opencode** | ✅ opencode Plugin (npm) | `opencode extensions add @fulcrum-agent-os/opencode-plugin` | Local plugin path via `mode: local` | `.opencode/opencode.jsonc` + `.opencode/opencode.md` present |
| **Cursor** | ❌ Rules + files only | N/A — no marketplace | Copy `.cursor/rules/`, `.cursor/skills/`, MCP, hooks, commands | `.cursor/rules/fulcrum-core.mdc`, `.cursor/mcp.json`, `.cursor/hooks.json` |
| **Windsurf** | ❌ Rules + files only | N/A — no marketplace | Copy `.windsurf/rules/`, workflows, hooks, MCP | `.windsurf/rules/fulcrum-core.md`, `.windsurf/mcp.json`, `.windsurf/hooks.json` |
| **Copilot** | ❌ Rules + files only | N/A — no marketplace | Copy `.github/` instructions, agents, hooks; `.mcp.json` | `.github/copilot-instructions.md`, `.mcp.json`, `.github/hooks/fulcrum.json` |

---

## Agent details

### Claude Code

**Plugin standard:** Claude Plugin marketplace (`.claude-plugin/plugin.json` + `marketplace.json` at repo root).

**Dual-mode installer** (`FULCRUM_CLAUDE_INSTALL_MODE=auto|native|manual`):
- `auto` (default): try native path; fall through to manual on failure.
- `native`: require `claude plugin` subcommand; fail hard if unavailable.
- `manual`: skip native path entirely; go straight to file copies.

**Native path:**
```sh
claude plugin marketplace add moabualruz/fulcrum
claude plugin install fulcrum@fulcrum
```
Marketplace resolves `source: "./agent-integration/claude"` relative to the repo root. After install, run `claude plugin marketplace refresh` periodically — Claude marketplace update mechanics have known delays (issues #46594/#46081/#38271/#37886).

**Manual path** (fallback or when `claude` CLI absent):
- `claude mcp add --scope user fulcrum -- fulcrum serve mcp ...` (or direct `~/.claude.json` edit)
- Copy `~/.claude/settings.json` hooks
- Copy `~/.claude/CLAUDE.md`, skills, agent MDs, slash commands

**Published package:** none (Claude uses the marketplace + in-repo source).

---

### Gemini CLI

**Plugin standard:** Gemini Extension (`gemini-extension.json` manifest).

**Install path:** Copy `agent-integration/gemini/` → `~/.gemini/extensions/fulcrum/`:
```sh
pnpm install:gemini
# or: node agent-integration/install.ts gemini
```
Schema-validated at install time via `validateGeminiExtensionManifest()`.

**Update path:**
```sh
gemini extensions update fulcrum
```

**Published package:** none (extension uses in-repo source directly).

---

### PI

**Plugin standard:** PI Package (installed via `pi install`).

**Install path:**
1. Probe npm: `npm view @fulcrum-agent-os/pi-cockpit version` (2s timeout).
2. If available: `pi install @fulcrum-agent-os/pi-cockpit`.
3. If not on npm (pre-publish): `pi install agent-integration/pi/cockpit`.

**Published package:** `@fulcrum-agent-os/pi-cockpit` (npm).

---

### Codex

**Plugin standard:** Codex Marketplace (`codex marketplace add`). Note: there is **no `codex plugin install` CLI command** — activation is TUI-only via `/plugins`.

**Install path:**
1. Copy `~/.codex/config.toml` MCP entry.
2. Copy skills, rules, hooks.
3. Register marketplace: `codex marketplace add moabualruz/fulcrum`.
4. User activates in Codex TUI via `/plugins`.

**Published package:** `@fulcrum-agent-os/opencode-plugin` via opencode (separate agent). Codex uses plugin.json from `agent-integration/codex/plugin/.codex-plugin/plugin.json`.

---

### opencode

**Plugin standard:** opencode Plugin (npm package).

**Install mode** (`mode: auto|npm|local`):
- `auto` (default): probe npm; fall through to local on miss.
- `npm`: require `@fulcrum-agent-os/opencode-plugin` on npm; fail if unavailable.
- `local`: use `agent-integration/opencode/` directly.

**Published package:** `@fulcrum-agent-os/opencode-plugin` (npm).

---

### Cursor

**Plugin standard:** None — Cursor uses direct file drop.

Cursor 2.4+ supports Agent Skills (`.cursor/skills/<name>/SKILL.md`) and hooks (`.cursor/hooks.json`), but these are filesystem-based; there is no Cursor marketplace.

**Install path:** `installCursor({ dryRun, targetDir })` copies:
- `.cursor/mcp.json`
- `.cursor/rules/fulcrum-core.mdc` + 33 `fulcrum-skill-*.mdc`
- `.cursor/skills/fulcrum-*/SKILL.md` (33 skills)
- `.cursor/hooks.json`
- `.cursor/commands/*.md` (6 commands)

---

### Windsurf

**Plugin standard:** None — Windsurf uses direct file drop.

**Install path:** `installWindsurf({ dryRun, targetDir })` copies:
- `.windsurf/mcp.json`
- `.windsurf/rules/fulcrum-core.md` + 33 `fulcrum-skill-*.md`
- `.windsurf/workflows/*.md` (6 workflows)
- `.windsurf/hooks.json`

Optional global install: `installWindsurf({ global: true })` → `~/.windsurf/global_rules.md`.

---

### Copilot (CLI)

**Plugin standard:** None — Copilot uses direct file drop.

> Target: Copilot CLI (`/usr/bin/copilot` v1.0.x), not the VS Code extension.

**Install path:** `installCopilot({ dryRun, targetDir })` copies:
- `.mcp.json`
- `.github/copilot-instructions.md`
- `.github/instructions/fulcrum-skill-*.instructions.md` (33 files)
- `.github/agents/*.agent.md` (24 role files)
- `.github/hooks/fulcrum.json`

---

## Known limitations

- **Copilot** is rules-only — no hook layer; rules reach the model only when VS Code renders them. This is a known asymmetry (Constraint R6 in the plan).
- **Codex marketplace** TUI-activation is not scriptable from `install.ts`. The `codex marketplace add` step registers the source; the user must open the TUI and activate.
- **Claude marketplace update mechanics** have open issues as of Q2 2026 — `claude plugin marketplace refresh` may need to be run manually after source changes.
