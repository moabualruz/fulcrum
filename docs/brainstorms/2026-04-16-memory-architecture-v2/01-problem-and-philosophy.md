---
date: 2026-04-16
topic: memory-architecture-v2
part: "01"
title: Problem & Design Philosophy
index: index.md
next: 02-activation-and-inventory.md
---

# Memory Architecture v2 — 01 — Problem & Design Philosophy

**[← Index](index.md)** · **[Next: Activation & Inventory →](02-activation-and-inventory.md)**

## Problem

Fulcrum's memory system currently depends on agents manually calling `recall_memory` / `write_memory` tools. Hooks partially exist but write only parameter keys, with no dedup, typing, provenance, safety fence, or non-primary guards. Context compaction drops decisions silently. No durability policy — every write lives forever.

**Separately, Fulcrum already has code-index primitives (`packages/memory/src/ast-chunker.ts`, `chunkers/`, `repo-map.ts`, `ingest.ts`, Kuzu graph, tree-sitter) but they are not wired into a running system.** `ingestProject` is one-shot; there is no source-tree watcher (`startVaultWatcher` only watches the memory vault); each session could spawn its own watcher with no deduplication; there are no MCP tools for structured code search; the vec index goes stale as source files change.

**Memory and project content index must be designed together.** They share L0 (files), L1 (SQLite), and L2 (Kuzu graph + sqlite-vec). They should share the file watcher (one per project, reference-counted) and the query surface (symmetric tools). If separated they will diverge — code entities will not appear in memory's Kuzu graph, memory decisions will not link to code symbols, and two parallel watchers will thrash chokidar on the same tree. This spec unifies them.

This spec adapts the patterns verified in prior art (`prior-art/prior-art`), prior art Agent (`NousResearch/prior art`), Karpathy's LLM Wiki gist, and Rohit's LLM Wiki v2 extension directly onto Fulcrum's existing hook + MCP + indexing surface. It does not invent new patterns where research already answered the question.

## Design Philosophy

**Write-side automation; recall stays agent-explicit.** This is Fulcrum's one deliberate divergence from prior art+prior art research — justification in §2.1. Everything else follows research patterns.

**The short-term vault is a Karpathy-method LLM wiki, not a flat memory dump.** Every hook write produces a wiki-shaped markdown entry (frontmatter + body + `[[wikilinks]]`) under `{globalDataDir()}/memory/short_term/`. Dreaming maintains the wiki's index, logs, backlink graph, and entity graph — playing Karpathy's "wiki maintainer" role. Obsidian compatibility is a first-class property: users can open the vault in Obsidian and see the graph view with human curation mixed with agent writes.

**L0/L1/L2 per AGENTS.md invariant.** L0 vault (markdown files) → L1 SQLite rows (FTS5 + wikilinks table + tags table) → L2 Kuzu graph + sqlite-vec embeddings. L0 is canonical. L1 indexes everything in L0 for structured query. **L2 is durable-only** — embedding + graph population happens on Dreaming promotion, not on every write. This is the "only embed persistent" constraint: it keeps the vec index high-signal and makes hook writes cheap.

### Karpathy method mapping

| Karpathy element | Fulcrum realization |
|---|---|
| Raw sources | Tool outputs, compaction boundaries, task completions — captured by hooks |
| Wiki pages with `[[wikilinks]]` | Short-term vault files with frontmatter + inline wikilinks |
| `index.md` (content catalog) | Auto-maintained by Dreaming light phase |
| `log.md` (append-only chronology) | Per-day `YYYY-MM-DD.md` summary page linking to that day's writes |
| `CLAUDE.md` / schema document | Fulcrum's `AGENTS.md` + the `kind` taxonomy (§3.4) |
| Ingest operation | Hook writes (§1) |
| Query operation | Three paths (§2) |
| Lint operation | Dreaming light phase — contradictions, orphans, stale claims, missing cross-refs |
| Entity / relationship graph | Kuzu L2, populated by Dreaming REM phase |

