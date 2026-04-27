# Fulcrum — AI-Assisted Development Environment

> Reference implementation: Claude Code. Cross-agent sections marked 🚧.

---

## Principles

- **CLI and skills over MCP.** MCPs spawn long-running processes and consume 55k–100k tokens at startup with 5+ servers active — before your first message. A CLI + skill achieves the same with zero overhead.
- **MCPs off by default.** Register MCPs disabled; enable per-session when genuinely needed.
- **Behavioral rules, not knowledge.** CLAUDE.md changes what the agent *does*, not what it *knows*. `"Use ruff, never flake8"` works. `"Write clean code"` does nothing.
- **Agent-friendly tools output JSON.** `--json` / `--format json` is the selection criterion for every CLI in this stack.

---

## Architecture

| Layer | Job | Mechanism |
|---|---|---|
| **Context** | Always-on rules and conventions | `~/.claude/CLAUDE.md` + `AGENTS.md` |
| **Automation** | Deterministic enforcement (cannot be ignored) | Hooks in `~/.claude/settings.json` |
| **Capability** | What the agent can do | CLI tools + `SKILL.md` files |
| **MCPs** | Opt-in only | Registered disabled, enable when needed |

---

## 1. Context Layer

### 1.1 Global: `~/.claude/CLAUDE.md`

Loaded into every session. User-level preferences, style rules, anti-patterns.

**Include:** non-obvious commands (`uv run pytest`, not `npm test`), style rules that differ from defaults, explicit anti-patterns, git conventions, environment quirks.

**Exclude:** standard conventions Claude already knows, API docs (link instead), anything self-evident.

**Keep under 200 lines.** Bloated files cause Claude to silently ignore rules. Use `IMPORTANT:` or `YOU MUST` for rules that keep getting missed.

Bootstrap: `/init` in any project → prune aggressively.

### 1.2 Per-project: `AGENTS.md`

Versioned with the code. Read by every agent. Contains only what's true for this branch.

```markdown
# AGENTS.md

## Project
<one-line description>

## Stack
- Language / runtime:
- Framework:
- Package manager:
- Test runner:

## Commands
- Install:      <cmd>
- Dev server:   <cmd>
- Test:         <cmd>
- Lint/format:  <cmd>
- Build:        <cmd>

## Conventions
- Branch naming:
- Commit style:
- Code style:

## Do / Don't
- DO …
- DON'T …
```

---

## 2. Automation Layer — Hooks

Hooks have two legitimate jobs:
1. **Index maintenance** — keep tool indexes current after code changes so tools always work at full capability
2. **Dynamic context injection** — inject context the agent cannot retrieve itself (memory/handover, §6 — pending)

### 2.1 Index-aware hooks

| Hook | Trigger | What it does |
|---|---|---|
| `Stop` | Agent finishes | Rebuilds stale indexes — agent just changed code, best time to update |
| `SessionStart` | Session opens | Checks index freshness, rebuilds if stale before work begins |

Tools with indexes that need maintenance:

| Tool | Index | Rebuild command |
|---|---|---|
| `universal-ctags` | `tags` file in project root | `ctags -R --exclude=.git --exclude=node_modules .` |
| `graphify` | `graphify-out/` directory | `graphify build .` |
| `repomix` | cached pack at `/tmp/<slug>.xml` | `repomix --compress -o /tmp/<slug>.xml` |

### 2.2 Config — `~/.claude/settings.json`

```json
{
  "hooks": {
    "Stop": [{
      "hooks": [{"type": "command", "command": "~/.fulcrum/hooks/index-rebuild.sh"}]
    }],
    "SessionStart": [{
      "hooks": [{"type": "command", "command": "~/.fulcrum/hooks/index-check.sh"}]
    }]
  }
}
```

### 2.3 Hook scripts — `~/.fulcrum/hooks/`

**`index-rebuild.sh`** — runs after agent stops, rebuilds only when code changed:
```bash
#!/usr/bin/env bash
set -euo pipefail
SLUG=$(basename "$PWD")
SHA_FILE="/tmp/${SLUG}.index-sha"
CURR_SHA=$(git rev-parse HEAD 2>/dev/null || echo "no-git")
DIRTY=$(git status --porcelain 2>/dev/null || true)
LAST_SHA=$(cat "$SHA_FILE" 2>/dev/null || echo "")

# Skip if HEAD unchanged and working tree is clean
[ "$LAST_SHA" = "$CURR_SHA" ] && [ -z "$DIRTY" ] && exit 0

ctags -R --exclude=.git --exclude=node_modules . 2>/dev/null &
graphify build . 2>/dev/null &
repomix --compress -o "/tmp/${SLUG}.xml" 2>/dev/null &
wait

echo "$CURR_SHA" > "$SHA_FILE"
exit 0
```

