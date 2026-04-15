// packages/sync/src/types.ts

export type SyncDirection = 'local_to_remote' | 'remote_to_local' | 'bidirectional'
export type ConflictState = 'none' | 'detected' | 'resolving' | 'resolved' | 'unresolvable'

// Syncable object types.
// NEVER sync: Memory, PolicyRule, AgentRun, Event, Worktree, HandoffPacket, ArtifactContract
export type SyncableType =
  | 'Issue'
  | 'Task'
  | 'Epic'
  | 'PRD'
  | 'Plan'
  | 'Review'
  | 'Artifact'
  | 'TeamInstance'
  | 'WorkflowRun'

export interface SyncState {
  sync_id: string
  object_type: SyncableType
  object_id: string
  workspace_id: string
  sync_target: string
  external_id?: string
  last_synced_at?: string
  sync_status:
    | 'never_synced'
    | 'queued'
    | 'syncing'
    | 'synced'
    | 'conflicted'
    | 'failed'
    | 'disabled'
  last_sync_hash?: string
  last_sync_error?: string
  direction: SyncDirection      // default 'bidirectional'
  conflict_state: ConflictState // default 'none'
  created_at: string
  updated_at: string
}

export interface SyncConflict {
  conflict_id: string
  sync_id: string
  local_hash?: string
  remote_hash?: string
  detected_at: string
  resolution?: 'local_wins' | 'remote_wins' | 'manual'
  resolved_at?: string
  resolved_by?: string
}

export interface SyncQueueItem {
  queue_id: string
  sync_id: string
  operation: 'upsert' | 'delete'
  priority: number
  scheduled_at: string
  attempts: number
  last_error?: string
  created_at: string
}

export interface SyncResult {
  synced: number
  failed: number
  conflicts: number
  errors: string[]
}

// 3-layer adapter interfaces
export interface ExternalPayload {
  id?: string
  [key: string]: unknown
}

export interface SyncAdapter {
  push(obj: Record<string, unknown>): Promise<string>  // returns external_id
  pull(externalId: string): Promise<unknown>
  /**
   * Return the current canonical hash of the remote object, or null if the
   * object does not exist remotely yet.  Used for conflict detection.
   */
  getHash(objectType: string, externalId: string): Promise<string | null>
  map(local: Record<string, unknown>): ExternalPayload
  unmap(external: unknown): Record<string, unknown>
}

export interface PlaneAPIClientConfig {
  baseUrl: string
  apiKey: string
  workspaceSlug: string
  projectId?: string
}

export interface SyncObjectInput {
  object_type: SyncableType
  object_id: string
  workspace_id: string
  local_data: Record<string, unknown>
  sync_target?: string
}

export interface CreateSyncStateInput {
  object_type: SyncableType
  object_id: string
  workspace_id: string
  sync_target?: string
  direction?: SyncDirection  // default 'bidirectional'
}

export interface SyncAllInput {
  workspace_id: string
  object_type?: SyncableType
  sync_target?: string
  batch_size?: number
}

export interface GetSyncStateInput {
  object_id: string
  sync_target?: string
}

export interface ResolveConflictInput {
  conflict_id: string
  resolution: 'local_wins' | 'remote_wins' | 'manual'
  resolved_by?: string
  /** Required for local_wins — the authoritative local data to push on re-enqueue. */
  local_data?: Record<string, unknown>
}

export interface ListConflictsInput {
  workspace_id: string
  sync_target?: string
  unresolved_only?: boolean
}
