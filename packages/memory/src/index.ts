// packages/memory/src/index.ts

// Schema / migrations
export { runMigration101MemoryV3Lifecycle, runMigration102MemoryV3SourceIndex } from './schema.js'

// L0 ingest (memory v3 PR 1 unit 1.1)
export { ingestRawSource } from './l0/ingest.js'
export type {
  L0SourceType,
  L0Frontmatter,
  L0File,
  L0IngestInput,
  L0IngestMeta,
  L0SourceRow,
} from './l0/types.js'
export { L0_SOURCE_TYPES } from './l0/types.js'

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
export { writeMemory, insertMemoryDirect, normalizeCodeText, storeEmbeddingInVec, storeChunkEmbedding, scheduleChunkEmbedding, flushPendingMemoryWrites, waitForEmbedHeadroom } from './write.js'

// Entities
export { linkMemoryToEntity, getMemoryEntities } from './entities.js'

// Recall
export { recallMemory, getMemory, getMemoriesForTask } from './recall.js'

// v2a PR 2 — staged retrieval pipeline + envelope contract.
export { runStagedSearch } from './retrieval/search.js'
export type { StagedSearchResponse, StagedSearchReason, RunStagedSearchInput } from './retrieval/search.js'

// v2a PR 1 Task 9 — kind validation + per-kind char caps.
export { validateKind, isAllowedKind, applyKindCap, V2A_KINDS, LEGACY_KINDS, V2B_KINDS, KIND_CAPS } from './validate-kind.js'

// v2a PR 2 Tasks 12 + 13 — query_memory + search_code action surfaces.
export { queryMemory } from './query-memory.js'
export type { QueryMemoryInput, QueryMemoryResponse, QueryMemoryResultRow } from './query-memory.js'
export { searchCode } from './retrieval/search-code.js'
export type { SearchCodeInput, SearchCodeResponse, SearchCodeResultRow } from './retrieval/search-code.js'

// v2a PR 3 Task 15 — prose chunker for md/json/yaml/toml.
export { ProseChunker, detectProseKind } from './chunkers/prose-chunker.js'
export type { ProseFileKind } from './chunkers/prose-chunker.js'

// v2a PR 3 Task 16 — backfill code_files rows for existing code_chunks.
export { backfillCodeFiles, computeFileId } from './setup/backfill-code-files.js'
export type { BackfillResult } from './setup/backfill-code-files.js'

// v2a PR 5 Tasks 24-27 — sanitize middleware + query sanitizer + recall fence wrap.
export { sanitizeOnWrite, scanForThreats, sanitizeQuery, wrapForRecall } from './sanitize/index.js'
export type { SanitizeEvent, SanitizeMeta, SanitizeResult } from './sanitize/index.js'
export type { RecallEntry, WrapOptions } from './sanitize/wrap-for-recall.js'

// v2a PR 5 Task 26 — WAL writer with sanitize-before-WAL invariant.
export { appendWal, walPathFor, WalDurabilityError } from './wal/writer.js'
export type { WalRecord, AppendWalInput, SanitizedContent } from './wal/writer.js'

// v2a PR 8 Tasks 39-41 — task synthesis + on_delegation pattern.
export { synthesizeTaskOutcome, synthesizeBlockerResolution } from './extractors/task-outcome.js'
export type { SynthesisResult } from './extractors/task-outcome.js'
export { onDelegation } from './hooks/on-delegation.js'
export type { OnDelegationInput, OnDelegationResult } from './hooks/on-delegation.js'

// v2a PR 9 Task 45 — session-scope expiration sweep.
export { sweepExpiredMemories, startSweepTimer, opportunisticSweep } from './sweep.js'
export type { SweepResult } from './sweep.js'

// Ingestion pipeline
export { ingestFile, ingestProject } from './ingest.js'

// v2a PR 4 Task 19 — PCI incremental syncer: bus handler + one-shot file sync.
export { syncFile, startPciSyncer, contentSha256 } from './pci/syncer.js'
export type { PciSyncerOpts, PciSyncerHandle } from './pci/syncer.js'

// v2a PR 4 Task 20 — PCI lifecycle integration hooks.
export {
  onAgentRunStart,
  onAgentRunEnd,
  acquireServerHandle,
  releaseServerHandle,
  resolveProjectRoot,
} from './pci/lifecycle.js'
export type { OnAgentRunStartInput } from './pci/lifecycle.js'