SHA stored in `/tmp/` — never touches the repo. Rebuild triggers on: new commits (including pushed), uncommitted changes. Skips when nothing changed.

**`index-check.sh`** — runs at session start, warns if indexes are stale:
```bash
#!/usr/bin/env bash
NOW=$(date +%s)

if [ -f "tags" ]; then
  AGE=$(( NOW - $(stat -f %m tags 2>/dev/null || echo "$NOW") ))
  [ $AGE -gt 3600 ] && echo "ctags index is $(( AGE / 60 ))min old — rebuild with: ctags -R ."
else
  echo "No ctags index — run: ctags -R --exclude=.git --exclude=node_modules ."
fi

if [ ! -d "graphify-out" ]; then
  echo "No graphify graph — run: graphify build ."
fi

exit 0
```

---

## 3. Capability Layer

### 3.1 Foundation — install once per machine

```bash
brew install \
  ripgrep fd fzf jq yq bat sd eza zoxide \
  xh gh just mise direnv \
  tmux difftastic \
  universal-ctags hyperfine watchexec \
  ast-grep gitleaks git-cliff
```

```bash
pip install semgrep lizard
npm install -g repomix ctx7 @playwright/cli
uv tool install graphifyy tavily-cli
```

| Tool | Replaces | Agent use |
|---|---|---|
| `rg` | grep | Fast code search — agents run 10+ searches per loop, speed matters |
| `fd` | find | File discovery |
| `jq` / `yq` | manual parsing | JSON/YAML in every pipeline |
| `xh` | curl | HTTP/API calls, readable JSON output by default |
| `gh` | browser | PRs, issues, CI status, code search |
| `just` | make | Project task runner — AGENTS.md documents just recipes |
| `mise` | nvm/pyenv/rbenv | Runtime version management, eliminates "wrong version" failures |
| `direnv` | manual exports | Per-directory env vars, transparent to agent |
| `tmux` | — | Required for Claude Code multi-agent parallel sessions |
| `difftastic` | git diff | Syntax-aware structural diff — better signal for agents reading changes |
| `bat` | cat | File content with syntax highlighting |
| `sd` | sed | Reliable text replacement |
| `eza` | ls | File listings with metadata |
| `fzf` | — | Fuzzy selection in shell pipelines |
| `zoxide` | cd | Smart directory jump |
| `hyperfine` | time | Statistical benchmarking, JSON output |
| `watchexec` | polling | Re-run on file change |
| `universal-ctags` | — | Symbol index — where is X defined, across all languages |
| `gitleaks` | — | Secrets in git history |
| `git-cliff` | — | Changelog from conventional commits |

### 3.2 Code Intelligence

| Tool | Install | Provides |
|---|---|---|
| `ast-grep` | `brew install ast-grep` | Structural AST pattern search + skill |
| `repomix` | `npm install -g repomix` | Pack repo into context + skill |
| `graphify` | `uv tool install graphifyy` | Code knowledge graph + skill |
| `semgrep` | `pip install semgrep` | SAST scan, 1000+ rules, no account needed, local |
| `lizard` | `pip install lizard` | Cyclomatic complexity + function length, JSON output, 27 languages |

### 3.3 Web + Docs

| Tool | Install | Provides |
|---|---|---|
| `ctx7` | `npm install -g ctx7` | Up-to-date library/API docs + skill |
| `tvly` | `uv tool install tavily-cli` | Web search + research + skill |
| `playwright-cli` | `npm install -g @playwright/cli && npx playwright install chromium` | Browser automation + skill |

### 3.4 Services — install when the project needs it

