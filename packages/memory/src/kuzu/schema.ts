// packages/memory/src/kuzu/schema.ts

export const MEMORY_NODE_DDL = `
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
  embedding FLOAT[1536],
  PRIMARY KEY (id)
)`

export const ENTITY_NODE_DDL = `
CREATE NODE TABLE IF NOT EXISTS Entity (
  id STRING,
  canonical_name STRING,
  type STRING,
  scope STRING,
  aliases STRING[],
  description STRING,
  embedding FLOAT[1536],
  mention_count INT64,
  created_at TIMESTAMP,
  last_seen_at TIMESTAMP,
  PRIMARY KEY (id)
)`

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

// Vector indexes — run last; tables must exist first
export const MEMORY_VECTOR_INDEX_DDL = `CALL CREATE_VECTOR_INDEX('Memory', 'memory_embedding_idx', 'embedding', metric := 'cosine')`
export const ENTITY_VECTOR_INDEX_DDL = `CALL CREATE_VECTOR_INDEX('Entity', 'entity_embedding_idx', 'embedding', metric := 'cosine')`

export const ALL_DDL: string[] = [
  MEMORY_NODE_DDL,
  ENTITY_NODE_DDL,
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
  // Vector indexes — run last
  MEMORY_VECTOR_INDEX_DDL,
  ENTITY_VECTOR_INDEX_DDL,
]

export const SCHEMA_DDL_WITHOUT_INDEXES: string[] = ALL_DDL.filter(
  ddl => !ddl.includes('CREATE_VECTOR_INDEX')
)