### Consolidation tiers (Rohit's LLM Wiki v2 extension)

- **Working memory** — in-session transcript. Not persisted.
- **Episodic memory** — short-term vault wiki. FTS + wikilinks + tags, no embedding.
- **Semantic memory** — durable `MEMORY.md` + Kuzu entity graph. Full FTS + vec + graph.
- **Procedural memory** — `agent-integration/skills/` + Claude Code skills + native host skills. Loaded natively by each agent host.
- **Project Content Index (PCI)** — unified code + docs + memory index backed by one watcher, one FTS5 store, one Kuzu graph, one sqlite-vec index. Not a separate tier; a *unified substrate* all tiers sit on top of. See §1.1.

### Central store + scoping — one DB, one vault root, portable pathing

Everything lives under `globalDataDir()` from `fulcrum-core` (the HARD rule — never project-local). One central SQLite database, one Kuzu graph, one sqlite-vec index, one vault root. Scoping is a *query-time predicate*, not a storage partition.

**Filesystem layout** (all under `globalDataDir()`):

```
{globalDataDir()}/
├── db/
│   └── fulcrum.db               -- central SQLite (all workspaces, all projects)
├── kuzu/                         -- central Kuzu graph (all workspaces, all projects)
├── vec/                          -- central sqlite-vec index (durable memory + code)
├── memory/
│   ├── short_term/
│   │   └── <workspace_id>/<project_id>/**/*.md
│   ├── durable/
│   │   └── <workspace_id>/<project_id>/**/*.md
│   └── dreaming/                 -- light/REM/deep phase reports
├── code-index/                   -- optional cache of chunked code bodies
│   └── <workspace_id>/<project_id>/**
├── project-index-<sha>.lock      -- per-project cross-process watcher lock
└── sessions/                     -- per-session state (already exists)
```

**Scoping columns** on every indexed row:

- `workspace_id TEXT NOT NULL` — already on `memories`, `tasks`, `agent_runs`, `hook_events`
- `project_id TEXT NOT NULL` — already on memories / tasks; added to `code_files`, `code_chunks`, `code_symbols`, `memory_recall_events`, `memory_wikilinks`, `memory_tags`

**Portable pathing** — paths in the DB are **project-root-relative**, never machine-absolute:

- `code_files.rel_path` stores `packages/auth/session.ts`, not `/home/mkh/workspace/.../session.ts`.
- `file_id` = `sha256(project_id + ':' + rel_path)` — stable across moves of the project directory.
- A `projects` table row maps `project_id → current absolute root path`; moving the project updates one row. No other data migrates.
- Memory frontmatter `file_paths` is also project-relative.

**Scope hierarchy** (queried at tool-call time; see §2 + §11):

- **`session`** — predicate: `provenance.run_id == current_session_run_id`. For session-scoped recall (rare; mostly debugging).
- **`project`** — predicate: `workspace_id = $W AND project_id = $P`. Default for every MCP tool.
- **`workspace`** — predicate: `workspace_id = $W`. All projects in the current workspace.
- **`global`** — predicate: none (no workspace/project filter). Cross-workspace "wide agent knowledge." Gated by role policy (§12.12).

The `mcp__fulcrum__recall_memory` tool already has `query_scope: 'session' | 'project' | 'workspace'` per CLAUDE.md. V2 adds `'global'` and applies the same `scope` arg uniformly to `query_memory`, `search_code`, `code_context`.

**"Targeted vs. wide" access in practice:**

- Targeted: `search_code(symbol: 'resolveSessionId', scope: 'project', path: 'packages/auth/**')` — scoped to one subtree of one project.
- Wide: `recall_memory(query: 'jwt session rotation', scope: 'global')` — cross-workspace recall to surface how this pattern was solved in any past project.
- The agent declares scope explicitly; no tool implicitly leaks beyond `project` scope.

---

**[← Index](index.md)** · **[Next: Activation & Inventory →](02-activation-and-inventory.md)**
