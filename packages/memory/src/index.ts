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
export { writeMemory, insertMemoryDirect, normalizeCodeText, storeEmbeddingInVec } from './write.js'

// Entities
export { linkMemoryToEntity, getMemoryEntities } from './entities.js'

// Recall
export { recallMemory, getMemory, getMemoriesForTask } from './recall.js'

// v2a PR 2 — staged retrieval pipeline + envelope contract.
export { runStagedSearch } from './retrieval/search.js'
export type { StagedSearchResponse, StagedSearchReason, RunStagedSearchInput } from './retrieval/search.js'

// v2a PR 1 Task 9 — kind validation + per-kind char caps.
export { validateKind, isAllowedKind, applyKindCap, V2A_KINDS, LEGACY_KINDS, KIND_CAPS } from './validate-kind.js'

// v2a PR 2 Tasks 12 + 13 — query_memory + search_code action surfaces.
export { queryMemory } from './query-memory.js'
export type { QueryMemoryInput, QueryMemoryResponse, QueryMemoryResultRow } from './query-memory.js'
export { searchCode } from './retrieval/search-code.js'
export type { SearchCodeInput, SearchCodeResponse, SearchCodeResultRow } from './retrieval/search-code.js'

// Ingestion pipeline
export { ingestFile, ingestProject } from './ingest.js'


// Vault (L0)
export { getVaultPath, vaultExists, initVault, writeMemoryFile, readMemoryFile, listMemoryFiles } from './vault/client.js'
export { appendToLog, rebuildIndex } from './vault/index-builder.js'
export { readState, writeState, upsertStateEntry, removeStateEntry } from './vault/state.js'
export { createVaultGit } from './vault/git.js'
export { serializeToFile, parseFromFile } from './vault/formatter.js'
export { startVaultWatcher } from './vault/watcher.js'
export type { VaultStateEntry, VaultState } from './vault/state.js'
export type { VaultGit } from './vault/git.js'
export type { LogEntry } from './vault/index-builder.js'
export type { VaultWatcherOptions } from './vault/watcher.js'

// Kuzu (L2)
export { KuzuClient, getKuzuClient, setKuzuClient } from './kuzu/client.js'
export { upsertMemoryToKuzu, removeMemoryFromKuzu } from './kuzu/upsert.js'
export { queryMemoriesL2 } from './kuzu/query.js'
export type { L2QueryInput, ScoredMemoryId } from './kuzu/query.js'
export type { ResolvedEntity } from './kuzu/entity-store.js'

// Extractors
export { extractStructured } from './extractors/structured.js'
export type { ExtractedMention } from './extractors/structured.js'

// Setup
export { rebuildFromVault, reconcileMergedBranch } from './setup/rebuild.js'
export { runMemoryInit } from './setup/wizard.js'
export { activateL2 } from './setup/activate.js'
export type { RebuildOptions, RebuildResult } from './setup/rebuild.js'

// Repo map
export { buildRepoMap, scanAndBuildRepoMap } from './repo-map.js'
export type { RepoMap, RepoFileEntry, RepoSymbol } from './repo-map.js'

// Sparse vectors (GAP-RAG-7)
export { computeSparseVector, sparseDotProduct, sparseRank, tokenise } from './sparse.js'
export type { SparseVector } from './sparse.js'
