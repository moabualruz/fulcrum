# Unified CLI Agent Memory & Code Awareness — Foundation

> Architectural foundation for rebuilding `fulcrum`. This document is the only file on this branch by design. All install commands below have been executed and verified against current CLI versions.

---

## 1. Goals

Two persistent pain points across CLI coding agents (claude, codex, opencode, gemini, github-copilot CLI):

1. **Conversation memory drift** — every new session starts blank.
2. **Codebase blindness** — agents see only what's in their context window. Indexing into a vector DB goes stale on `git checkout`.

Constraints:
- **Zero new paid services.** Reuse existing Anthropic Pro / OpenAI Pro / Google Pro plans.
- **Zero remote infrastructure.** No VPS, no Docker, no Caddy, no DNS. Everything local.
- **Zero code from the user.** Configuration files only.
- **First-party only.** Install only plugins/skills/extensions authored by the tool's own maintainer. Bare CLI/MCP otherwise. No third-party umbrella plugins (`oh-my-opencode`, `awesome-*` wrappers).

---

## 2. Architectural Insight

Knowledge has three different lifetimes. Don't pile them into one bucket — that's what causes the central-DB-vs-branch-drift conflict.

| Layer | What lives here | Lifetime | Where it lives | Why it doesn't drift |
|---|---|---|---|---|
| **Slow-changing facts** | Decisions, preferences, design rationale, project goals | Months / forever | Local JSONL file (`~/.agent-memory/memory.jsonl`) | These aren't code — branches don't affect them |
| **Code structure** | Symbols, call graphs, dependencies | Seconds | Live tools on the working tree (no index) | Always reads current files = always correct branch |
| **Project conventions** | Stack, commands, style rules | Per-branch | `AGENTS.md` in the repo | Versioned with the code itself |

Each layer is correct by construction. No cross-layer drift, no rebuilds.

---

## 3. Why Local-Only Memory

The official `@modelcontextprotocol/server-memory` is **just a JSONL file** with MCP CRUD verbs around it. For a single user, putting that file behind Docker + Caddy + Cloudflare is overhead with no benefit. The agent already has the conversation in its own context — it can decide what to write. The "server" is just disk.

Future cross-machine sharing: point `MEMORY_FILE_PATH` at a directory under git/iCloud Drive/Syncthing/rsync. Append-mostly JSONL merges cleanly.

For now: one file, one machine, zero moving parts.

---

## 4. Target Architecture

```
┌──────────────────────────── Local machine ────────────────────────────┐
│                                                                       │
│   claude   codex   opencode   gemini   copilot     ← 5 CLI agents     │
│      │       │        │         │        │                            │
│      └───────┴────┬───┴─────────┴────────┘                            │
│                   │ shared user-scope MCP servers                     │
│       ┌───────────┼─────────────┐                                     │
│       ▼           ▼             ▼                                     │
│   memory      repomix      [native CLI: ast-grep / git / grep]        │
│   (STDIO)     (STDIO)      (shell, no MCP wrapper)                    │
│       │                                                               │
│       ▼                                                               │
│   ~/.agent-memory/memory.jsonl                                        │
│                                                                       │
│   Plus, per-project where wanted: graphify code-graph skill           │
│   (installs into the project's .claude/.codex/.opencode/.gemini dir)  │
└───────────────────────────────────────────────────────────────────────┘
```

No network. No daemon. No VPS. Memory is a Node process spawned by each agent against a single shared JSONL file.

---

## 5. The Memory Layer

### 5.1 What it is
- `@modelcontextprotocol/server-memory` (official Anthropic MCP package, `npx`-runnable, MIT)
- Storage: a single JSONL file. Each line is one entity, relation, or observation.
- Tools: `create_entities`, `add_observations`, `create_relations`, `search_nodes`, `read_graph`, `delete_*`.

### 5.2 Why it's enough
- The **agent's own LLM** (Claude, GPT, Gemini — already running, already paid for) decides *what* to remember.
- The server is dumb storage. No second LLM, no embedding model, no vector DB.
- Search is keyword/substring. The agent rephrases queries, so this is sufficient for preferences/decisions/facts. (Not enough for fuzzy semantic recall — accepted trade.)

### 5.3 Storage location
```
~/.agent-memory/memory.jsonl
```
Plain text, human-readable, hand-editable. Backup = copy the file. Reset = `: > memory.jsonl`. Inspect = `cat | jq`.