// Indexer daemon (PR 1 of the 2026-04-18 indexer-daemon plan).
export { indexerSocketPath, unlinkStaleSocket } from './indexer/socket-path.js'
export {
  createIndexerClient,
  indexerClient,
  IndexerError,
  IndexerUnreachableError,
  IndexerDisconnectedError,
  _resetIndexerClientForTest,
} from './indexer/client.js'
export type { IndexerClient, IndexerClientOptions } from './indexer/client.js'
export { startDaemon, runDaemonMain, DaemonAlreadyRunningError } from './indexer/daemon.js'
export type { DaemonHandle, DaemonOptions } from './indexer/daemon.js'

// v2a PR 4 Task 21 — gitignore-respecting walker integration.
export { enumerateProjectFiles, shouldIndexPath, MAX_FILE_SIZE_BYTES } from './pci/walker-integration.js'
export type { WalkerResult } from './pci/walker-integration.js'

// v2a PR 7 Tasks 37 + 38 — Kuzu reducers for PCI + memory-write events.
export {
  reduceFileToGraph,
  reduceUnlinkToGraph,
  upsertFileNode,
  upsertCodeChunkNode,
  upsertSymbolNode,
  deleteFileNode,
} from './kuzu/reducers/code.js'
export type { ProjectFileInput, ProjectChunkInput, ProjectSymbolInput } from './kuzu/reducers/code.js'
export { reduceMemoryWrite, extractWikilinkRefs } from './kuzu/reducers/memory.js'
export type { MemoryReducerInput } from './kuzu/reducers/memory.js'


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
export { checkDivergence } from './kuzu/divergence-monitor.js'
export type { DivergeReport, TableConfig, CheckOptions } from './kuzu/divergence-monitor.js'
export { KuzuClient, getKuzuClient, setKuzuClient } from './kuzu/client.js'
export { upsertMemoryToKuzu, removeMemoryFromKuzu } from './kuzu/upsert.js'
export { queryMemoriesL2 } from './kuzu/query.js'
export type { L2QueryInput, ScoredMemoryId } from './kuzu/query.js'
export type { ResolvedEntity } from './kuzu/entity-store.js'

// Extractors
export { extractStructured } from './extractors/structured.js'
export type { ExtractedMention } from './extractors/structured.js'

// v2b PR 13 — code_context + project_context
export { runCodeContext } from './code-context.js'
export type { CodeContextInput, CodeContextResult } from './code-context.js'
export { runProjectContext } from './project-context.js'
export type { ProjectContextInput, ProjectContextResult } from './project-context.js'

// v2b PR 12 — Global pointer + activations
export { listActivations } from './list-activations.js'
export type { ListActivationsInput, ActivationsResponse } from './list-activations.js'
export { checkGlobalPointer, parseGlobalPointerFile } from './recall-global-pointer.js'
export type { GlobalPointerLine, PointerCheckResult } from './recall-global-pointer.js'

// v2b PR 11 — Dreaming pipeline
export { runLightPhase, THRESHOLDS as DREAMING_THRESHOLDS } from './dreaming/light-phase.js'
export type { LightPhaseInput, LightPhaseResult, ScoreEntry, MemoryRow, WikilinkRow, RecallEventRow } from './dreaming/light-phase.js'

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

// v2b PR 15 — normalize_version re-processor
export { CURRENT_VERSION, scanStaleRows, runNormalizeVersion, startNormalizeVersionSweep } from './db/normalize-version.js'
export type { StaleRow, NormalizeResult } from './db/normalize-version.js'

// v2b PR 20 — git reducers
export { reduceGitCommit, reduceGitBranch, reduceGitPr, reduceGitTag } from './kuzu/reducers/git.js'
export type { GitCommitInput, GitBranchInput, GitPrInput, GitTagInput } from './kuzu/reducers/git.js'

// v2b PR 14 — Fulcrum-specific recall eval + LongMemEval harness
export { runFulcrumEval, runFulcrumEvalFromFile, computeMrr, computeNdcg } from './eval/fulcrum-recall/harness.js'
export type { EvalCorpusEntry, EvalRetriever, FulcrumEvalResult, KindMetrics } from './eval/fulcrum-recall/harness.js'
export { runLongMemEval, splitCorpus } from './eval/longmemeval/harness.js'
export type { LmeEntry, LmeAnswerer, LmeSplit, LmeEvalResult } from './eval/longmemeval/harness.js'
