// packages/sync/src/index.ts
// Explicit named exports — avoids `export *` so tree-shaking works and
// internal symbols don't accidentally become public API surface.

export type {
  SyncDirection, ConflictState, SyncableType,
  SyncState, SyncConflict, SyncQueueItem, SyncResult, ExternalPayload,
  SyncAdapter, ApplyRemoteSyncInput, ApplyRemoteSync, PlaneAPIClientConfig,
  SyncObjectInput, CreateSyncStateInput, SyncAllInput,
  GetSyncStateInput, ResolveConflictInput, ListConflictsInput,
} from './types.js'

export { runMigration010 } from './schema.js'
export { PlaneAPIClient } from './plane/client.js'
export { PlaneSyncAdapter } from './plane/adapter.js'
export { SyncManager } from './sync-manager.js'
export { syncObject, syncAll, getSyncState, resolveConflict, listConflicts } from './sync.js'