| Tool | Install | Covers |
|---|---|---|
| `gws` | see gws docs | Gmail, Google Drive, Google Calendar |
| `hcloud` | `brew install hcloud` | Hetzner Cloud — servers, volumes, firewalls, networks, load balancers (`-o json` on all commands) |
| `wrangler` | `npm install -g wrangler` | Cloudflare Workers, Pages, D1, KV, R2 |
| `flarectl` | `go install github.com/cloudflare/cloudflare-go/cmd/flarectl@latest` | Cloudflare DNS + zone management (no JSON — use `xh` + Cloudflare REST API for scripted DNS ops) |
| `usql` | `brew install usql` | All databases — Postgres, MySQL, SQLite, 50+ others |

### 3.5 Language-specific — install per project, not globally

| Language | Formatter | Linter / Analyzer | Security |
|---|---|---|---|
| Python | `ruff format` (`pip install ruff`) | `ruff check --output-format=json` | `pip-audit --format=json` |
| JS/TS | `biome format --write` (`npm i -g @biomejs/biome`) | `biome check --reporter=json` + `knip --reporter=json` | — |
| Rust | `rustfmt` (built-in) | `clippy` (built-in) | `cargo-deny check` (`cargo install cargo-deny`) |
| Go | `gofmt` (built-in) | `golangci-lint run --out-format=json` (`brew install golangci-lint`) | — |
| PHP | `php-cs-fixer fix --format=json` | `phpstan --error-format=json` | `composer audit --format=json` |
| Kotlin | `ktlint --format` (`brew install ktlint`) | `ktlint --reporter=json` | — |
| Java | `google-java-format --replace` (`brew install google-java-format`) | `pmd check --format json` (`brew install pmd`) | `spotbugs -sarif` (`brew install spotbugs`) |
| Dart/Flutter | `dart format` | `dart analyze` (no JSON — parse exit code) | `osv-scanner --lockfile pubspec.lock --format=json` (`brew install osv-scanner`) |

---

## 4. Skills

Skills teach agents *when and how* to use CLI tools. Without a skill, agents invent broken invocations or miss the right tool entirely.

### 4.1 Skills installation — per-agent paths

Each agent uses its own native skills directory. Do not use a shared `~/.agents/` folder — it pollutes every agent's context with skills that may not apply.

| Agent | Skills path |
|---|---|
| Claude Code | `~/.claude/skills/<name>/SKILL.md` |
| Codex CLI | `.agents/skills/<name>/SKILL.md` (project-level only) |
| Gemini CLI | `~/.gemini/extensions/<ext>/skills/<name>/SKILL.md` |
| OpenCode | `~/.config/opencode/skills/<name>/SKILL.md` |
| Copilot CLI | `~/.copilot/skills/<name>/SKILL.md` |
| Pi CLI | `~/.pi/agent/skills/<name>/SKILL.md` |

Install a skill to the agents that need it. If a skill is relevant to all agents, install it in each agent's own directory separately.

### 4.2 Skill catalogue

| Skill | Teaches |
|---|---|
| `ast-grep` | YAML rule format, meta-variables, structural patterns |
| `graphify` | When to build graph, how to query it |
| `context7-cli` | Two-step library lookup |
| `tavily-*` (7 skills) | Search, deep research, extract |
| `playwright-cli` | snapshot, screenshot, open, fill |
| `think` | Structured reasoning — `/think` trigger |
| `anthropics/skills` | Document work, webapp testing, mcp-builder, skill-creator |

> `repomix` skill: `repomix --skill-generate <name> --skill-output <agent-skills-path>/<name>` generates a SKILL.md from any packed output.

---

## 5. MCP Policy

All MCPs disabled by default.

### 5.1 Disable claude.ai defaults

The claude.ai integrated MCPs (Gmail, Drive, Calendar) auto-inject into every Claude Code session consuming tokens regardless of relevance. 🚧 Disable mechanism pending confirmation.

### 5.2 MCP catalogue — opt-in only

One MCP is always on — `deepwiki`. It has no CLI or REST alternative; it is free, requires no auth, and has no documented rate limits.

```bash
claude mcp add -s user deepwiki --transport http https://mcp.deepwiki.com/mcp
```

Tools: `ask_question`, `read_wiki_contents`, `read_wiki_structure` — public repos only.

> MCP and CLI hit the same underlying API with the same quota — switching protocol does not change rate limits (verified: Context7, Tavily primary docs 2026-04-27). No other MCPs are needed.

---

## 🚧 6. Memory + Handover

Separate focused discussion pending.

