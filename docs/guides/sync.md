# Plane Sync

`fulcrum-sync` provides bidirectional synchronization with [Plane](https://plane.so/).

---

## Usage

```typescript
import { syncObject, resolveConflict } from 'fulcrum-sync'

await syncObject({
  workspace_id: 'ws_1',
  object_type:  'issue',
  object_id:    issue.issue_id,
  local_data:   issue,
})

await resolveConflict({
  conflict_id: conflict.conflict_id,
  resolution:  'local_wins',   // or 'remote_wins' / 'manual'
})
```

---

## CLI

```bash
fulcrum sync status [--workspace-id W]
fulcrum sync push --workspace-id W [--object-type T]
fulcrum sync pull --workspace-id W [--object-type T]
```

---

## PlaneAPIClient

The client includes automatic retry:

- **429** responses wait for the `Retry-After` header
- **5xx** responses use exponential backoff
- Network errors retry up to 3 times
- Error messages expose only the HTTP status code, not response bodies

---

## Required Environment Variables

| Env var | Description |
|---------|-------------|
| `PLANE_API_KEY` | Plane API key |
| `PLANE_BASE_URL` | Plane API base URL |
| `PLANE_WORKSPACE_SLUG` | Plane workspace slug |
| `PLANE_PROJECT_ID` | Plane project ID |

---

## Conflict Detection

When a local write conflicts with a remote update (both sides changed since last sync), `fulcrum-sync` stores the conflict in the `sync_conflicts` table. Resolution strategies:

- `local_wins` — apply the local version to Plane
- `remote_wins` — apply the Plane version locally
- `manual` — human (or agent) resolves via `resolveConflict()`

Secret scanning runs on all outgoing payloads before push — any match aborts the sync and logs a `policy_event`.
