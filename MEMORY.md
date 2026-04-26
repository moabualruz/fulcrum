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

### 6.1 ast-grep (structural pattern search) — install as system CLI, not MCP

The npm package `ast-grep-mcp` does **not** exist. The first-party `ast-grep-mcp` is a Python experimental project at [ast-grep/ast-grep-mcp](https://github.com/ast-grep/ast-grep-mcp), not on npm. Rather than adding Python tooling for a niche bridge, we install the `ast-grep` CLI globally and let agents shell out — every CLI agent in scope (Claude/Codex/OpenCode/Gemini/Copilot) has shell access.

```bash
brew install ast-grep
ast-grep --version    # 0.42.x or newer
```

**Tighter integration on Claude Code:** the official `ast-grep/agent-skill` (slash commands, examples) is installed as a Claude plugin (see §8.1).

### 6.2 repomix (pack repo into context) — MCP

[yamadashy/repomix](https://github.com/yamadashy/repomix) is first-party. Run via `npx -y repomix --mcp`. With `--compress`, Tree-sitter strips function bodies and keeps signatures (~70% token reduction). Configured as an MCP server on every agent.

### 6.3 code-graph (graphify) — per-project install, not user-global

[safishamsi/graphify](https://github.com/safishamsi/graphify) is first-party. Distributed as a Python tool installed via `uv`. Its installer drops a per-project skill/hook into `.claude/skills/`, `.codex/skills/`, `.opencode/plugins/`, or `.gemini/settings.json` of the **current working directory**.

```bash
brew install uv
uv tool install graphifyy
# Run inside each project where you want code-graph awareness:
cd <project-root>
graphify install --platform claude       # or codex | opencode | gemini
```

Supported platforms (per `graphify install --help`): `claude | codex | opencode | gemini | aider | cursor | windows | claw | droid | trae | trae-cn | antigravity | hermes | kiro`. **Not supported: GitHub Copilot CLI** — drop graphify for that agent and use ast-grep + repomix only.

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

# Repomix MCP at user scope
claude mcp add -s user repomix -- npx -y repomix --mcp

# Repomix's three official Claude Code plugins
claude plugin marketplace add yamadashy/repomix
claude plugin install repomix-mcp@repomix
claude plugin install repomix-commands@repomix
claude plugin install repomix-explorer@repomix

# ast-grep official skill
claude plugin marketplace add ast-grep/agent-skill
claude plugin install ast-grep@ast-grep-marketplace

# graphify (run per-project where wanted)
# graphify install --platform claude
```

### 8.2 Codex CLI

```bash
codex mcp add memory --env MEMORY_FILE_PATH=/Users/mkh/.agent-memory/memory.jsonl \
  -- npx -y @modelcontextprotocol/server-memory
codex mcp add repomix -- npx -y repomix --mcp
# graphify per-project: graphify install --platform codex
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
graphify per-project: `graphify install --platform opencode`.

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
graphify per-project: `graphify install --platform gemini`.

### 8.5 GitHub Copilot CLI — `~/.copilot/mcp-config.json`

> Standalone agent harness installed via `npm install -g @github/copilot`. Not `gh copilot`, not the VS Code extension. **graphify does not support Copilot CLI**, so this agent gets memory + repomix + system ast-grep only.

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

---

## 9. Support Matrix (what landed)

| Agent | Memory | repomix | ast-grep | code-graph (graphify) |
|---|---|---|---|---|
| Claude Code | shared MCP (user scope) | MCP + 3 official plugins | system CLI + official skill | per-project |
| Codex CLI | shared MCP (global) | MCP | system CLI | per-project |
| OpenCode | shared MCP | MCP | system CLI | per-project |
| Gemini CLI | shared MCP | MCP | system CLI | per-project |
| Copilot CLI | shared MCP | MCP | system CLI | not supported |

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
- ✅ `ast-grep`, `uv`, `graphifyy` installed locally.
- ✅ `memory` and `repomix` MCP servers registered at user scope on Claude Code, Codex CLI, OpenCode, Gemini CLI, Copilot CLI.
- ✅ Claude Code plugins installed: `repomix-mcp`, `repomix-commands`, `repomix-explorer`, `ast-grep`.
- 🟡 graphify is installed locally; run `graphify install --platform <agent>` per project as needed.
- 🟡 `AGENTS.md` template is documented above; drop it into target projects as needed.
