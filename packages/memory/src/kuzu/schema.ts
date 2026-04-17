// packages/memory/src/kuzu/schema.ts

export function buildMemoryNodeDDL(dims: number): string {
  return `
CREATE NODE TABLE IF NOT EXISTS Memory (
  id STRING,
  workspace_id STRING,
  project_id STRING,
  kind STRING,
  scope STRING,
  title STRING,
  summary STRING,
  importance FLOAT,
  freshness FLOAT,
  confidence FLOAT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  embedding FLOAT[${dims}],
  PRIMARY KEY (id)
)`
}

export function buildEntityNodeDDL(dims: number): string {
  return `
CREATE NODE TABLE IF NOT EXISTS Entity (
  id STRING,
  canonical_name STRING,
  type STRING,
  scope STRING,
  aliases STRING[],
  description STRING,
  embedding FLOAT[${dims}],
  mention_count INT64,
  created_at TIMESTAMP,
  last_seen_at TIMESTAMP,
  PRIMARY KEY (id)
)`
}

// Memory → Entity relationship tables
export const MENTIONS_DDL = `CREATE REL TABLE IF NOT EXISTS MENTIONS (FROM Memory TO Entity, weight FLOAT, confidence FLOAT, source STRING, created_at TIMESTAMP)`
export const ABOUT_DDL = `CREATE REL TABLE IF NOT EXISTS ABOUT (FROM Memory TO Entity, weight FLOAT, confidence FLOAT, source STRING, created_at TIMESTAMP)`
export const USES_DDL = `CREATE REL TABLE IF NOT EXISTS USES (FROM Memory TO Entity, weight FLOAT, confidence FLOAT, source STRING, created_at TIMESTAMP)`
export const CRITIQUES_DDL = `CREATE REL TABLE IF NOT EXISTS CRITIQUES (FROM Memory TO Entity, weight FLOAT, confidence FLOAT, source STRING, created_at TIMESTAMP)`
export const RECOMMENDS_DDL = `CREATE REL TABLE IF NOT EXISTS RECOMMENDS (FROM Memory TO Entity, weight FLOAT, confidence FLOAT, source STRING, created_at TIMESTAMP)`
export const AVOIDS_DDL = `CREATE REL TABLE IF NOT EXISTS AVOIDS (FROM Memory TO Entity, weight FLOAT, confidence FLOAT, source STRING, created_at TIMESTAMP)`
export const PRODUCED_IN_DDL = `CREATE REL TABLE IF NOT EXISTS PRODUCED_IN (FROM Memory TO Entity, weight FLOAT, source STRING, created_at TIMESTAMP)`

// Entity → Entity relationship tables
export const IS_A_DDL = `CREATE REL TABLE IF NOT EXISTS IS_A (FROM Entity TO Entity, weight FLOAT, source STRING)`
export const PART_OF_DDL = `CREATE REL TABLE IF NOT EXISTS PART_OF (FROM Entity TO Entity, weight FLOAT, source STRING)`
export const RELATED_TO_DDL = `CREATE REL TABLE IF NOT EXISTS RELATED_TO (FROM Entity TO Entity, weight FLOAT, source STRING, reinforcement_count INT64)`
export const ALIAS_OF_DDL = `CREATE REL TABLE IF NOT EXISTS ALIAS_OF (FROM Entity TO Entity, source STRING, confirmed BOOLEAN)`
export const CAUSES_DDL = `CREATE REL TABLE IF NOT EXISTS CAUSES (FROM Entity TO Entity, weight FLOAT, source STRING)`
export const PREVENTS_DDL = `CREATE REL TABLE IF NOT EXISTS PREVENTS (FROM Entity TO Entity, weight FLOAT, source STRING)`
export const USED_IN_DDL = `CREATE REL TABLE IF NOT EXISTS USED_IN (FROM Entity TO Entity, weight FLOAT, computed_at TIMESTAMP)`

// Memory → Memory relationship tables
export const CONTRADICTS_DDL = `CREATE REL TABLE IF NOT EXISTS CONTRADICTS (FROM Memory TO Memory, confidence FLOAT, source STRING)`
export const UPDATES_DDL = `CREATE REL TABLE IF NOT EXISTS UPDATES (FROM Memory TO Memory, source STRING, created_at TIMESTAMP)`
export const REINFORCES_DDL = `CREATE REL TABLE IF NOT EXISTS REINFORCES (FROM Memory TO Memory, weight FLOAT, source STRING)`
export const ELABORATES_DDL = `CREATE REL TABLE IF NOT EXISTS ELABORATES (FROM Memory TO Memory, source STRING)`

// v2a PR 7 Tasks 35 + 36 — File / CodeChunk / Symbol nodes + 7 cross-type rel
// tables. Pre-resolved decision #7: NOT the full 51-table unification — just
// the memory + code surface so PR 4's PCI watcher has a graph target. v2b PR 10
// expands to the full ~20-table set; rel tables here are additive so the
// expansion is forward-compatible (no rebuilds required).

