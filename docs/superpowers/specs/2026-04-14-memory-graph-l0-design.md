# Memory Stack: L0 Vault + L2 Graph (Kuzu) Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the existing SQLite-only memory system with a three-layer stack: a human-readable file vault (L0), full-text search (L1, already exists), and an embeddable graph + vector store (L2, Kuzu) — where L0+L1 is the always-on default and L2 is opt-in acceleration.

**Architecture:** L0 is the canonical source of truth; L1 and L2 are derived indexes that can be wiped and rebuilt from L0 at any time. Every memory is written to L0 first. L2 adds cross-project entity-graph traversal and HNSW semantic vector search that are physically impossible to do efficiently in SQLite.

**Tech Stack:** TypeScript ESM, better-sqlite3 (L1), kuzu npm (L2), chokidar (file watcher), ulid, gray-matter (frontmatter parse), simple-git (git operations)

---

## 1. Layer Overview

| Layer | Store | Always on | Human-readable | What it provides |
|---|---|---|---|---|
| L0 | `~/.fulcrum/vault/` (git repo) | Yes | Yes | Canonical source, portability, human consumption, git versioning |
| L1 | SQLite FTS5 (existing) | Yes | No | Full-text keyword search, BM25 ranking, fast operational queries |
| L2 | Kuzu (embedded, optional) | No | No | Semantic vector search (HNSW), cross-project graph traversal, entity relationships |

**L0 + L1** is the default. Zero extra dependencies. Works offline, works without API keys, works on any machine.

**L2** is opt-in. Requires: `kuzu` npm package + an embedding model (local via Ollama, or an API key for OpenAI/Anthropic). Activated via setup wizard on first use or `fulcrum memory accelerate`.

**FTS5** (Full-Text Search 5) is SQLite's built-in inverted index. It handles keyword and phrase search with BM25 ranking. It cannot do semantic search (finding "heap allocation" from a query about "memory management") or graph traversal. L2 fills both gaps.

---

## 2. L0 — The Vault

### 2.1 Location and git setup

The vault lives at `~/.fulcrum/vault/` — global, one vault for all workspaces.

```bash
~/.fulcrum/vault/
  .obsidian/                    # Obsidian config + pre-built Dataview queries
  .gitignore                    # ignores: memories/operational/, .state.json, .queue/
  index.md                      # Karpathy-style catalog (curated/ only, LLM-maintained)
  log.md                        # append-only operation log
  schema.yaml                   # kind/scope/relation type contracts + schema version
  memories/
    curated/                    # committed to git — decisions, facts, outcomes, errors
      workspaces/
        <workspace_id>/
          global/
            <yyyy>/<mm>/<ulid>.md
          project/
            <project_id>/
              <yyyy>/<mm>/<ulid>.md
          file/
            <project_id>/
              <encoded_path>/
                <yyyy>/<mm>/<ulid>.md
    operational/                # gitignored — traces, tool logs, reasoning steps
      workspaces/
        <workspace_id>/
          runs/
            <run_id>/
              <ulid>.md
  entities/                     # committed — LLM-synthesized entity pages
    technology/rust.md
    concept/api-design.md
    project/<workspace_id>/<project_id>.md
```

On first use: `git init ~/.fulcrum/vault && git commit -m "init: fulcrum vault"`

### 2.2 Curated vs operational split

**Curated kinds** (written to `memories/curated/`, committed to git, indexed by `index.md`):
`decision`, `fact`, `summary`, `task_outcome`, `task_decision`, `error`, `doc`

**Operational kinds** (written to `memories/operational/`, gitignored, not in `index.md`):
`tool_trace`, `reasoning_step`, `diff`, `code`, `symbol`

Both are valid L0. Both are indexed in L1 and L2. Humans browse curated; agents query both. When rebuilding L2 embeddings, both contribute — curated/ gives high-quality synthesized memories, operational/ gives complete coverage.

### 2.3 Memory file format

Path: `memories/curated/workspaces/<ws_id>/<scope>/<yyyy>/<mm>/<ulid>.md`

