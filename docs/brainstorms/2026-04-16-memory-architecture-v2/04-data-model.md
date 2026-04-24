---
date: 2026-04-16
topic: memory-architecture-v2
part: "04"
title: Data Model & Tiers
index: index.md
prev: 03-write-and-recall-paths.md
next: 05-safety-watcher-wal.md
---

# Memory Architecture v2 — 04 — Data Model & Tiers

**[← Index](index.md)** · **[← Prev: Write & Recall Paths](03-write-and-recall-paths.md)** · **[Next: Safety, Watcher, WAL →](05-safety-watcher-wal.md)**

## 3. Data Model

Additive schema changes in `fulcrum-core` (owns schema per AGENTS.md §"Package Ownership Boundaries"). No destructive migrations; old rows keep NULL values until Dreaming processes them.

### 3.1 `agent_runs` table extension

```
+ context_type  TEXT NOT NULL CHECK(context_type IN ('primary','subagent','cron','heartbeat','flush'))
             -- No DEFAULT. Required parameter. See safe-fix #6 / security-F6 / adversarial-F6.
+ parent_run_id TEXT NULL
             -- FK to agent_runs.run_id, for subagent provenance
```

**No DEFAULT on `context_type`** (safe-fix, per security review F6 + adversarial F6). The column is `NOT NULL` with no default. `start_agent_run` requires it as an explicit argument; callers that omit it fail fast. Rationale: the v11 doc defaulted to `'primary'` for backward compatibility — but the entire §5 guard regime exists to prevent non-primary writes from polluting memory, and the `'primary'` default was the *unsafe* value. Any caller that forgot to tag a cron / heartbeat / subagent as non-primary silently bypassed the guard. Fail-closed by removing the default.

**Migration handling.** PR 1 migration:
1. Add column as NULLABLE first.
2. Backfill existing rows: `UPDATE agent_runs SET context_type = 'primary' WHERE context_type IS NULL` — acceptable because existing rows were already running pre-v2 and their legacy behavior was equivalent to primary anyway.
3. Tighten to `NOT NULL` after backfill.
4. New `start_agent_run` signature accepts `context_type` as required; old callers surface with a typed error during the feature-flag bake period.

### 3.2 `memories` table extension

```
+ kind        TEXT NOT NULL
           -- enum: see §3.4
+ tier        TEXT NOT NULL DEFAULT 'short_term'
           -- enum: short_term | durable
+ slug        TEXT NOT NULL UNIQUE
           -- the wiki page id referenced by [[wikilinks]]
+ vault_path  TEXT NOT NULL
           -- L0 relative path under globalDataDir()/memory/
+ provenance  JSON NOT NULL
           -- {agent_role, run_id, hook_point, source_kind,
           --  parent_memory_id?, context_type, confidence}
+ supersedes  JSON NULL
           -- array of memory_ids this entry replaces (Rohit's LLM Wiki v2)
+ recall_count         INTEGER NOT NULL DEFAULT 0
+ unique_query_count   INTEGER NOT NULL DEFAULT 0
+ max_recall_score     REAL    NOT NULL DEFAULT 0.0
+ last_recalled_at     INTEGER NULL
+ embedded             INTEGER NOT NULL DEFAULT 0
           -- 1 iff present in L2 (only durable rows are embedded)
+ schema_version       INTEGER NOT NULL DEFAULT 1
           -- bumps when frontmatter schema changes
+ normalize_version    INTEGER NOT NULL DEFAULT 1
           -- bumps when sanitizer/chunker rules change; row is re-processed on mismatch
```

Added indexes: `(kind, tier)`, `(slug)`, `(provenance.run_id)`, and for `kind='file_patch'` a path-index on `json_extract(frontmatter, '$.file_paths[0]')`.

### 3.3 New `memory_recall_events` table

```
CREATE TABLE memory_recall_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_id       TEXT    NOT NULL,
  query           TEXT    NOT NULL,
  score           REAL    NOT NULL,
  rank            INTEGER NOT NULL,
  caller_run_id   TEXT    NULL,
  caller_role     TEXT    NULL,
  source          TEXT    NOT NULL,   -- 'recall_memory' | 'query_memory' | 'file_read'
  created_at      INTEGER NOT NULL
);
CREATE INDEX idx_recall_events_memory ON memory_recall_events (memory_id);
CREATE INDEX idx_recall_events_query  ON memory_recall_events (query, created_at);
```