---

## 6. The Code Layer

### 6.1 ast-grep (structural pattern search) — system CLI **plus** skill on every agent

The npm package `ast-grep-mcp` does **not** exist. The first-party `ast-grep-mcp` is a Python experimental project at [ast-grep/ast-grep-mcp](https://github.com/ast-grep/ast-grep-mcp), not on npm. Rather than adding Python tooling for a niche bridge, we use the `ast-grep` CLI directly and rely on the official **agent skill** to teach every agent how/when to use it.

**Important rule discovered during rollout:** *a system CLI alone isn't enough — every agent also needs the official skill (the `SKILL.md` + reference docs from [ast-grep/agent-skill](https://github.com/ast-grep/agent-skill))* so the model knows the YAML rule format, meta-variable syntax, and the canonical workflow. Without the skill, agents tend to invent broken `ast-grep` invocations.

Approach:

1. Install the `ast-grep` CLI once on the machine (`brew install ast-grep`).
2. On agents that have a marketplace mechanism (Claude Code, Codex CLI), install the skill via the marketplace.
3. On agents that don't (OpenCode, Gemini CLI, Copilot CLI), **copy** the same first-party `SKILL.md` + `references/` directly into each agent's skills directory. The content is unchanged — it's still ast-grep's first-party material, just placed where the agent looks for skills.

```bash
# 1. CLI
brew install ast-grep                 # 0.42.x or newer

# 2a. Claude Code (marketplace)
claude plugin marketplace add ast-grep/agent-skill
claude plugin install ast-grep@ast-grep-marketplace

# 2b. Codex CLI (marketplace + config.toml enable)
codex plugin marketplace add ast-grep/agent-skill
# then in ~/.codex/config.toml:
#   [plugins."ast-grep@ast-grep-marketplace"]
#   enabled = true

# 3. OpenCode / Gemini / Copilot — copy the same first-party skill
SRC=~/.claude/plugins/marketplaces/ast-grep-marketplace/ast-grep/skills/ast-grep
for dest in ~/.config/opencode/skills/ast-grep \
            ~/.gemini/skills/ast-grep \
            ~/.copilot/skills/ast-grep; do
  mkdir -p "$dest" && cp -R "$SRC"/. "$dest"/
done
```

### 6.2 repomix (pack repo into context) — MCP

[yamadashy/repomix](https://github.com/yamadashy/repomix) is first-party. Run via `npx -y repomix --mcp`. With `--compress`, Tree-sitter strips function bodies and keeps signatures (~70% token reduction). Configured as an MCP server on every agent.

### 6.3 code-graph (graphify) — user-scope skill on all 5 agents

[safishamsi/graphify](https://github.com/safishamsi/graphify) is first-party. The Python CLI (`graphify install --platform <agent>`) writes a `SKILL.md` plus version pin into the agent's user-scope skills directory. Same pattern as ast-grep: a system CLI (the `graphify` Python tool) plus a skill that teaches the agent how/when to use it.

```bash
brew install uv
uv tool install graphifyy

graphify install --platform claude     # ~/.claude/skills/graphify
graphify install --platform codex      # ~/.agents/skills/graphify (Codex's skills dir)
graphify install --platform opencode   # ~/.config/opencode/skills/graphify
graphify install --platform gemini     # ~/.gemini/skills/graphify
```

Supported by `graphify install`: `claude | codex | opencode | gemini | aider | cursor | windows | claw | droid | trae | trae-cn | antigravity | hermes | kiro`. **Copilot CLI is not in that list**, so we apply the same first-party-skill-copy pattern as ast-grep — the `SKILL.md` is identical first-party content; only the placement differs:

```bash
mkdir -p ~/.copilot/skills/graphify && \
  cp -R ~/.claude/skills/graphify/. ~/.copilot/skills/graphify/
```

The `graphify` CLI itself (used to build the graph and answer queries) is invoked from any project's working tree — it doesn't need per-agent registration beyond the skill above.

---

## 7. The Convention Layer

`AGENTS.md` at each project root. Read automatically by every agent. Versioned with the code, so it follows branches.

```markdown
# AGENTS.md

## Project
<one-line description>

## Stack
- Language / runtime:
- Framework:
- Package manager: (pnpm | npm | bun | uv | cargo …)
- Test runner:

## Commands
- Install:        <cmd>
- Dev server:     <cmd>
- Test:           <cmd>
- Lint / format:  <cmd>
- Build:          <cmd>

## Conventions
- Branch naming:
- Commit style:
- Code style:
- Folder layout:

## Do / Don't
- DO …
- DON'T …

## Memory hints
When using the `memory` MCP server, tag entities with project slug `<slug>`
so cross-project recall stays clean.
```

---

## 8. Per-Agent Installation (verified commands)

### 8.0 Bootstrap (one-time, on the laptop)

```bash
mkdir -p ~/.agent-memory
touch ~/.agent-memory/memory.jsonl
brew install ast-grep uv
uv tool install graphifyy
```

### 8.1 Claude Code

```bash
# Memory MCP at user scope
claude mcp add -s user memory \
  -e MEMORY_FILE_PATH=/Users/mkh/.agent-memory/memory.jsonl \
  -- npx -y @modelcontextprotocol/server-memory

# Repomix's three official Claude Code plugins (one of them registers MCP automatically)
claude plugin marketplace add yamadashy/repomix
claude plugin install repomix-mcp@repomix
claude plugin install repomix-commands@repomix
claude plugin install repomix-explorer@repomix

# ast-grep official skill
claude plugin marketplace add ast-grep/agent-skill
claude plugin install ast-grep@ast-grep-marketplace

# graphify skill at user scope (~/.claude/skills/graphify)
graphify install --platform claude
```

> Do **not** run `claude mcp add -s user repomix` separately — the `repomix-mcp` plugin already exposes a `plugin:repomix-mcp:repomix` MCP server and a manual entry creates a duplicate. Verify with `claude mcp list`.

### 8.2 Codex CLI

```bash
# Memory + repomix MCP at global (user) scope
codex mcp add memory --env MEMORY_FILE_PATH=/Users/mkh/.agent-memory/memory.jsonl \
  -- npx -y @modelcontextprotocol/server-memory
codex mcp add repomix -- npx -y repomix --mcp

# Official ast-grep skill via Codex's marketplace mechanism
codex plugin marketplace add ast-grep/agent-skill
# Then enable in ~/.codex/config.toml (Codex has no `plugin install` verb):
#   [plugins."ast-grep@ast-grep-marketplace"]
#   enabled = true

# graphify skill (Codex looks at ~/.agents/skills/, not ~/.codex/skills/)
graphify install --platform codex
```

### 8.3 OpenCode — `~/.config/opencode/opencode.json`

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "memory": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-memory"],
      "environment": { "MEMORY_FILE_PATH": "/Users/mkh/.agent-memory/memory.jsonl" },
      "enabled": true
    },
    "repomix": {
      "type": "local",
      "command": ["npx", "-y", "repomix", "--mcp"],
      "enabled": true
    }
  }
}
```

```bash
graphify install --platform opencode    # writes ~/.config/opencode/skills/graphify
# ast-grep skill (copy from Claude's installed marketplace)
mkdir -p ~/.config/opencode/skills/ast-grep && \
  cp -R ~/.claude/plugins/marketplaces/ast-grep-marketplace/ast-grep/skills/ast-grep/. \
        ~/.config/opencode/skills/ast-grep/