```markdown
---
id: 01JBXK7Z9T8QH0F3VRDE5W2NPM
schema: fulcrum.memory/v1
kind: decision
scope: project
workspace_id: ws_main
project_id: pi-stack-plan
title: "Use Kuzu for L2 graph layer"
summary: "Chose Kuzu over Neo4j for embeddability and HNSW support"
tags: [architecture, memory, kuzu]
confidence: 0.9
importance: 0.8
freshness: 1.0
created_at: 2026-04-14T10:12:33Z
updated_at: 2026-04-14T10:12:33Z
event_time: 2026-04-14T10:00:00Z
source: agent
author: claude-opus-4-6
task_id: tsk_01JBX...
issue_id: null
artifact_id: null
entities:
  - "[[component/kuzu]]"
  - "[[project/pi-stack-plan]]"
  - "[[concept/graph-rag]]"
relations:
  - { type: depends_on, target: "[[component/sqlite]]" }
  - { type: supersedes, target: "[[memory/01JBXOLD...]]" }
provenance_refs:
  - "file://docs/research/kuzu-eval.md"
content_hash: sha256:9f2cab...
---

# Use Kuzu for L2 graph layer

Body prose written by agent or human. [[component/kuzu]] provides
native HNSW vector indexes and Cypher graph traversal in a single
embedded library — no server required...
```

**Required fields:** `id`, `schema`, `kind`, `scope`, `workspace_id`, `title`

**All other fields** are optional — the writer SDK fills defaults (timestamps, content_hash, confidence=1.0, importance=0.5, freshness=1.0).