Every `recall_memory`, `query_memory`, and (best-effort) native `file_read` of a short-term vault file inserts rows. Powers Dreaming promotion, eviction, and utility scoring. Matches prior art `short-term-promotion.recordShortTermRecalls`.

### 3.3a New `memory_wikilinks` table

```
CREATE TABLE memory_wikilinks (
  src_memory_id TEXT NOT NULL,   -- wiki page id (source of the link)
  dst_slug      TEXT NOT NULL,   -- target slug (may be unresolved)
  dst_memory_id TEXT NULL,       -- resolved target, null for dangling links
  PRIMARY KEY (src_memory_id, dst_slug)
);
CREATE INDEX idx_wikilinks_dst ON memory_wikilinks (dst_slug);
CREATE INDEX idx_wikilinks_dst_id ON memory_wikilinks (dst_memory_id);
```

Populated on write by the frontmatter+body parser. Powers O(log n) backlinks traversal for `query_memory(linked_to:...)`. Dangling links (where `dst_memory_id` is NULL) are first-class — Dreaming lint phase reports them.

### 3.3b New `memory_tags` table

```
CREATE TABLE memory_tags (
  memory_id TEXT NOT NULL,
  tag       TEXT NOT NULL,
  PRIMARY KEY (memory_id, tag)
);
CREATE INDEX idx_tags_tag ON memory_tags (tag);
```

Normalized from frontmatter `tags` array. Powers tag-filter queries.

### 3.3c New code tables (PCI)

Extends existing chunk storage in `fulcrum-memory` with proper code-index shape.

```
CREATE TABLE code_files (
  file_id      TEXT PRIMARY KEY,         -- stable: sha256(project_id + ':' + rel_path)
  workspace_id TEXT NOT NULL,
  project_id   TEXT NOT NULL,
  rel_path     TEXT NOT NULL,            -- project-root-relative; never machine-absolute
  language     TEXT NOT NULL,
  sha256       TEXT NOT NULL,            -- current body hash; for change detection
  mtime_ns     INTEGER NOT NULL,
  size_bytes   INTEGER NOT NULL,
  chunks_count INTEGER NOT NULL DEFAULT 0,
  indexed_at   INTEGER NOT NULL,
  UNIQUE (project_id, rel_path)
);
CREATE INDEX idx_code_files_lang ON code_files (language);
CREATE INDEX idx_code_files_ws ON code_files (workspace_id, project_id);

CREATE TABLE code_chunks (
  chunk_id          TEXT PRIMARY KEY,    -- hash of (file_id + start_line + content)
  file_id           TEXT NOT NULL REFERENCES code_files(file_id) ON DELETE CASCADE,
  kind              TEXT NOT NULL,       -- function | class | method | arrow | const | prose | other
  symbol_path       TEXT NULL,           -- e.g. 'ClassName.methodName'
  start_line        INTEGER NOT NULL,
  end_line          INTEGER NOT NULL,
  content           TEXT NOT NULL,       -- chunk body; FTS-indexed via virtual table
  embedded          INTEGER NOT NULL DEFAULT 1,  -- code chunks are embedded by default
  normalize_version INTEGER NOT NULL DEFAULT 1   -- re-processed when chunker rules change
);
CREATE INDEX idx_code_chunks_file ON code_chunks (file_id);
CREATE INDEX idx_code_chunks_symbol ON code_chunks (symbol_path);

CREATE TABLE code_symbols (
  file_id     TEXT NOT NULL REFERENCES code_files(file_id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL,             -- function | class | method | arrow | const | other
  line        INTEGER NOT NULL,
  PRIMARY KEY (file_id, name, line)
);
CREATE INDEX idx_code_symbols_name ON code_symbols (name);

CREATE VIRTUAL TABLE code_chunks_fts USING fts5 (
  content,
  content='code_chunks', content_rowid='rowid'
);
```

