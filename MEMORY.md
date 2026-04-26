# Unified CLI Agent Memory & Code Awareness — Foundation

> This document is the architectural foundation for rebuilding `fulcrum`. It is the only file on this branch by design.

---

## 1. Goals

Two persistent pain points across CLI coding agents (claude, codex, opencode, gemini, github-copilot CLI):

1. **Conversation memory drift** — every new session starts blank.
2. **Codebase blindness** — agents see only the files in their context window. The naive fix (index the repo into a vector DB) goes stale on `git checkout`.

Constraints:
- **Zero new paid services.** Reuse existing Anthropic Pro / OpenAI Pro / Google Pro plans.
- **Zero remote infrastructure.** No VPS, no Docker, no Caddy, no DNS. Everything local.
- **Zero code from the user.** Configuration files only.

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

## 3. Why Local-Only

The official `@modelcontextprotocol/server-memory` is **just a JSONL file** with MCP CRUD verbs around it. For a single user, putting that file behind Docker + Caddy + Cloudflare is overhead with no benefit. The agent already has the conversation in its own context — it can decide what to write. The "server" is just disk.

If multi-machine sharing is needed later, point `MEMORY_FILE_PATH` at a directory under git, iCloud Drive, Syncthing, or rsync targets — the file format is append-mostly JSONL, trivial to merge.

For now: one file, one machine, zero moving parts.

---

## 4. Target Architecture

```
┌──────────────────────────── Local machine ────────────────────────────┐
│                                                                       │
│   claude   codex   opencode   gemini   copilot     ← 5 CLI agents     │
│      │       │        │         │        │                            │
│      └───────┴────┬───┴─────────┴────────┘                            │
│                   │ four MCP servers, all via npx                     │
│       ┌───────────┼──────────────┬───────────────┐                    │
│       ▼           ▼              ▼               ▼                    │
│   memory      ast-grep       repomix        code-graph                │
│   (STDIO)     (STDIO)        (STDIO)         (STDIO)                  │
│       │                                                               │
│       ▼                                                               │
│   ~/.agent-memory/memory.jsonl                                        │
│                                                                       │
│   ast-grep / repomix / code-graph all read the working tree directly  │
│   → always branch-correct, no index, no stale state                   │
└───────────────────────────────────────────────────────────────────────┘
```

No network. No daemon. No VPS. The "memory server" is a Node process spawned by each agent on demand against a single shared JSONL file.

---

## 5. The Memory Layer

### 5.1 What it is
- `@modelcontextprotocol/server-memory` (official Anthropic MCP package, `npx`-runnable, MIT)
- Storage: a single JSONL file. Each line is one entity, relation, or observation.
- Tools exposed: `create_entities`, `add_observations`, `create_relations`, `search_nodes`, `read_graph`, `delete_entities`, `delete_observations`, `delete_relations`.

### 5.2 Why it's enough
- The **agent's own LLM** (Claude, GPT, Gemini — already running, already paid for) decides *what* to remember.
- The server is dumb storage. No second LLM, no embedding model, no vector DB.
- Search is keyword/substring. The agent rephrases queries, so this is sufficient for preferences/decisions/facts (it's not enough for fuzzy semantic recall — that's an explicit trade we accept).

### 5.3 Storage location
```
~/.agent-memory/memory.jsonl
```
- Plain text, human-readable, hand-editable.
- Backup = copy the file. Reset = `: > memory.jsonl`. Inspect = `cat | jq`.

### 5.4 Future-proofing (not built now)
If cross-machine sharing becomes important: make `~/.agent-memory/` a git repo with the bare remote on the VPS over SSH. Append-mostly JSONL merges cleanly. Zero new infrastructure.

---

## 6. The Code Layer (three local MCP tools)

All three are open source, free, run via `npx` on the laptop. No API keys. They operate on the current working tree, so branch awareness is automatic.

| Tool | What it does | Best for |
|---|---|---|
| **ast-grep-mcp** | Structural pattern search (AST-aware grep) | "Find every `useEffect` with empty deps", "list all exported async functions" |
| **repomix --mcp** | Packs the entire repo into one digest, `--compress` cuts ~70% of tokens | "Give me the whole repo as context", onboarding to a new codebase |
| **code-graph-mcp** | Builds an AST call/dependency graph; supports reverse-lookup ("who calls X?") | "Where is `processPayment` used?", "what does this function transitively depend on?" |