**Minimal agent-written file** (the writer SDK completes the rest):
```markdown
---
id: 01JBXK7Z9T8QH0F3VRDE5W2NPM
schema: fulcrum.memory/v1
kind: fact
scope: project
workspace_id: ws_main
title: "pnpm workspace glob must be packages/*"
---
Fulcrum uses `pnpm-workspace.yaml` with `packages/*`. Sub-globs break
cross-package imports. [[component/pnpm]]
```

### 2.4 Versioning via git

Memories are **mutable files** — overwritten in place when updated. Git history is the audit trail. No `supersedes` file proliferation.

**Agent memory branching** (mirrors code worktrees):
- When an agent starts a task, it creates a memory branch: `git checkout -b memory/<task_id>`
- Agent writes and updates memories on the branch
- On task completion, the branch merges to `main`: `git checkout main && git merge memory/<task_id>`
- Knowledge conflicts surface as git merge conflicts — resolved the same way as code conflicts
- `git log --follow <file>` shows the full evolution of any memory
- `git diff HEAD~3 <file>` shows what changed and when

### 2.5 Karpathy index and log

**`index.md`** — LLM-maintained catalog, covers `curated/` only:
```markdown
# Fulcrum Vault Index
_Auto-generated. Last compiled: 2026-04-14T10:15:00Z._

## Recent (last 30 days)
- [Use Kuzu for L2 graph layer](memories/curated/.../01JBXK...md) — decision, 2026-04-14

## By Entity
- `[[component/kuzu]]` → 4 memories, [entity page](entities/component/kuzu.md)

## By Tag
- `architecture` → 12 memories
- `memory` → 9 memories
```

**`log.md`** — append-only, parseable prefix, rotated monthly:
```
2026-04-14T10:12:33Z WRITE      01JBXK... kind=decision scope=project by=agent
2026-04-14T10:14:02Z INDEX-L1   01JBXK... ok
2026-04-14T10:14:03Z INDEX-L2   01JBXK... queued
2026-04-14T10:30:00Z INDEX-L2   01JBXK... ok embed_ms=120
2026-04-14T11:30:00Z EDIT       01JBXK... content_hash_changed=true by=human
2026-04-14T12:00:00Z REBUILD    from=files target=l2 count=1342 took=18.2s
```

### 2.6 Obsidian integration

The vault ships with `.obsidian/` config containing pre-built Dataview queries. Obsidian is **never required** — the files work in any editor. When Obsidian is installed and the user opens `~/.fulcrum/vault/`, they get:

```dataview
TABLE summary, tags, created_at AS "Created"
FROM "memories/curated"
WHERE kind = "decision"
SORT created_at DESC
LIMIT 20
```

```dataview
TABLE summary, workspace_id
FROM "memories/curated"
WHERE contains(tags, "architecture")
SORT importance DESC
```

No Obsidian Local REST API plugin. No runtime dependency. Format-compatible only.

### 2.7 Rebuild command

```bash
fulcrum memory rebuild                    # rebuild L1 + L2 from L0 files
fulcrum memory rebuild --target l1        # L1 only (FTS5 re-index)
fulcrum memory rebuild --target l2        # L2 only (re-embed + Kuzu reload — use after model swap)
fulcrum memory rebuild --verify           # dry-run: report drift between L0 and L1/L2
```

Idempotent and re-entrant. Deleting `~/.fulcrum/sqlite.db` and `~/.fulcrum/kuzu/` then running `fulcrum memory rebuild` restores everything. L0 is always the source of truth.

---

## 3. L2 — Kuzu Graph + Vector

### 3.1 Activation

L2 is off by default. Activated via:

```bash
fulcrum memory accelerate
```

Setup wizard:

```
Memory Acceleration Setup

L0 + L1 are active (file vault + FTS5 keyword search).

Enable L2? This adds:
  • Semantic vector search — find memories by meaning, not just keywords
  • Cross-project knowledge graph — bad Rust pattern from project A
    surfaces automatically when working on project B
  • Relationship traversal — entities connect memories across contexts

Requires an embedding model:

  [ 1 ] Local — Ollama (no API cost, runs on your machine)
  [ 2 ] OpenAI embeddings API (text-embedding-3-small)
  [ 3 ] Anthropic / other OpenAI-compatible endpoint
  [ 4 ] Skip for now — stay with L0 + L1
```

### 3.2 Node types

**`Memory` node:**
```cypher
CREATE NODE TABLE Memory (
  id          STRING,
  workspace_id STRING,
  project_id  STRING,
  kind        STRING,
  scope       STRING,
  title       STRING,
  summary     STRING,
  importance  FLOAT,
  freshness   FLOAT,
  confidence  FLOAT,
  created_at  TIMESTAMP,
  updated_at  TIMESTAMP,
  embedding   FLOAT[1536],
  PRIMARY KEY (id)
)
```

**`Entity` node:**
```cypher
CREATE NODE TABLE Entity (
  id             STRING,      -- sha256(type + ":" + canonical_name) for global
  canonical_name STRING,
  type           STRING,      -- closed set, see taxonomy below
  scope          STRING,      -- "global" | "workspace:<id>"
  aliases        STRING[],
  description    STRING,
  embedding      FLOAT[1536], -- embedding of canonical_name + description
  mention_count  INT64,
  created_at     TIMESTAMP,
  last_seen_at   TIMESTAMP,
  PRIMARY KEY (id)
)
```

### 3.3 Entity type taxonomy

**Global entities** (shared across all workspaces — the connective tissue for cross-project retrieval):

| Type | Examples |
|---|---|
| `technology` | rust, typescript, postgres, kuzu |
| `concept` | ownership, eventual-consistency, CAP-theorem |
| `pattern` | prefer-owned-strings-in-public-api, dependency-injection |
| `bug_class` | race-condition, use-after-free, off-by-one |
| `library` | axum, serde, better-sqlite3, vitest |
| `language_feature` | rust/lifetimes, ts/satisfies, ts/template-literal-types |
| `person` | user, teammate (by stable identifier) |
| `tool` | bash, grep, git, pnpm |
| `organization` | anthropic, openai |

**Workspace-scoped entities** (cannot cross workspace boundaries):

| Type | Examples |
|---|---|
| `project` | project/pi-stack-plan |
| `file` | file/packages/memory/write.ts |
| `symbol` | symbol/MemoryStore.write |
| `task` | task/FUL-123 |
| `run` | run/01JBX... |

### 3.4 Edge types

**Memory → Entity (the workhorse):**

| Edge | Meaning | Created by |
|---|---|---|
| `MENTIONS` | Memory references this entity | Rule-based sync on write |
| `ABOUT` | Entity is the primary subject | LLM async |
| `USES` | Memory describes using this entity | Rule + verb patterns |
| `CRITIQUES` | Negative observation about entity | LLM async |
| `RECOMMENDS` | Positive preference for entity | LLM async |
| `AVOIDS` | Anti-recommendation ("bad pattern" edge) | LLM async |
| `PRODUCED_IN` | Written while this project/task was active context | Computed from run context |

```cypher
CREATE REL TABLE MENTIONS   (FROM Memory TO Entity, weight FLOAT, confidence FLOAT, source STRING, created_at TIMESTAMP)
CREATE REL TABLE ABOUT      (FROM Memory TO Entity, weight FLOAT, confidence FLOAT, source STRING, created_at TIMESTAMP)
CREATE REL TABLE USES       (FROM Memory TO Entity, weight FLOAT, confidence FLOAT, source STRING, created_at TIMESTAMP)
CREATE REL TABLE CRITIQUES  (FROM Memory TO Entity, weight FLOAT, confidence FLOAT, source STRING, created_at TIMESTAMP)
CREATE REL TABLE RECOMMENDS (FROM Memory TO Entity, weight FLOAT, confidence FLOAT, source STRING, created_at TIMESTAMP)
CREATE REL TABLE AVOIDS     (FROM Memory TO Entity, weight FLOAT, confidence FLOAT, source STRING, created_at TIMESTAMP)
CREATE REL TABLE PRODUCED_IN(FROM Memory TO Entity, weight FLOAT, source STRING, created_at TIMESTAMP)
```

**Entity → Entity (the ontology that bridges concepts):**

| Edge | Meaning | Created by |
|---|---|---|
| `IS_A` | Subtype (`tokio IS_A async-runtime`) | LLM bootstrap, cached |
| `PART_OF` | Composition (`borrow-checker PART_OF rust`) | LLM bootstrap |
| `RELATED_TO` | Semantic proximity | Computed from co-mention PMI |
| `ALIAS_OF` | Same entity, different name | LLM resolution |
| `CAUSES` | Causal (pattern CAUSES bug_class) | LLM from lesson memories |
| `PREVENTS` | Mitigation (pattern PREVENTS bug_class) | LLM from lesson memories |
| `USED_IN` | Technology used in project | Computed from aggregated Memory→Entity edges |

```cypher
CREATE REL TABLE IS_A      (FROM Entity TO Entity, weight FLOAT, source STRING)
CREATE REL TABLE PART_OF   (FROM Entity TO Entity, weight FLOAT, source STRING)
CREATE REL TABLE RELATED_TO(FROM Entity TO Entity, weight FLOAT, source STRING, reinforcement_count INT64)
CREATE REL TABLE ALIAS_OF  (FROM Entity TO Entity, source STRING, confirmed BOOLEAN)
CREATE REL TABLE CAUSES    (FROM Entity TO Entity, weight FLOAT, source STRING)
CREATE REL TABLE PREVENTS  (FROM Entity TO Entity, weight FLOAT, source STRING)
CREATE REL TABLE USED_IN   (FROM Entity TO Entity, weight FLOAT, computed_at TIMESTAMP)
```

**Memory → Memory (sparse, high-confidence only):**

| Edge | Meaning |
|---|---|
| `CONTRADICTS` | Incompatible claims — surfaces conflicts |
| `UPDATES` | Newer supersedes older |
| `REINFORCES` | Independent confirmation |
| `ELABORATES` | Adds detail to an earlier memory |

```cypher
CREATE REL TABLE CONTRADICTS(FROM Memory TO Memory, confidence FLOAT, source STRING)
CREATE REL TABLE UPDATES    (FROM Memory TO Memory, source STRING, created_at TIMESTAMP)
CREATE REL TABLE REINFORCES (FROM Memory TO Memory, weight FLOAT, source STRING)
CREATE REL TABLE ELABORATES (FROM Memory TO Memory, source STRING)
```

### 3.5 Vector indexes

```cypher
CALL CREATE_VECTOR_INDEX('Memory', 'memory_embedding_idx', 'embedding', metric := 'cosine')
CALL CREATE_VECTOR_INDEX('Entity', 'entity_embedding_idx', 'embedding', metric := 'cosine')
```

---

## 4. Retrieval Algorithm (6 Stages)

For query: `"what should I know about API design in Rust?"` from workspace `rust-project-B`.

### Stage 1 — Extract query entities
Run rule-based + LLM extraction on query text + active context:
- From text: `{technology/rust, concept/api-design}`
- From active context: `{project/rust-project-B}` (workspace-scoped, contributes to affinity only)

### Stage 2 — Vector seed (HNSW)
```cypher
CALL QUERY_VECTOR_INDEX('Memory', 'memory_embedding_idx', $query_vec, 40)
YIELD node AS m, distance
WHERE m.superseded_by IS NULL
RETURN m, 1 - distance AS vscore
```
Returns top-40 semantically similar memories across **all workspaces** — no workspace filter here.

### Stage 3 — 1-hop graph expansion from query entities
```cypher
MATCH (e:Entity)-[r:ABOUT|CRITIQUES|AVOIDS|MENTIONS|USES]-(m:Memory)
WHERE e.id IN $query_entity_ids
  AND m.superseded_by IS NULL
RETURN m, e, type(r) AS edge_type, r.weight AS w
ORDER BY w DESC LIMIT 60
```
Pulls the project-A Rust memory via **two** paths: `ABOUT concept/api-design` (w=0.9) + `MENTIONS technology/rust` (w=0.5).

### Stage 4 — 2-hop expansion via Entity→Entity
```cypher
MATCH (e1:Entity)-[r1:RELATED_TO|PART_OF|IS_A]-(e2:Entity)
      -[r2:ABOUT|CRITIQUES|AVOIDS|RECOMMENDS]-(m:Memory)
WHERE e1.id IN $query_entity_ids
  AND r1.weight > 0.4
  AND m.superseded_by IS NULL
  AND NOT m.id IN $already_seen
RETURN m, e2,
  reduce(w=1.0, r IN [r1, r2] | w * r.weight) * pow(0.7, 2) AS path_weight
ORDER BY path_weight DESC LIMIT 40
```
Finds `pattern/prefer-owned-strings-in-rust-public-api` (PART_OF rust, RELATED_TO api-design) → third path to project-A memory.

### Stage 5 — Fused scoring
```
score(m) =
    1.0 × vscore(m)                      // 0 if not in vector results
  + 0.8 × graph_score(m)                 // sum of all path weights × 0.7^hops
  + 0.3 × m.importance
  + 0.2 × recency(m)                     // exp decay, half-life 30 days
  + 0.25 × workspace_affinity(m)         // +1.0 same workspace, +0.3 related, 0 otherwise
  - 0.6 × contradiction_penalty(m)       // if m has CONTRADICTS edge from a newer memory
```

`workspace_affinity` is a **soft bonus, not a filter**. Cross-workspace memories compete and can win through strong graph signal — this is what enables cross-project pattern propagation.

**Concrete example:**
- Project-A Rust memory (different workspace): `score = 1.0×0.58 + 0.8×2.2 + 0.3×0.8 + 0.2×0.6 + 0 = 2.70`
- Same-workspace surface match: `score = 1.0×0.72 + 0.8×0.4 + 0.3×0.3 + 0.2×0.9 + 0.25 = 1.56`

The project-A memory wins despite being from a different workspace and having lower vector similarity. The win comes from multiple graph paths through global entities `technology/rust` and `concept/api-design`.

### Stage 6 — MMR diversification
Apply Maximal Marginal Relevance (λ=0.7) over the top `3×k` results to get final `k`. Prevents returning 12 variations of the same memory.

**Explosion control:**
- Maximum 2 hops
- Entity→Entity traversal gated on `weight > 0.4`
- Entities with `mention_count > 1000` (generic hot entities) penalized in scoring
- Total ≤ 150 candidate memories before scoring, 4 Cypher queries total

---

## 5. Extraction Pipeline

### Track 1 — Structured (sync, runs on every write, no LLM needed)
- ID prefix pattern matching: `tsk_`, `run_`, `mem_`, `ws_`, `file_`, `sym_`
- File path detection: `/path/to/file.ts`, relative paths
- `[[wikilinks]]` already in the content
- Known entity type rules: technology names, library names (from a bootstrapped dictionary)
- Produces: `MENTIONS` and `PRODUCED_IN` edges with `source=rule, weight=0.5`

### Track 2 — Semantic (async, background, requires LLM)
- Runs on `kind IN ['decision', 'fact', 'lesson', 'error', 'task_outcome']` memories
- LLM call extracts: primary entities (`ABOUT`), sentiment edges (`CRITIQUES`, `RECOMMENDS`, `AVOIDS`), Entity→Entity causal relationships (`CAUSES`, `PREVENTS`)
- Upgrades rule-extracted `MENTIONS` to stronger edges where appropriate
- Enqueued to `.queue/l2-pending.jsonl`; skipped when no LLM configured
- Produces edges with `source=llm, confidence=<model-reported>`

### Entity resolution on every extraction

1. **Normalize**: lowercase, trim, strip punctuation
2. **Alias lookup**: in-memory hash table `alias → canonical_id`
3. **Exact canonical match**: direct lookup by normalized name + type
4. **Vector fuzzy match**: embed the mention, search `Entity.embedding` (cosine ≥ 0.92 → reuse, 0.82–0.92 → LLM arbitration)
5. **Create new**: stable id `sha256(type + ":" + canonical_name)` for global entities

---

## 6. Write Path

```
writeMemory(input)
  1. Validate against schema.yaml (kind, scope, required fields)
  2. Assign id (ulid), timestamps, content_hash
  3. Write L0 file — this is the canonical commit point
     ~/.fulcrum/vault/memories/<curated|operational>/.../<id>.md
  4. Update .state.json {path, mtime, sha256, id}
  5. Append WRITE to log.md
  6. Upsert L1 SQLite memories table (synchronous — recall works immediately)
  7. Emit MemoryWritten event
  8. Enqueue L2 Kuzu upsert + embed (async)
     → structured extraction → MENTIONS/PRODUCED_IN edges (fast)
     → embed memory text → upsert Memory node with embedding
     → enqueue LLM extraction for semantic edges (if L2 + LLM configured)

On memory branch merge to main:
  git diff main..memory/<task_id> --name-only -- memories/curated/
  → for each changed file: re-embed, Kuzu INSERT OR REPLACE node + edges
  → for each deleted file: mark deleted in L1, remove Kuzu node
  → Append MERGE to log.md
```

**Failure semantics:** L0 write is the commit point. If L0 succeeds but L1 fails, L0 is authoritative — rebuild catches up. L0 is always written first, never after.

### Human-edit detection (chokidar watcher)

```
chokidar watches ~/.fulcrum/vault/memories/**/*.md
  add/change event:
    1. Parse frontmatter, extract id
    2. Compare sha256(body) to .state.json entry
    3. If unchanged → self-write echo, ignore
    4. If changed → genuine human edit:
       a. Validate schema (reject with log.md ERROR if invalid)
       b. Update content_hash + updated_at in file
       c. Update .state.json
       d. Append EDIT to log.md
       e. Emit MemoryEdited → L1 upsert → L2 re-embed
  unlink event:
    → Mark deleted in L1, remove from Kuzu, tombstone in .state.json
