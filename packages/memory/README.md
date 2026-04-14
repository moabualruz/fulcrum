# @fulcrum/memory

Three-layer memory stack for agent memory, entity relationships, and cross-project knowledge propagation.

## Architecture

| Layer | Store | Always on | What it provides |
|---|---|---|---|
| L0 | `~/.fulcrum/vault/` (git repo) | Yes | Canonical source, human-readable markdown, git versioning |
| L1 | SQLite FTS5 | Yes | Full-text keyword search, BM25 ranking, fast structured queries |
| L2 | Kuzu (embedded, opt-in) | No | Semantic vector search (HNSW), cross-project graph traversal, entity relationships |

**L0 + L1** is the default — zero extra dependencies, works offline.  
**L2** is opt-in — requires Kuzu (`npm` native addon) and an embedding model.

## Setup

```bash
# Initialize vault + L1 (always-on)
fulcrum memory init

# Enable L2 semantic search (optional)
fulcrum memory accelerate

# Rebuild indexes from vault files
fulcrum memory rebuild [--target l1|l2|both] [--verify]
```

## Usage

```typescript
import { writeMemory, recallMemory } from '@fulcrum/memory'

// Write a memory (goes to L0 first, then L1, then L2 async)
await writeMemory({
  workspace_id: 'ws_main',
  project_id: 'proj_1',
  scope: 'project',
  kind: 'decision',
  title: 'Use Kuzu for L2 graph layer',
  summary: 'Chose Kuzu for embeddability and HNSW support',
  content: 'We chose Kuzu over Neo4j because it is embeddable...',
})

// Recall memories (L2 if active, falls back to L1)
const results = await recallMemory({
  workspace_id: 'ws_main',
  query: 'graph database decision',
})
```

## Vault Structure

```
~/.fulcrum/vault/
  .obsidian/              # Obsidian config + pre-built Dataview queries
  index.md                # Auto-generated catalog (curated memories)
  log.md                  # Append-only operation log
  schema.yaml             # Kind/scope/relation type contracts
  queries.md              # Pre-built Dataview queries
  memories/
    curated/              # Committed to git — decisions, facts, outcomes
    operational/          # Gitignored — traces, tool logs, reasoning steps
```

## L2 Retrieval (6 Stages)

1. **HNSW vector seed** — top-40 semantically similar memories
2. **1-hop graph expansion** — memories connected to query entities
3. **2-hop entity expansion** — bridging through related entities
4. **Superseded filter** — remove older versions (UPDATES edges)
5. **Fused scoring** — `1.0×vscore + 0.8×graph + 0.3×importance + 0.2×recency + 0.25×workspace_affinity − 0.6×contradiction`
6. **MMR diversification** — reduce duplicates (λ=0.7)

## API

```typescript
// Core
writeMemory(input: WriteMemoryInput): Promise<FullMemory>
recallMemory(input: RecallMemoryInput): Promise<CompactMemory[] | FullMemory[]>
getMemory(memoryId: string): Promise<FullMemory | null>

// Setup
runMemoryInit(): Promise<void>           // fulcrum memory init
activateL2(): Promise<RebuildResult>     // fulcrum memory accelerate
rebuildFromVault(options): Promise<RebuildResult>  // fulcrum memory rebuild
reconcileMergedBranch(vaultPath, taskId): Promise<void>  // post-merge sync
```

See [`docs/superpowers/specs/2026-04-14-memory-graph-l0-design.md`](../../docs/superpowers/specs/2026-04-14-memory-graph-l0-design.md) for full architecture documentation.