```

### 8.4 Gemini CLI — `~/.gemini/settings.json`

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "env": { "MEMORY_FILE_PATH": "/Users/mkh/.agent-memory/memory.jsonl" }
    },
    "repomix": {
      "command": "npx",
      "args": ["-y", "repomix", "--mcp"]
    }
  }
}
```

```bash
graphify install --platform gemini      # writes ~/.gemini/skills/graphify
# ast-grep skill (copy from Claude's installed marketplace)
mkdir -p ~/.gemini/skills/ast-grep && \
  cp -R ~/.claude/plugins/marketplaces/ast-grep-marketplace/ast-grep/skills/ast-grep/. \
        ~/.gemini/skills/ast-grep/
```

> **Gemini display quirk:** `gemini mcp list` returns empty output even when `~/.gemini/settings.json` is correctly populated. The settings file is the source of truth — `gemini mcp add` mutates the same file. The actual MCP servers load when a real Gemini session starts; the `list` command appears to be a Gemini-CLI display bug as of v0.39.x.

### 8.5 GitHub Copilot CLI — `~/.copilot/mcp-config.json`

> Standalone agent harness installed via `npm install -g @github/copilot`. Not `gh copilot`, not the VS Code extension. graphify's CLI installer doesn't list Copilot as a supported platform, but the skill is just markdown — we copy it (see §6.3).

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "env": { "MEMORY_FILE_PATH": "/Users/mkh/.agent-memory/memory.jsonl" }
    },
    "repomix": {
      "command": "npx",
      "args": ["-y", "repomix", "--mcp"]
    }
  }
}
```

> **Built-in Copilot Memory:** Pro/Pro+ users have a native Copilot Memory feature enabled by default. It's repo-local and *additive* to our shared `memory.jsonl`. Don't disable it; ignore it — it doesn't interfere.

```bash
# ast-grep skill (copy from Claude's installed marketplace)
mkdir -p ~/.copilot/skills/ast-grep && \
  cp -R ~/.claude/plugins/marketplaces/ast-grep-marketplace/ast-grep/skills/ast-grep/. \
        ~/.copilot/skills/ast-grep/