```

---

## 7. Setup Wizard

```
fulcrum memory init

  ✓ L0 vault initialised at ~/.fulcrum/vault/
  ✓ Git repository initialised
  ✓ L1 SQLite ready (FTS5 full-text search active)

  Default memory is ready. You have:
  • File-based vault with git versioning
  • Full-text keyword search (FTS5)
  • Human-readable memories in ~/.fulcrum/vault/

  ─────────────────────────────────────────────────
  Enable memory acceleration? (L2)

  Adds semantic vector search and cross-project
  knowledge graph. Example: a bad Rust pattern
  found in project A surfaces automatically
  when starting project B.

  Requires an embedding model:
    [1] Local — Ollama (no cost, runs on device)
    [2] OpenAI text-embedding-3-small (API key)
    [3] Custom OpenAI-compatible endpoint
    [4] Skip — stay with L0 + L1

  Choice: _
```

`fulcrum memory accelerate` can be run at any time to enable L2 on an existing vault. Runs `fulcrum memory rebuild --target l2` to index existing memories.

---

## 8. Package Structure

`packages/memory` is rewritten in-place. Public API (`writeMemory`, `recallMemory`, `getMemory`, `getMemoriesForTask`) stays unchanged — callers are unaffected.

New files:
```
packages/memory/src/
  vault/
    client.ts          # VaultClient — file read/write, path resolution
    watcher.ts         # chokidar watcher + edit reconciler
    formatter.ts       # Memory → markdown file, markdown → Memory
    git.ts             # branch create/merge/diff operations (simple-git)
    state.ts           # .state.json read/write
    index-builder.ts   # Karpathy index.md + log.md maintenance
  kuzu/
    client.ts          # KuzuClient — connection, schema init
    schema.ts          # CREATE NODE/REL TABLE statements
    upsert.ts          # Memory → Kuzu node + edges
    query.ts           # 6-stage retrieval algorithm
    entity-store.ts    # entity resolution pipeline
  extractors/
    structured.ts      # Track 1 — rule-based sync extraction
    semantic.ts        # Track 2 — LLM async extraction
    pipeline.ts        # orchestrates both tracks + queue
  setup/
    wizard.ts          # interactive setup wizard
    activate.ts        # fulcrum memory accelerate
```

Existing files (`write.ts`, `recall.ts`, `mappers.ts`, `scoring.ts`, `graph.ts`) are replaced or wrapped by the new structure. The `graph.ts` SQLite-based graph is superseded by Kuzu when L2 is active; it remains as the L1 fallback graph for basic entity lookups when L2 is off.