**Requirements identified:**
- Long-term: preferences, architectural decisions, patterns — across projects and agents
- Short-term: session state — "where we stopped", files changed, decisions made, next step
- Cross-agent portable: any agent can read the handover artifact
- No embedding models, no extra LLM calls, no new paid services

---

## 7. Cross-Agent Generalization

The §1–§5 architecture applies to all agents. This section translates each layer to agent-specific config. All data verified from primary sources 2026-04-27.

**Comparison matrix:**

| | Codex CLI | Gemini CLI | OpenCode | Copilot CLI | Pi CLI |
|---|---|---|---|---|---|
| Global rules | `~/.codex/AGENTS.md` | `~/.gemini/GEMINI.md` | `~/.config/opencode/AGENTS.md` | `~/.copilot/copilot-instructions.md` | `~/.pi/agent/` (`AGENTS.md` or `CLAUDE.md`) |
| Project rules | `AGENTS.md` / `.codex/config.toml` | `GEMINI.md` (project root) | `AGENTS.md` | `AGENTS.md` / `.github/copilot-instructions.md` | `AGENTS.md` / `CLAUDE.md` |
| Reads AGENTS.md natively | Yes | **No** — only GEMINI.md | Yes | Yes | Yes |
| Hook mechanism | `~/.codex/hooks.json` | `hooks` in settings.json | TypeScript plugin | `.github/hooks/hooks.json` | No hooks — extensions only |
| Hook events | 6 | 11 (richest) | 30+ plugin events | 6 (context inject blocked) | N/A |
| Hook context inject | SessionStart + UserPromptSubmit only | Yes | Yes | No — preToolUse deny only | N/A |
| Skills path | `.agents/skills/` (project) | `~/.gemini/extensions/` | `~/.config/opencode/skills/` | `~/.copilot/skills/` | `~/.pi/agent/skills/` |
| MCP | Yes — `config.toml` | Yes — `settings.json` | Yes — `opencode.json` | Yes — `mcp-config.json` | **No** (by design) |
| DeepWiki | Yes | Yes | Yes | Yes | No |

---

### 7.1 Codex CLI

Sources: [developers.openai.com/codex/config-reference](https://developers.openai.com/codex/config-reference), [/hooks](https://developers.openai.com/codex/hooks), [/skills](https://developers.openai.com/codex/skills). Verified 2026-04-27.

#### 7.1.1 Context Layer

| File | Scope |
|---|---|
| `~/.codex/AGENTS.md` | Global user-level |
| `AGENTS.md` | Project-level (walked up from cwd to repo root) |
| `.codex/config.toml` | Project config (rules, model, tool settings) |

#### 7.1.2 Hooks

Hooks config: `~/.codex/hooks.json` (user) or `.codex/hooks.json` (project). Both TOML inline and JSON are supported but **JSON is the recommended format** — TOML inline hooks have a known startup bug in recent versions where they conflict with the JSON loader.

Six events: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `Stop`.

**Stdout behavior per event:**
- `SessionStart`, `UserPromptSubmit` — plain text stdout injected as developer context
- `PreToolUse`, `PostToolUse`, `PermissionRequest` — stdout ignored; use stderr for logs
- `Stop` — must return JSON (plain text invalid)

Non-zero exit code (2) blocks the triggering action with stderr as the reason.

`~/.codex/hooks.json` for index maintenance:

```json
{
  "hooks": {
    "Stop": [{"hooks": [{"type": "command", "command": "~/.fulcrum/hooks/index-rebuild.sh"}]}],
    "SessionStart": [{"hooks": [{"type": "command", "command": "~/.fulcrum/hooks/index-check.sh"}]}]
  }
}
```

#### 7.1.3 Skills

Discovery order: `.agents/skills/` (walked up from cwd to repo root) → `/etc/codex/skills/`. Codex has no dedicated user-scope skills folder separate from `~/.agents/` — install skills at project-level `.agents/skills/` only. Do not use the global `~/.agents/` path.

SKILL.md frontmatter: `name` and `description` required (YAML).

#### 7.1.4 MCP

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.deepwiki]
url = "https://mcp.deepwiki.com/mcp"
```

---

### 7.2 Gemini CLI

Sources: [github.com/google-gemini/gemini-cli/docs/reference/configuration.md](https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/reference/configuration.md), [/hooks](https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/hooks/reference.md), [/extensions](https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/extensions/writing-extensions.md). Verified 2026-04-27.

#### 7.2.1 Context Layer

| File | Scope |
|---|---|
| `~/.gemini/GEMINI.md` | Global user-level |
| `GEMINI.md` | Project root (project-level) |
| `.gemini/GEMINI.md` | Project-level (alternative location) |

**`AGENTS.md` is not natively read by Gemini CLI.** Only `GEMINI.md` files are discovered. Keep `AGENTS.md` as the single source of truth and make `GEMINI.md` a one-line import:

```markdown
@AGENTS.md
```

Gemini CLI's memory import processor inlines the referenced file at load time. All other agents read `AGENTS.md` directly — no duplication, no drift.

#### 7.2.2 Hooks

Eleven events: `SessionStart`, `SessionEnd`, `BeforeModel`, `AfterModel`, `BeforeAgent`, `AfterAgent`, `BeforeTool`, `AfterTool`, `BeforeToolSelection`, `PreCompress`, `Notification`.

Hooks return JSON; can inject context via `hookSpecificOutput.additionalContext`, control tool access via `toolConfig`. Exit code 2 = emergency block.

Index maintenance — add to `~/.gemini/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [{"type": "command", "command": "~/.fulcrum/hooks/index-check.sh"}],
    "SessionEnd":   [{"type": "command", "command": "~/.fulcrum/hooks/index-rebuild.sh"}]
  }
}
```

**Known bug:** Underscores in MCP server alias names break Gemini's policy engine — use hyphens (`deepwiki` not `deep_wiki`).

#### 7.2.3 Skills

Skills in Gemini CLI live **inside Extensions**, not as standalone files. Extension structure:

```
~/.gemini/extensions/<ext-name>/
├── gemini-extension.json   ← required manifest
└── skills/
    └── <skill-name>/
        └── SKILL.md