# graphify skill (copy from Claude's user-scope install)
mkdir -p ~/.copilot/skills/graphify && \
  cp -R ~/.claude/skills/graphify/. ~/.copilot/skills/graphify/
```

---

## 9. Support Matrix (what landed)

| Agent | Memory | repomix | ast-grep | code-graph (graphify) |
|---|---|---|---|---|
| Claude Code | shared MCP (user) | MCP via `repomix-mcp` plugin (3 plugins total) | system CLI + official skill (marketplace) | user-scope skill |
| Codex CLI | shared MCP (global) | MCP | system CLI + official skill (marketplace + config.toml) | user-scope skill (`~/.agents/skills/`) |
| OpenCode | shared MCP | MCP | system CLI + official skill (copied to `~/.config/opencode/skills/ast-grep`) | user-scope skill |
| Gemini CLI | shared MCP (settings.json) | MCP | system CLI + official skill (copied to `~/.gemini/skills/ast-grep`) | user-scope skill |
| Copilot CLI | shared MCP | MCP | system CLI + official skill (copied to `~/.copilot/skills/ast-grep`) | skill copied to `~/.copilot/skills/graphify` |

Every agent has both the `ast-grep` binary **and** the official ast-grep skill, and every agent has the graphify skill. Skill content is identical first-party material; only the install mechanism differs (marketplace install where supported, otherwise file copy from a sibling agent's user-scope skills dir).

All five agents read and write the **same** `~/.agent-memory/memory.jsonl`. That is the unified-memory guarantee.

---

## 10. Verification

| Check | How |
|---|---|
| Memory writes | In Claude: "Remember that I prefer pnpm over npm." Confirm a line in `~/.agent-memory/memory.jsonl`. |
| Memory reads | New Claude session: "What's my package manager preference?" |
| Cross-agent recall | Switch to Codex CLI, ask the same question. Same answer. |
| Repomix slash command (Claude) | `/repomix-commands:pack-local` should be available. |
| ast-grep skill (Claude) | Ask "use ast-grep to find all exported async functions" — the skill should kick in with structured patterns. |
| ast-grep CLI (other agents) | Ask agent to shell out: `ast-grep run -p '$X.then($Y)' src/` |
| Repomix MCP everywhere | Ask agent: "use repomix mcp to pack this repo with --compress." |
| graphify per-project | `cd <project>; graphify install --platform <agent>; <agent>` then `/graphify .` |
| Branch independence | `git checkout` a different branch → ast-grep/repomix/graphify all reflect new branch immediately; memory unchanged. |

---

## 11. Tools Evaluated and Excluded

| Tool | Why excluded |
|---|---|
| **Graphiti / Zep / mem0 (server-side LLM extraction)** | Forces a second LLM (e.g. Ollama) on the host. Official MCP memory server uses the agent's own LLM — no duplicate intelligence layer. |
| **Greptile** | Paid SaaS. |
| **Aider RepoMapper MCP** | Redundant with graphify (both AST/call graphs). |
| **Ollama** | Only needed for extraction-based memory layers; removed by design. |
| **Vector-DB code indexing (Chroma, Qdrant, …)** | Drift problem. Live tools are correct by construction. |
| **VPS hosting of memory file** | Single-user — adds zero value over a local file. Re-introduce only if multi-machine sync becomes a real need (then via git over SSH, no service). |
| **oh-my-opencode / awesome-* umbrella plugins** | Bundle multiple tools under a third-party wrapper. Violates first-party-only rule (§1). |
| **Per-agent memory plugins (gemini-mem, opencode-mem, etc.)** | Fragment the unified `memory.jsonl` store. |
| **`@notprolands/ast-grep-mcp` (npm)** | Community wrapper, not first-party. The first-party Python experimental MCP server isn't on npm; we use `ast-grep` CLI directly via shell instead. |

---

## 12. Day-2 Operations

- **Backup**: `cp ~/.agent-memory/memory.jsonl <somewhere-backed-up>`.
- **Inspect**: `tail -f ~/.agent-memory/memory.jsonl | jq`
- **Reset**: `: > ~/.agent-memory/memory.jsonl`
- **Hand-edit**: just edit the file; close all agent sessions first to avoid races.
- **Add a machine later**: copy the JSONL over, point that machine's MCP configs at it.
- **Sync across machines**: turn `~/.agent-memory/` into a git repo with the bare remote on the VPS over SSH; pre/post-session pull/push hooks. JSONL merges cleanly.
- **Add code-graph to a new project**: `cd <project> && graphify install --platform <agent>`.

---

## 13. Why this is the foundation for fulcrum

Fulcrum, rebuilt around this design, becomes:

- A thin orchestrator that wraps memory + repomix + graphify per-project,
- Owns the `AGENTS.md` template, memory bootstrap, and the per-agent install snippets,
- Exposes a single `fulcrum init` that:
  - Drops `AGENTS.md` into a project (if missing),
  - Runs `graphify install --platform <agent>` for each detected agent,
  - Verifies user-global MCP entries are wired (one-time per machine),
- Stays out of the data path: never proxies memory traffic, never holds a vector DB, never indexes code itself. Agents talk MCP→tool directly. Fulcrum's only job is *consistent setup*.

That keeps fulcrum small, replaceable, and aligned with the constraint set above.

---

## 14. Implementation status (as committed)

This commit reflects an **executed** rollout, not a proposal:

- ✅ `~/.agent-memory/memory.jsonl` created.
- ✅ `ast-grep`, `uv`, `graphifyy` installed locally (via `brew` + `uv tool`).
- ✅ `memory` MCP at user scope on all 5 agents; `repomix` MCP at user scope on Codex / OpenCode / Gemini / Copilot, and via the `repomix-mcp` plugin on Claude Code (verified single-source — no duplicate manual entry).
- ✅ Claude Code plugins installed (user scope): `repomix-mcp@repomix`, `repomix-commands@repomix`, `repomix-explorer@repomix`, `ast-grep@ast-grep-marketplace`.
- ✅ Codex CLI: `ast-grep/agent-skill` marketplace added and `[plugins."ast-grep@ast-grep-marketplace"] enabled = true` set in `~/.codex/config.toml`.
- ✅ ast-grep skill copied to OpenCode (`~/.config/opencode/skills/ast-grep`), Gemini (`~/.gemini/skills/ast-grep`), Copilot CLI (`~/.copilot/skills/ast-grep`) — same first-party `SKILL.md` + `references/` from the ast-grep marketplace, just placed where each agent looks for skills.
- ✅ graphify skill at user scope on all 5 agents: Claude (`~/.claude/skills/graphify`), Codex (`~/.agents/skills/graphify`), OpenCode (`~/.config/opencode/skills/graphify`), Gemini (`~/.gemini/skills/graphify`), Copilot (`~/.copilot/skills/graphify` — copied, since graphify's CLI installer doesn't target Copilot).
- 🟡 `AGENTS.md` template documented in §7; drop into target projects as needed.
- 🟡 graphify is also a per-project tool: from inside a repo, `/graphify .` builds the knowledge graph in `graphify-out/`.

### Audit caveats / known quirks

- `gemini mcp list` returns empty output despite `~/.gemini/settings.json` being correctly populated and read. CLI display quirk; servers do load when a session starts.
- `claude mcp list` shows `plugin:repomix-mcp:repomix` (provided by the plugin) — not a duplicate of `memory`. There is no separately-added `repomix` user-scope server on Claude (intentional — adding one creates a duplicate).
- Copilot CLI does not appear in graphify's CLI installer platform list (`claude | codex | opencode | aider | gemini | cursor | windows | claw | droid | trae | trae-cn | antigravity | hermes | kiro`). Closed by copying the same first-party `SKILL.md` from `~/.claude/skills/graphify` into `~/.copilot/skills/graphify` — the skill is plain markdown, the `graphify` CLI itself is a system binary that any agent invokes via shell.
