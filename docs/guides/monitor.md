# Monitor Server

`@fulcrum/monitor` is a Hono HTTP server that exposes metrics, analytics, event streams, a control API, and a built-in web dashboard.

---

## Starting the server

```bash
fulcrum serve monitor          # HTTP server on default port 4721
fulcrum serve all --port 4721  # MCP + monitor together
```

```typescript
import { startMonitorServer } from '@fulcrum/monitor'

const server = startMonitorServer({ workspace_id: 'ws_1', port: 7331 })
await server.start()    // binds the HTTP port
await server.stop()     // graceful shutdown

// In tests — call routes in-process without binding a port:
const res = await server.fetch(new Request('http://localhost/status'))
```

---

## Web Dashboard

Opening `http://localhost:4721` in a browser serves the built-in control room UI. No extra server or bundler required — the HTML is served directly from `@fulcrum/monitor`.

The dashboard shows:
- **Board summary** — task counts across backlog / active / blocked / done columns
- **Active agents** — live agent run status with role and elapsed time
- **Event stream** — real-time SSE feed of workspace events (auto-reconnects)
- **Blocked runs** — runs waiting on human action, with one-click unblock

**Quick actions** (require `FULCRUM_MONITOR_TOKEN` to be set):
- Create a task — fills workspace/project from context
- Unblock a run — sets status back to `running` and clears the blocker
- Kill a run — marks status as `aborted`

Set the bearer token in the browser's token input field; it is persisted to `localStorage`.

---

## Bearer Token Auth

Write endpoints (`POST /tasks`, `POST /runs`, `POST /runs/:id/complete`, etc.) require a bearer token when `FULCRUM_MONITOR_TOKEN` is set:

```bash
export FULCRUM_MONITOR_TOKEN=my-secret-token
fulcrum serve monitor
```

```bash
curl -X POST http://localhost:4721/tasks \
  -H 'Authorization: Bearer my-secret-token' \
  -H 'Content-Type: application/json' \
  -d '{"workspace_id":"ws_1","title":"Ship billing"}'
```

Read endpoints (`GET *`) are always unauthenticated.

---

## Read Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/status` | Health check |
| `GET` | `/metrics` | Daily + project metrics |
| `GET` | `/burndown` | Burndown data |
| `GET` | `/analytics/per-role` | Per-role aggregate metrics |
| `GET` | `/analytics/memory` | Memory write/recall metrics |
| `GET` | `/analytics/forecast` | Trend forecasting (`?horizon_days=30`) |
| `GET` | `/analytics/summary` | High-level analytics rollup |
| `GET` | `/` | Built-in web dashboard (HTML) |
| `GET` | `/events/stream` | Server-Sent Events stream (SSE, resumable via `Last-Event-ID`) |
| `GET` | `/board` | Kanban board snapshot (backlog/active/blocked/done counts) |
| `GET` | `/agents` | Agent run list (recent 50, ordered by `started_at DESC`) |
| `GET` | `/agents/:id` | Agent run detail |
| `GET` | `/merge-queue` | Worktrees with `status='ready_for_merge'` |
| `GET` | `/review-queue` | Reviews with `status='pending'` |
| `GET` | `/artifacts` | Artifacts by workspace (recent 50) |
| `GET` | `/memory-trace` | Memory read/write trace (recent 50) |
| `GET` | `/policy/events` | Recent policy decisions (recent 50) |
| `GET` | `/sync/state` | Plane sync state |
| `GET` | `/teams` | Team instances |
| `GET` | `/replay/:run_id` | Replay an agent run's events |
| `GET` | `/tasks` | Task list with filter + pagination |
| `GET` | `/.well-known/agent.json` | A2A Agent Card — skills derived from registered `AgentDefinition` capabilities |

### Pagination

List endpoints that support pagination (`/tasks`, `/agents`, `/artifacts`, `/memory-trace`, `/teams`) accept `?limit=N&cursor=OFFSET` and return:

```json
{ "data": [...], "pagination": { "total": 42, "limit": 20, "offset": 0, "next_cursor": 20 } }
```

`next_cursor` is `null` when all results are exhausted. Maximum `limit` is 200.

The `/tasks` endpoint also accepts `?status=<value>` to filter by status.

---

## Control Endpoints

All write endpoints require `Authorization: Bearer <FULCRUM_MONITOR_TOKEN>` when the env var is set.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/tasks` | Create a task |
| `POST` | `/runs` | Start a run (policy-checked) |
| `POST` | `/runs/:id/heartbeat` | Heartbeat a run |
| `POST` | `/runs/:id/complete` | Complete a run |
| `POST` | `/runs/:id/block` | Block a run |
| `POST` | `/runs/:id/unblock` | Unblock a run (sets status to `running`, clears blocker) |
| `POST` | `/runs/:id/kill` | Abort a non-terminal run (sets status to `aborted`) |
| `POST` | `/reviews/:id/approve` | Approve a pending review |
| `POST` | `/reviews/:id/reject` | Reject a pending review |
| `POST` | `/memory/recall` | Hybrid recall across L1/L2 |
| `POST` | `/memory/write` | Write a memory |
| `POST` | `/cos-context` | Build the CoS context block |
| `POST` | `/policy/check` | Evaluate policy against an actor + resource |

### `POST /policy/check`

```json
{
  "workspace_id": "ws_1",
  "actor_id": "agt_1",
  "actor_role": "software_engineer",
  "action": "deploy:production",
  "resource_id": "proj_1"
}
```

Returns:

```json
{ "allowed": false, "rule_id": "rule_01j..." }
```

---

## A2A Agent Card

`GET /.well-known/agent.json` returns a standard A2A protocol Agent Card. Skills are derived from the `capabilities` field of registered `AgentDefinition` records in the workspace. Known capability → skill mappings: `code_generation`, `code_review`, `test_generation`, `refactoring`, `documentation`, `planning`, `research`, `debugging`, `deployment`, `data_analysis`, `security_review`, `architecture`.

```json
{
  "name": "Fulcrum Agent OS",
  "version": "1.0.0",
  "url": "http://127.0.0.1:7331",
  "description": "Fulcrum multi-agent orchestration platform",
  "skills": [{ "id": "code_generation", "name": "Code Generation", "description": "..." }],
  "authentication": { "schemes": ["bearer", "none"] },
  "capabilities": { "streaming": true, "pushNotifications": false, "stateTransitionHistory": true }
}
```