`code_references(src_chunk_id, dst_symbol_name, ref_kind)` — call graph / import graph — is an optional later table populated by Dreaming REM phase via Kuzu. Planning decides whether to materialize in SQLite or keep only in Kuzu.

Existing `memories` table stays authoritative for memory entries; `code_chunks` lives alongside it. `recall_memory` sees only memories; `search_code` sees only code_chunks. Kuzu graph nodes union the two via node type.

### 3.3d New `projects` table (portable pathing)

```
CREATE TABLE projects (
  project_id     TEXT PRIMARY KEY,
  workspace_id   TEXT NOT NULL,
  name           TEXT NOT NULL,
  root_path      TEXT NOT NULL,            -- current absolute path (source of truth)
  root_realpath  TEXT NOT NULL,            -- symlink-resolved canonical path
  vcs_remote     TEXT NULL,                -- origin URL, if known (stability beacon)
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_projects_realpath ON projects (root_realpath);
```

Moving a project on disk updates one row. `file_id` and all `rel_path` columns stay valid. Planning will add the one-time reconciliation command `fulcrum project relocate <old_path> <new_path>`.

### 3.4 `kind` enum (union of prior art + prior art + Fulcrum-specific)

| Kind | Source of writes | Char cap | TTL (short-term) |
|---|---|---|---|
| `file_patch` | PostToolUse Write/Edit | 800 | 30d |
| `tool_trace` | (reserved — not auto-written) | 400 | 30d |
| `bash_trace` | PostToolUse Bash | 400 | 30d |
| `pre_compact_extract` | PreCompact extractor | 1500 | 30d |
| `session_summary` | Stop / SessionEnd fallback | 2200 | 30d |
| `task_outcome` | update_task(completed) | 1500 | 30d |
| `blocker_resolution` | update_task(blocked) | 1500 | 30d |
| `delegation_summary` | completeAgentRun (with parent) | 800 | 30d |
| `decision` | agent-explicit write_memory | 800 | durable at write |
| `identity` | agent-explicit write_memory | 1375 | durable at write |
| `persona` | agent-explicit write_memory | 1375 | durable at write |
| `summary` | agent-explicit write_memory | 2200 | durable at write |

Char caps follow prior art ("char counts are model-independent"). Enforced in `fulcrum-memory` on write — content over the cap is truncated with a `[…truncated N chars]` marker.

---

## 4. Short-Term vs Durable Tiers

**Short-term (episodic).** All hook-written memories land here as wiki-shaped markdown entries (§1.0). Indexed in L1: FTS5 on body, `memory_wikilinks` on links, `memory_tags` on tags, frontmatter as structured columns. **Not embedded — L2 is skipped entirely for short-term.** Queryable via `query_memory` MCP tool and direct file read. 30-day TTL enforced by Dreaming deep phase.

**Durable (semantic).** Three ways to reach durable:
1. Explicit `write_memory` MCP tool call with kind ∈ {`decision`, `identity`, `persona`, `summary`}.
2. Dreaming deep-phase promotion of short-term entries meeting thresholds (§8).
3. Manual edit of `MEMORY.md` / equivalent native project-context file by the user.

On reaching durable: entry is embedded into L2 sqlite-vec (`embedded=1`), its extracted entities + relationships populate L2 Kuzu graph, and a one-line pointer is appended to the user's native project-context file. Queryable via `recall_memory`.

Promotion re-reads the live source before writing so user edits/deletes of short-term material survive (prior art verbatim: "never promote from stale snapshot").

**Procedural memory (skills/rules)** — agent-facing surface, stored as markdown under `agent-integration/skills/` (Fulcrum skills loaded natively by each host) and in each host's native mechanism (`~/.claude/plugins/...` etc.). Dreaming may propose new skills from recurring patterns; the proposal is written to `{globalDataDir()}/memory/dreaming/proposed_skills/` for human review before it becomes a real skill file.

---


---

**[← Index](index.md)** · **[← Prev: Write & Recall Paths](03-write-and-recall-paths.md)** · **[Next: Safety, Watcher, WAL →](05-safety-watcher-wal.md)**
