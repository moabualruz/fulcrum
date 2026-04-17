# Memory System

Fulcrum ships a three-layer memory stack that survives across agent sessions.

---

## L0 — Git Vault (Source of Truth)

Every memory is a Markdown file with YAML frontmatter stored in `~/.fulcrum/vault/`:

```
~/.fulcrum/vault/
├── memories/
│   ├── curated/          # committed to git — decisions, facts, lessons, summaries
│   │   └── workspaces/<ws_id>/
│   │       ├── global/<yyyy>/<mm>/<id>.md
│   │       ├── project/<project_id>/<yyyy>/<mm>/<id>.md
│   │       └── file/<project_id>/<encoded_path>/<yyyy>/<mm>/<id>.md
│   └── operational/      # gitignored — traces, reasoning steps, diffs
│       └── workspaces/<ws_id>/runs/<task_id>/<id>.md
├── .obsidian/            # Obsidian plugin config (auto-generated)
├── index.md              # Auto-rebuilt catalog
├── log.md                # Append-only operation log (WRITE/EDIT/DELETE/MERGE/ERROR)
├── schema.yaml           # Vault schema definition
└── queries.md            # Pre-built Dataview queries for Obsidian
```

The vault watcher detects human edits in Obsidian or any editor, validates required frontmatter fields, updates `content_hash` and `updated_at`, and syncs changes back to L1/L2.

### Memory kinds (16 total)

| Kind | Layer | Description |
|------|-------|-------------|
| `decision` | curated | Architectural or process decisions |
| `fact` | curated | Factual assertions about the codebase or domain |
| `lesson` | curated | Lessons learned from errors or experience |
| `summary` | curated | Summaries of sessions, PRs, or investigations |
| `task_outcome` | curated | Outcomes of completed tasks |
| `task_decision` | curated | Decisions made during a task |
| `error` | curated | Errors encountered and how they were resolved |
| `doc` | curated | Documentation fragments |
| `tool_trace` | operational | Tool call input/output traces |
| `reasoning_step` | operational | Intermediate reasoning steps |
| `symbol` | operational | Code symbols (functions, classes, types) |
| `diff` | operational | Code diffs |
| `code` | operational | Code chunks |
| `procedure` | operational | Step-by-step procedures |
| `task_goal` | operational | Task goal descriptions |
| `task_failure` | operational | Task failure reports |

**Memory scopes:** `global`, `project`, `file`, `task`

---

## L1 — FTS5 Full-Text Search (always on)

Three-signal hybrid recall using Reciprocal Rank Fusion (RRF, k=60):

```
rrf_score   = 1/(k + fts_rank) + 1/(k + dense_rank) + sparse_rescue_term
recall_score = rrf_score × freshness
freshness   = 0.1 + 0.9 × exp(−ageDays / 130)   ← 90-day half-life, floor 0.1
```

- **Dense vector**: local ONNX embedder (Qwen3-Embedding-0.6B or bge-m3)
- **Sparse vector**: BM25-style query/document prefix scoring (rescue path only — adds recall for documents missed by FTS5/dense without displacing existing results)
- **FTS5 fallback**: LIKE scan when the FTS5 parse fails (e.g., unterminated strings)
- Content deduplication by SHA-256 hash
- Cross-workspace scope with related-workspace affinity boost
- `mode: 'compact'` (default, 8 results) or `'total_ranked'` (20 results) with `offset` pagination

---

## L2 — Kuzu Graph + HNSW Vector Search (opt-in)

```bash
fulcrum memory accelerate  # enables L2 and rebuilds from vault
```

Seven-stage retrieval pipeline:

| Stage | What happens |
|-------|-------------|
| 0 | Expand related workspace IDs via entity-scope graph |
| 2 | HNSW vector seed — top-40 candidates, `NOT EXISTS superseded` filter inline |
| 3 | 1-hop graph expansion from query entities via `ABOUT/CRITIQUES/AVOIDS/MENTIONS/USES` edges |
| 4 | 2-hop entity-entity traversal (`RELATED_TO/PART_OF/IS_A`); hot entities >1000 mentions penalised 10× |
| 4.5 | Remove superseded memories via `UPDATES` edges across all candidates |
| 5 | Contradiction penalty: memories with an incoming `CONTRADICTS` edge penalised −0.6 |
| Fuse | `1.0×vscore + 0.8×graphScore + 0.3×importance + 0.2×recency + 0.25×workspace_affinity − 0.6×contradiction` |
| 6 | MMR diversification (λ=0.7) with cosine similarity on retrieved embeddings |

### Activation (via rebuild)

```typescript
import { activateL2 } from 'fulcrum-memory/setup'

const result = await activateL2()
// { l1Count, l2Count, errors }
```

### Vault ↔ L1/L2 sync after branch merge

```typescript
import { reconcileMergedBranch } from 'fulcrum-memory/setup'

await reconcileMergedBranch(vaultPath, taskId)
// Diffs merge commit, upserts changed files to L1+L2, removes deleted, appends MERGE log entry
```

---

## Import Graph (USES Edges)

When ingesting TypeScript or JavaScript files, the pipeline automatically emits `USES` edges in the Kuzu graph connecting a file's `Memory` node to the `Entity` nodes representing the files it imports.

**How it works:**

1. `ingestFile` calls `extractImports(content, language)` after writing each memory chunk
2. Only relative imports are captured (paths starting with `./` or `../`) — `node_modules` are ignored
3. For each imported path, an `Entity` node is upserted with `type='file'` and `canonical_name=<relative path>`
4. A `USES` edge is created: `FROM Memory TO Entity` (the Kuzu schema's `USES` relation direction)

This means code-aware recall can answer questions like "what files import this module" or "what does this file depend on" via graph traversal at recall time.

The edge write is best-effort — if Kuzu is not enabled or the write fails, ingest continues without error.

```typescript
import { ingestFile } from 'fulcrum-memory'

// Import edges are emitted automatically for .ts / .js / .tsx / .jsx files
await ingestFile({
  filePath: 'src/auth/oauth.ts',
  workspace_id: 'ws_1',
  project_id: 'proj_1',
})
// → Memory node created for the file chunk
// → Entity nodes upserted for each relative import (e.g. ./pkce, ../utils/crypto)
// → USES edges from Memory → Entity for each import
```

---

## CLI

```bash
fulcrum memory init            # Initialize L0 vault + L1 SQLite, optionally enable L2
fulcrum memory accelerate      # Enable or rebuild L2 (Kuzu graph + HNSW vector search)
fulcrum memory rebuild         # Rebuild L1 from L0 vault files
fulcrum memory status          # Show vault path and layer status
```
