// packages/sync/src/sync.ts
import { getDb } from 'fulcrum-agent-core'
import { checkSecrets } from 'fulcrum-policy'
import { PlaneAPIClient } from './plane/client.js'
import { PlaneSyncAdapter } from './plane/adapter.js'
import { SyncManager } from './sync-manager.js'
import type {
  SyncState,
  SyncConflict,
  SyncResult,
  SyncObjectInput,
  SyncAllInput,
  GetSyncStateInput,
  ResolveConflictInput,
  ListConflictsInput,
  PlaneAPIClientConfig,
} from './types.js'

function buildManager(): SyncManager {
  const db = getDb()

  const config: PlaneAPIClientConfig = {
    baseUrl: process.env['PLANE_BASE_URL'] ?? 'https://api.plane.so',
    apiKey: process.env['PLANE_API_KEY'] ?? '',
    workspaceSlug: process.env['PLANE_WORKSPACE_SLUG'] ?? '',
    projectId: process.env['PLANE_PROJECT_ID'],
  }

  const client = new PlaneAPIClient(config)
  const adapter = new PlaneSyncAdapter(client)

  // Secret guard runs before every push (single-object and queue-batch paths)
  const beforePush = (serialisedData: string) => {
    const scanResult = checkSecrets(serialisedData)
    if (scanResult.has_secrets) {
      throw new Error(`Secret detected in sync payload: ${scanResult.matches.join(', ')}`)
    }
  }

  return new SyncManager(db, adapter, beforePush)
}

/**
 * Synchronise a single Fulcrum object to its external sync target.
 *
 * Steps:
 *  1. Reject never-sync object types (Memory, PolicyRule, etc.)
 *  2. Compute SHA-256 hash of canonical local_data — return early if unchanged.
 *  3. Scan local_data for secrets via fulcrum-policy checkSecrets — throw on match.
 *  4. If PLANE_API_KEY not set → enqueue and return queued SyncState.
 *  5. Otherwise push via adapter, store external_id, mark synced.
 *  6. On detected remote conflict: record sync_conflict, set status='conflicted'.
 */
export async function syncObject(input: SyncObjectInput): Promise<SyncState> {
  const manager = buildManager()
  return manager.syncObject(input)
}

/**
 * Process the sync_queue in batches, honouring priority ordering.
 * Default batch size: 50.
 */
export async function syncAll(input: SyncAllInput): Promise<SyncResult> {
  const manager = buildManager()
  return manager.syncAll(input)
}

/**
 * Return the current SyncState for an object, or null if not registered.
 */
export function getSyncState(input: GetSyncStateInput): SyncState | null {
  const manager = buildManager()
  return manager.getSyncState(input)
}

/**
 * Record the resolution of a detected conflict.
 *
 * - local_wins  → re-enqueues the object for push at higher priority (200).
 * - remote_wins → pulls the remote version via adapter.pull().
 * - manual      → clears conflict_state only; no automatic re-sync.
 */
export async function resolveConflict(input: ResolveConflictInput): Promise<SyncState> {
  const manager = buildManager()
  return manager.resolveConflict(input)
}

/**
 * List all sync conflicts for a workspace, optionally filtered by target
 * and/or restricted to unresolved conflicts only.
 */
export function listConflicts(input: ListConflictsInput): SyncConflict[] {
  const manager = buildManager()
  return manager.listConflicts(input)
}