### Why all three (no redundancy)
- **ast-grep** → find code *patterns*
- **repomix** → deliver code *content*
- **code-graph** → map code *relationships*

Three different outputs, three different questions. Code-graph narrows the blast radius of a refactor; repomix then packs only the affected files; ast-grep handles surgical pattern hunts. They compose.

---

## 7. The Convention Layer

`AGENTS.md` at each project root. Read automatically by every agent listed below. Versioned with the code, so it follows branches.

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

## 8. Per-Agent Integration

### 8.0 Strict rule

Install only the *official plugin/skill authored by the tool's own maintainer*. Where no such first-party plugin exists, fall back to bare MCP. Do **not** install third-party umbrellas (e.g. `oh-my-opencode`, community `awesome-*` wrappers) — those bundle multiple tools and break the "one tool, one well-defined integration" model.

Memory is intentionally identical across all five agents: one `memory.jsonl`, accessed via `@modelcontextprotocol/server-memory` over MCP. That is the shared-memory contract — never substitute per-agent memory plugins (they fragment the store).

### 8.0a Integration Tier Matrix

| Agent ↓ / Tool → | ast-grep | repomix | code-graph |
|---|---|---|---|
| **Claude Code** | Official skill [ast-grep/agent-skill](https://github.com/ast-grep/agent-skill) | Official plugin set [yamadashy/repomix](https://repomix.com/guide/claude-code-plugins): `repomix-mcp`, `repomix-commands`, `repomix-explorer` | Official multi-platform installer [graphify](https://github.com/safishamsi/graphify) |
| **Codex CLI** | Same official [ast-grep/agent-skill](https://github.com/ast-grep/agent-skill) via Codex's skill mechanism | MCP (`npx repomix --mcp`) | Official multi-platform installer [graphify](https://github.com/safishamsi/graphify) |
| **OpenCode** | MCP (`npx ast-grep-mcp`) | MCP | Official multi-platform installer [graphify](https://github.com/safishamsi/graphify) (`--platform opencode`) |
| **Gemini CLI** | MCP | MCP | Official multi-platform installer [graphify](https://github.com/safishamsi/graphify) (`gemini extensions install safishamsi/graphify`) |
| **Copilot CLI** | MCP | MCP | Official multi-platform installer [graphify](https://github.com/safishamsi/graphify) (`--platform copilot`) |

**Three official-plugin lanes only:**
- `ast-grep/agent-skill` → Claude Code, Codex CLI
- `yamadashy/repomix` Claude Code plugin set → Claude Code only
- `safishamsi/graphify` cross-platform native installer → all five agents

Everything else is bare MCP.

> **Copilot CLI built-in memory:** Pro/Pro+ users have a native Copilot Memory feature enabled by default. It's repo-local and operates *in addition to* our shared `memory.jsonl`. Don't disable it; ignore it — it doesn't interfere.

### 8.0b Plugin/Skill Registries (for ongoing discovery)

| Agent | Official registry | Discovery URL |
|---|---|---|
| Claude Code | `claude plugins marketplace` | (built-in) |
| Codex CLI | [openai/skills](https://github.com/openai/skills), [awesome-codex-skills](https://github.com/ComposioHQ/awesome-codex-skills) | [awesomeskills.dev](https://www.awesomeskills.dev/) |
| OpenCode | [opencode.ai/docs/ecosystem](https://opencode.ai/docs/ecosystem/), [awesome-opencode](https://github.com/awesome-opencode/awesome-opencode) | [opencode.cafe](https://www.opencode.cafe/) |
| Gemini CLI | [gemini-cli-extensions](https://github.com/gemini-cli-extensions) (Google official org), [awesome-gemini-cli-extensions](https://github.com/Piebald-AI/awesome-gemini-cli-extensions) | [geminicli.com/extensions](https://geminicli.com/extensions/) |
| Copilot CLI | [github/awesome-copilot](https://github.com/github/awesome-copilot) | [awesome-copilot.github.com](https://awesome-copilot.github.com/) |

### 8.1 Claude Code

Install the official plugins (slash commands + auto-loading), then add only the memory MCP entry (no plugin exists for it):

```bash
# Repomix — official plugin marketplace (3 plugins: repomix-mcp, repomix-commands, repomix-explorer)
claude plugins marketplace add yamadashy/repomix
claude plugins install repomix-mcp@repomix
claude plugins install repomix-commands@repomix
claude plugins install repomix-explorer@repomix

# ast-grep — official skill
claude plugins install ast-grep/agent-skill

# code-graph — graphify (multi-platform native)
graphify install --platform claude
```

`~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "env": { "MEMORY_FILE_PATH": "/Users/mkh/.agent-memory/memory.jsonl" }
    }
  }
}
```

### 8.2 Codex CLI — `~/.codex/config.toml`

```bash
# Official skills via Codex's $skill-installer
$skill-installer install ast-grep/agent-skill
$skill-installer install https://github.com/safishamsi/graphify
```

```toml
[mcp_servers.memory]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-memory"]
env = { MEMORY_FILE_PATH = "/Users/mkh/.agent-memory/memory.jsonl" }

[mcp_servers.repomix]
command = "npx"
args = ["-y", "repomix", "--mcp"]

# ast-grep — provided by skill above; MCP fallback in case skill isn't loaded:
[mcp_servers.ast-grep]
command = "npx"
args = ["-y", "ast-grep-mcp"]
```

### 8.3 OpenCode — `~/.config/opencode/config.json`

Only the official `graphify` installer. Everything else is bare MCP.

```bash
# Official multi-platform installer (writes .opencode/plugins/graphify.js + AGENTS.md hooks)
uv tool install graphifyy && graphify install --platform opencode
```

```json
{
  "mcp": {
    "memory": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-memory"],
      "environment": { "MEMORY_FILE_PATH": "/Users/mkh/.agent-memory/memory.jsonl" },
      "enabled": true
    },
    "ast-grep": {
      "type": "local",
      "command": ["npx", "-y", "ast-grep-mcp"],
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

### 8.4 Gemini CLI — `~/.gemini/settings.json`

Gemini ignores ast-grep MCP in practice (per the ast-grep team's own blog). Install `graphify` natively. Optionally also Google's official Neo4j extension if you want a graph-DB-backed code intelligence layer.

```bash
gemini extensions install safishamsi/graphify
# Optional, official Google: Neo4j-backed memory + code intelligence
# gemini extensions install https://github.com/gemini-cli-extensions/neo4j
```

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "env": { "MEMORY_FILE_PATH": "/Users/mkh/.agent-memory/memory.jsonl" }
    },
    "ast-grep": {
      "command": "npx",
      "args": ["-y", "ast-grep-mcp"]
    },
    "repomix": {
      "command": "npx",
      "args": ["-y", "repomix", "--mcp"]
    }
  }
}
```

### 8.5 GitHub Copilot CLI

> Standalone agent harness (`npm install -g @github/copilot`). Not `gh copilot`, not the VS Code extension.

```bash
# Official multi-platform installer (only first-party plugin used here)
graphify install --platform copilot
```

> **Built-in Copilot Memory:** for Pro/Pro+ users this is enabled by default and is *additive* to our shared `memory.jsonl` — Copilot Memory captures repo-local patterns; our MCP memory captures cross-agent shared facts. Don't disable it.

`~/.copilot/mcp-config.json`:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"],
      "env": { "MEMORY_FILE_PATH": "/Users/mkh/.agent-memory/memory.jsonl" }
    },
    "ast-grep": {
      "command": "npx",
      "args": ["-y", "ast-grep-mcp"]
    },
    "repomix": {
      "command": "npx",
      "args": ["-y", "repomix", "--mcp"]
    }
  }
}
```

### 8.6 Sanity check before installing

Plugin/skill verbs change between releases. Before running any install command above, confirm syntax with the agent's own help:

```bash
claude plugins --help
codex --help            # then look for skills / $skill-installer
opencode plugin --help
gemini extensions --help
copilot plugin --help
```

If a specific install command has changed, the bare MCP block in each section still works — the official plugin only adds slash-command UX, not core functionality.

---

## 9. Support Matrix

| Agent | Memory | ast-grep | repomix | code-graph | AGENTS.md |
|---|---|---|---|---|---|
| Claude Code | shared MCP | Official skill | 3 official plugins | graphify (native) | ✓ |
| Codex CLI | shared MCP | Official skill | MCP | graphify (native) | ✓ |
| OpenCode | shared MCP | MCP | MCP | graphify (native) | ✓ |
| Gemini CLI | shared MCP | MCP | MCP | graphify (native) | ✓ |
| Copilot CLI | shared MCP | MCP | MCP | graphify (native) | ✓ |

All five agents read and write the **same** `~/.agent-memory/memory.jsonl`. That is the unified-memory guarantee.

---

## 10. Bootstrap (one-time, on the laptop)

```bash
mkdir -p ~/.agent-memory
touch ~/.agent-memory/memory.jsonl
```

Each agent's MCP config above will spawn the memory server on demand.

---

## 11. Verification

| Check | How |
|---|---|
| Memory writes | In Claude: "Remember that I prefer pnpm over npm." Confirm a line appears in `~/.agent-memory/memory.jsonl`. |
| Memory reads | New Claude session: "What's my package manager preference?" |
| Cross-agent recall | Switch to Codex CLI, ask the same question. Same answer. |
| ast-grep working | "Use ast-grep to find all exported async functions in `src/`." |
| repomix working | "Use repomix with --compress to summarize this repo." |
| code-graph working | "Use code-graph to list every caller of `<somefunc>`." |
| AGENTS.md picked up | New session in a project: "what package manager does this use?" |
| Branch independence | `git checkout` a different branch → ast-grep/code-graph reflect new branch immediately; memory unchanged. |

---

## 12. Tools Evaluated and Excluded

| Tool | Why excluded |
|---|---|
| **Graphiti / Zep / mem0 (server-side LLM extraction)** | Needs its own LLM inside the server process, which forces Ollama on a host (3–4 GB RAM, second model). Official MCP memory server uses the *agent's own* LLM — no duplicate intelligence layer. |
| **Greptile** | Paid SaaS. Violates zero-new-paid-services. |
| **Aider RepoMapper MCP** | Redundant with `code-graph-mcp` (both AST/call graphs). |
| **Ollama** | Only required if running an extraction-based memory layer; removed by design. |
| **Vector-DB code indexing (Chroma, Qdrant, …)** | The drift problem this plan exists to avoid. Live tools on the working tree are correct by construction. |
| **VPS hosting of the memory file** | Single-user setup — Docker + Caddy + DNS adds zero value over a local file. Re-introduce only if multi-machine sync becomes a real need (then via git over SSH, no service). |
| **oh-my-opencode / awesome-* umbrella plugins** | Bundle multiple tools under one third-party wrapper. Violates the strict "first-party only" rule (§8.0). |
| **Per-agent memory plugins (gemini-mem, opencode-mem, etc.)** | Use private backends, fragment the unified `memory.jsonl` store. |

---

## 13. Day-2 Operations

- **Backup**: `cp ~/.agent-memory/memory.jsonl <somewhere-backed-up>` — single text file, fits any backup routine.
- **Inspect**: `tail -f ~/.agent-memory/memory.jsonl | jq`
- **Reset**: `: > ~/.agent-memory/memory.jsonl`
- **Hand-edit**: just edit the file with any text editor; close all agent sessions first to avoid races.
- **Add a machine later**: copy the JSONL over, point that machine's MCP configs at it.
- **Sync across machines**: turn `~/.agent-memory/` into a git repo with the bare remote on the VPS over SSH; pre/post-session pull/push hooks. JSONL merges cleanly.

---

## 14. Why this becomes the foundation for fulcrum

Fulcrum, rebuilt around this design, becomes:
- A thin orchestrator that wraps these four MCP tools per-project,
- Owns the `AGENTS.md` template, the memory bootstrap, and the per-agent config snippets,
- Exposes a single `fulcrum init` that drops `AGENTS.md` into a project and, if missing, writes/merges the four MCP entries into each installed agent's config.
- Stays out of the data path: never proxies memory traffic, never holds a vector DB, never indexes code. Agents talk MCP→tool directly. Fulcrum's only job is *consistent setup*.

That keeps fulcrum small, replaceable, and aligned with the constraint set above.

---

## 15. Rollout Order

1. Create the orphan branch in `fulcrum` and commit this document as `MEMORY.md` (done in this branch).
2. On the laptop: bootstrap `~/.agent-memory/`, wire Claude Code first (§8.1), verify (§11).
3. Replicate config to the other four agents.
4. Drop `AGENTS.md` into the most-used repos.
5. Begin fulcrum rebuild on a separate working branch off this foundation.