```

There is no direct `~/.agents/skills/` discovery in Gemini CLI. Each skill must be wrapped in an extension. SKILL.md frontmatter: `name` and `description` required.

Install skills directly into `~/.gemini/extensions/<ext-name>/skills/<skill-name>/SKILL.md`. No shared path with other agents.

#### 7.2.4 MCP

`httpUrl` = Streamable HTTP (recommended); `url` = SSE (legacy). Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "deepwiki": {
      "httpUrl": "https://mcp.deepwiki.com/mcp"
    }
  }
}
```

---

### 7.3 OpenCode

> **Note: `opencode-ai/opencode` was archived on 2025-09-18 and is no longer maintained.** The successor project is **Crush** (by the original author + Charm team). Documentation below reflects the last stable OpenCode release; Crush may have different paths and APIs.

Sources: [opencode.ai/docs](https://opencode.ai/docs), plugins, skills, mcp-servers, rules references. Verified 2026-04-27.

#### 7.3.1 Context Layer

| File | Scope |
|---|---|
| `~/.config/opencode/AGENTS.md` | Global user-level |
| `~/.claude/CLAUDE.md` | Also loaded natively — shared with Claude Code |
| `AGENTS.md` | Project-level (walked up from cwd) |

At the same level, `AGENTS.md` takes precedence over `CLAUDE.md`. OpenCode reads `~/.claude/CLAUDE.md` as a fallback — a single global rules file covers both Claude Code and OpenCode.

#### 7.3.2 Plugins (hooks equivalent)

TypeScript plugins, not shell hooks. Locations: `~/.config/opencode/plugins/` (global) or `.opencode/plugins/` (project). npm packages declared in `opencode.json` under `"plugin"` are auto-installed.

Key events: `session.created`, `session.idle`, `session.compacted`, `tool.execute.before`, `tool.execute.after`, `file.edited`, `shell.env`, `permission.asked/replied`.

```typescript
// ~/.config/opencode/plugins/index-maintenance.ts
export const IndexPlugin = async ({ $ }) => ({
  "session.idle": async () => { await $`~/.fulcrum/hooks/index-rebuild.sh` },
  "session.created": async ({ inject }) => {
    const out = await $`~/.fulcrum/hooks/index-check.sh`
    if (out.stdout) inject(out.stdout)
  }
})
```

#### 7.3.3 Skills

Install path: `~/.config/opencode/skills/<name>/SKILL.md`. Also scans `~/.claude/skills/<name>/SKILL.md` (Claude Code compatibility). Each agent gets its own copy — do not share via a common path.

SKILL.md: `name` (lowercase alphanumeric + hyphens, 1–64 chars) and `description` (1–1024 chars) required. Skill directory name must match `name` field.

#### 7.3.4 MCP

`type` is required. Values: `"local"` (stdio subprocess) or `"remote"` (HTTP). Config at `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "deepwiki": {
      "type": "remote",
      "url": "https://mcp.deepwiki.com/mcp"
    }
  }
}
```

---

### 7.4 GitHub Copilot CLI

Sources: [docs.github.com — hooks-configuration](https://docs.github.com/en/copilot/reference/hooks-configuration), [add-skills](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills), [add-mcp-servers](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-mcp-servers), [cli-config-dir-reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-config-dir-reference). Verified 2026-04-27.

#### 7.4.1 Context Layer

| File | Scope |
|---|---|
| `~/.copilot/copilot-instructions.md` | Global user-level |
| `~/.copilot/instructions/*.instructions.md` | Global, additive |
| `AGENTS.md` | Project root — natively read |
| `.github/copilot-instructions.md` | Project repo-wide |
| `.github/instructions/**/*.instructions.md` | Path-scoped |

#### 7.4.2 Hooks

Six events: `sessionStart`, `sessionEnd`, `userPromptSubmitted`, `preToolUse`, `postToolUse`, `errorOccurred`.

Config: `.github/hooks/hooks.json` (project) or scripts in `~/.copilot/hooks/` (user-level). Requires top-level `"version": 1`.

```json
{
  "version": 1,
  "hooks": {
    "sessionEnd": [{"type": "command", "bash": "~/.fulcrum/hooks/index-rebuild.sh"}]
  }
}
```

**Context injection is not supported.** Only `preToolUse` produces meaningful output — it accepts `{"permissionDecision": "allow" | "deny" | "ask"}`. All other event outputs are ignored. `sessionEnd` fires after agent stops — suitable for index rebuild despite the injection limitation.

#### 7.4.3 Skills

Install path: `~/.copilot/skills/<name>/SKILL.md` (user-level). Project-level: `.github/skills/<name>/SKILL.md`.

SKILL.md: `name` (lowercase with hyphens) and `description` required.

#### 7.4.4 MCP

Config: `~/.copilot/mcp-config.json`:

```json
{
  "deepwiki": {
    "type": "http",
    "url": "https://mcp.deepwiki.com/mcp"
  }
}
```

`type`: `"http"` (Streamable HTTP, recommended) or `"sse"` (deprecated SSE).

#### 7.4.5 Parity Gaps vs Claude Code

| Gap | Detail |
|---|---|
| **No hook context injection** | Only `preToolUse` deny/allow is functional; all other hook output ignored |
| **Project-level hooks file** | `.github/hooks/hooks.json`, not inline in a settings file |

---

### 7.5 Pi CLI

Sources: [github.com/badlogic/pi-mono](https://github.com/badlogic/pi-mono), coding-agent README. Verified 2026-04-27.

#### 7.5.1 Context Layer

| File | Scope |
|---|---|
| `~/.pi/agent/AGENTS.md` or `~/.pi/agent/CLAUDE.md` | Global user-level |
| `AGENTS.md` / `CLAUDE.md` | Project-level (walked up from cwd) |
| `.pi/SYSTEM.md` | Replaces default system prompt (project) |
| `APPEND_SYSTEM.md` | Appended to system prompt (project) |

#### 7.5.2 Extensibility

Pi CLI has **no built-in hook system**. Extensibility is TypeScript extensions only — custom tools, commands, keyboard shortcuts, and event handlers. Shell-based index maintenance hooks are not directly supported; wrap in an extension if needed.

#### 7.5.3 Skills

Install path: `~/.pi/agent/skills/<name>/SKILL.md` (user-level). Project-level: `.agents/skills/` (walked up from cwd). Skills invoked via `/skill:name` syntax.

#### 7.5.4 MCP

**No built-in MCP support** — explicit design decision. DeepWiki unavailable via MCP. Workaround: `xh` or `curl` against the DeepWiki REST API directly from the shell tool.

#### 7.5.5 Parity Gaps vs Claude Code

| Gap | Detail |
|---|---|
| **No MCP** | DeepWiki unavailable; REST workaround only |
| **No shell hooks** | Extensions (TypeScript) only — no equivalent to Stop/SessionStart hooks |