export function buildFileNodeDDL(): string {
  return `
CREATE NODE TABLE IF NOT EXISTS File (
  file_id STRING,
  workspace_id STRING,
  project_id STRING,
  rel_path STRING,
  language STRING,
  sha256 STRING,
  mtime_ns INT64,
  size_bytes INT64,
  indexed_at TIMESTAMP,
  PRIMARY KEY (file_id)
)`
}

export function buildCodeChunkNodeDDL(dims: number): string {
  return `
CREATE NODE TABLE IF NOT EXISTS CodeChunk (
  chunk_id STRING,
  file_id STRING,
  kind STRING,
  symbol_path STRING,
  start_line INT64,
  end_line INT64,
  embedding FLOAT[${dims}],
  PRIMARY KEY (chunk_id)
)`
}

export function buildSymbolNodeDDL(): string {
  return `
CREATE NODE TABLE IF NOT EXISTS Symbol (
  symbol_id STRING,
  file_id STRING,
  name STRING,
  kind STRING,
  line INT64,
  PRIMARY KEY (symbol_id)
)`
}

// Memory ↔ code edges (cross-type — Task 36 rels)
export const EDITS_DDL = `CREATE REL TABLE IF NOT EXISTS EDITS (FROM Memory TO File, weight FLOAT, source STRING, created_at TIMESTAMP)`
export const ABOUT_FILE_DDL = `CREATE REL TABLE IF NOT EXISTS ABOUT_FILE (FROM Memory TO File, weight FLOAT, confidence FLOAT, source STRING, created_at TIMESTAMP)`
export const ABOUT_SYMBOL_DDL = `CREATE REL TABLE IF NOT EXISTS ABOUT_SYMBOL (FROM Memory TO Symbol, weight FLOAT, confidence FLOAT, source STRING, created_at TIMESTAMP)`
export const MENTIONS_SYMBOL_DDL = `CREATE REL TABLE IF NOT EXISTS MENTIONS_SYMBOL (FROM Memory TO Symbol, weight FLOAT, source STRING, created_at TIMESTAMP)`

// Code ↔ code edges
export const IMPORTS_DDL = `CREATE REL TABLE IF NOT EXISTS IMPORTS (FROM File TO File, source STRING)`
export const CALLS_DDL = `CREATE REL TABLE IF NOT EXISTS CALLS (FROM Symbol TO Symbol, source STRING, weight FLOAT)`
export const DEFINES_DDL = `CREATE REL TABLE IF NOT EXISTS DEFINES (FROM File TO Symbol, source STRING)`
export const CONTAINED_IN_DDL = `CREATE REL TABLE IF NOT EXISTS CONTAINED_IN (FROM CodeChunk TO File, source STRING)`

export const CODE_CHUNK_VECTOR_INDEX_DDL = `CALL CREATE_VECTOR_INDEX('CodeChunk', 'code_chunk_embedding_idx', 'embedding', metric := 'cosine')`

// Vector indexes — run last; tables must exist first
export const MEMORY_VECTOR_INDEX_DDL = `CALL CREATE_VECTOR_INDEX('Memory', 'memory_embedding_idx', 'embedding', metric := 'cosine')`
export const ENTITY_VECTOR_INDEX_DDL = `CALL CREATE_VECTOR_INDEX('Entity', 'entity_embedding_idx', 'embedding', metric := 'cosine')`

export function buildAllDDL(dims: number): string[] {
  return [
    buildMemoryNodeDDL(dims),
    buildEntityNodeDDL(dims),
    // v2a Task 35 — code surface nodes
    buildFileNodeDDL(),
    buildCodeChunkNodeDDL(dims),
    buildSymbolNodeDDL(),
    // Memory → Entity
    MENTIONS_DDL,
    ABOUT_DDL,
    USES_DDL,
    CRITIQUES_DDL,
    RECOMMENDS_DDL,
    AVOIDS_DDL,
    PRODUCED_IN_DDL,
    // Entity → Entity
    IS_A_DDL,
    PART_OF_DDL,
    RELATED_TO_DDL,
    ALIAS_OF_DDL,
    CAUSES_DDL,
    PREVENTS_DDL,
    USED_IN_DDL,
    // Memory → Memory
    CONTRADICTS_DDL,
    UPDATES_DDL,
    REINFORCES_DDL,
    ELABORATES_DDL,
    // v2a Task 36 — Memory ↔ code edges (cross-type)
    EDITS_DDL,
    ABOUT_FILE_DDL,
    ABOUT_SYMBOL_DDL,
    MENTIONS_SYMBOL_DDL,
    // v2a Task 36 — code ↔ code edges
    IMPORTS_DDL,
    CALLS_DDL,
    DEFINES_DDL,
    CONTAINED_IN_DDL,
    // Vector indexes — run last
    MEMORY_VECTOR_INDEX_DDL,
    ENTITY_VECTOR_INDEX_DDL,
    CODE_CHUNK_VECTOR_INDEX_DDL,
  ]
}

/** @deprecated use buildAllDDL(dims) */
export const ALL_DDL: string[] = buildAllDDL(1024)

export const SCHEMA_DDL_WITHOUT_INDEXES: string[] = ALL_DDL.filter(
  ddl => !ddl.includes('CREATE_VECTOR_INDEX')
)
