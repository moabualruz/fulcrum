// packages/memory/src/index.ts

// Types
export type {
  MemoryScope,
  MemoryKind,
  RecallMode,
  WriteMemoryInput,
  RecallMemoryInput,
  CompactMemory,
  FullMemory,
  MemoryEntity,
  LinkMemoryToEntityInput,
  CodeChunk,
  IngestFileInput,
  IngestResult,
  IngestProjectInput,
} from './types.js'

// Scoring (pure functions — no DB)
export { computeImportance, computeFreshness, rrfScore } from './scoring.js'

// Dedup utilities
export { contentHash, isDuplicate } from './dedup.js'

// Write
export { writeMemory } from './write.js'

// Entities
export { linkMemoryToEntity, getMemoryEntities } from './entities.js'

// Recall
export { recallMemory } from './recall.js'

// Ingestion pipeline
export { ingestFile, ingestProject } from './ingest.js'
