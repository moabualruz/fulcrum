# @fulcrum/sync

Bidirectional sync adapter — push and pull Fulcrum objects to external project-management tools (Plane.so first), with queue-based offline support, SHA-256 hash idempotency, conflict detection, and secret-redaction before every outbound push.

## Architecture

| Layer | Class | Responsibility |
|---|---|---|
| L1 | `PlaneAPIClient` | Raw HTTP calls to the Plane REST API |
| L2 | `PlaneSyncAdapter` | Maps Fulcrum domain fields ↔ Plane payloads, implements `SyncAdapter` |
| L3 | `SyncManager` | Queue processing, canonical hashing, conflict recording, batch `syncAll` |

The five public functions in `sync.ts` delegate to `SyncManager` and call `checkSecrets()` from `@fulcrum/policy` before any outbound push.

**Database tables:** `sync_states`, `sync_conflicts`, `sync_queue` (added by MIGRATION_008).

## Key Concepts

### Sync direction

Each `SyncState` has a `direction` field controlling which side is the source of truth:

| Value | Meaning |
|---|---|
| `local_to_remote` | Fulcrum → Plane only |
| `remote_to_local` | Plane → Fulcrum only |
| `bidirectional` | Both sides (default) |

### Conflict detection

On every push, `SyncManager` fetches the current SHA-256 hash of the remote object and compares it to `last_sync_hash`. If the remote was changed independently, the object is marked `sync_status = 'conflicted'` and a `SyncConflict` record is written. Default auto-resolution is `local_wins`.

### Sync status lifecycle

```
never_synced → queued → syncing → synced
                                 ↘ conflicted
                                 ↘ failed
                                 ↘ disabled
```

### Offline / queue mode

When `PLANE_API_KEY` is not set, objects are enqueued instead of pushed immediately. Call `syncAll` later to drain the queue in priority order (higher `priority` value = processed first).

### Never-sync types

The following types are never allowed through the sync layer:
`Memory`, `PolicyRule`, `AgentRun`, `Event`, `Worktree`, `HandoffPacket`, `ArtifactContract`

## Setup

```bash
export PLANE_API_KEY=your-key
export PLANE_WORKSPACE_SLUG=your-workspace
export PLANE_PROJECT_ID=your-project-id          # optional
export PLANE_BASE_URL=https://api.plane.so        # default
```

## Usage

```typescript
import { syncObject, syncAll, getSyncState, resolveConflict, listConflicts } from '@fulcrum/sync'

// Sync a single Fulcrum Issue to Plane
const state = await syncObject({
  object_type: 'Issue',
  object_id: 'issue_01J...',
  workspace_id: 'ws_main',
  local_data: {
    title: 'Implement login flow',
    description: 'OAuth2 + PKCE',
    status: 'in_progress',
    priority: 'high',
  },
})
// state.sync_status === 'synced' | 'queued' | 'conflicted' | 'failed'

// Process the queue in batches (e.g. on a schedule)
const result = await syncAll({ workspace_id: 'ws_main', batch_size: 50 })
console.log(`synced=${result.synced} failed=${result.failed} conflicts=${result.conflicts}`)

// Check the current sync state for an object
const current = await getSyncState({ object_id: 'issue_01J...' })

// List unresolved conflicts
const conflicts = await listConflicts({ workspace_id: 'ws_main', unresolved_only: true })

// Resolve a conflict
await resolveConflict({
  conflict_id: conflicts[0].conflict_id,
  resolution: 'local_wins',    // 'local_wins' | 'remote_wins' | 'manual'
  resolved_by: 'agent_01J...',
})

await resolveConflict({
  conflict_id: conflicts[0].conflict_id,
  resolution: 'remote_wins',
  resolved_by: 'agent_01J...',
  apply_remote_data: async ({ local_data }) => {
    // Persist adapter.unmap(remote) to the owning local object here.
  },
})
```

## API

```typescript
// Sync a single object; returns its SyncState after the attempt
syncObject(input: SyncObjectInput): Promise<SyncState>

// Process the sync_queue in batches, honouring priority ordering
syncAll(input: SyncAllInput): Promise<SyncResult>

// Return the current SyncState for an object, or null if not registered
getSyncState(input: GetSyncStateInput): Promise<SyncState | null>

// Record a resolution for a detected conflict
resolveConflict(input: ResolveConflictInput): Promise<SyncState>

// List sync conflicts for a workspace
listConflicts(input: ListConflictsInput): Promise<SyncConflict[]>
```

### Input types

| Type | Key fields |
|---|---|
| `SyncObjectInput` | `object_type`, `object_id`, `workspace_id`, `local_data`, `sync_target?` |
| `SyncAllInput` | `workspace_id`, `object_type?`, `sync_target?`, `batch_size?` (default 50) |
| `GetSyncStateInput` | `object_id`, `sync_target?` (default `'plane'`) |
| `ResolveConflictInput` | `conflict_id`, `resolution`, `resolved_by?`, `local_data?`, `apply_remote_data?` |
| `ListConflictsInput` | `workspace_id`, `sync_target?`, `unresolved_only?` |

### Extending to new targets

Implement the `SyncAdapter` interface and pass it to `SyncManager`:

```typescript
interface SyncAdapter {
  push(obj: Record<string, unknown>): Promise<string>       // returns external_id
  pull(externalId: string): Promise<unknown>
  getHash(objectType: string, externalId: string): Promise<string | null>
  map(local: Record<string, unknown>): ExternalPayload
  unmap(external: unknown): Record<string, unknown>
}
```

For `remote_wins`, either pass `apply_remote_data` to `resolveConflict()` or
construct `SyncManager` with an apply callback. The callback must persist the
mapped remote object before sync state moves to `synced`.

## Database tables owned

This package owns tables: `sync_states`, `sync_conflicts`, `sync_queue`.
