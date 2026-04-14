# @fulcrum/monitor

Real-time metrics and analytics for the Fulcrum agent runtime — daily rollups, project flow metrics, per-agent stats, burndown charts, and a lightweight Hono HTTP server with SSE event streaming.

## How it works

- **Metrics functions** query SQLite analytics tables (`analytics_daily`, `analytics_project`, `analytics_agent`) and compute derived stats (WIP counts, cycle time, throughput, rejection rates, forecasting).
- **`rollupDaily`** aggregates counts from live tables (issues, tasks, agent_runs, memories) into `analytics_daily` for a given date.
- **`startMonitorServer`** starts a Hono HTTP server bound to `127.0.0.1` (never `0.0.0.0`) on port `7331` by default. It exposes JSON endpoints and an SSE event stream that polls the `events` table every 2 s.

## Usage

```typescript
import { getMetrics, getBurndown, getAgentMetrics, rollupDaily, startMonitorServer } from '@fulcrum/monitor'

// Roll up today's metrics into analytics_daily
await rollupDaily({ workspace_id: 'ws_01' })

// Get daily + project metrics for a date range
const metrics = await getMetrics({
  workspace_id: 'ws_01',
  project_id: 'proj_1',
  start_date: '2026-04-01',
  end_date: '2026-04-14',
})

// Get task burndown data for a project
const burndown = await getBurndown({
  workspace_id: 'ws_01',
  project_id: 'proj_1',
  start_date: '2026-04-01',
  end_date: '2026-04-14',
})
// => { project_id, start_date, end_date, points: [{ date, total, completed, remaining }] }

// Per-agent run stats
const agentStats = await getAgentMetrics({ workspace_id: 'ws_01', agent_id: 'agent_abc' })

// Start the HTTP monitoring server
const server = startMonitorServer({ port: 7331, workspace_id: 'ws_01' })
await server.start()
// GET http://127.0.0.1:7331/metrics?workspace_id=ws_01
await server.stop()
```

## HTTP endpoints

All endpoints accept `?workspace_id=` (falls back to the value set in `MonitorServerConfig`).

| Method | Path | Description |
|---|---|---|
| `GET` | `/status` | Health check — `{ status, workspace_id, ts }` |
| `GET` | `/metrics` | Daily + project metrics (`?project_id`, `?start_date`, `?end_date`) |
| `GET` | `/burndown` | Task burndown (`?project_id`, `?start_date`, `?end_date` required) |
| `GET` | `/events/stream` | SSE stream of events table (polls every 2 s, `Last-Event-ID` supported) |
| `GET` | `/board` | Kanban counts by `status_category` |
| `GET` | `/agents` | Last 50 agent runs |
| `GET` | `/agents/:id` | Single agent run by `run_id` |
| `GET` | `/merge-queue` | Worktrees with status `ready_for_merge` |
| `GET` | `/review-queue` | Pending reviews |
| `GET` | `/artifacts` | Last 50 artifacts |
| `GET` | `/memory-trace` | Last 50 memory entries |
| `GET` | `/teams` | Team instances |
| `GET` | `/policy/events` | Last 50 policy audit events |
| `GET` | `/sync/state` | Sync states |
| `GET` | `/analytics/summary` | Counts: tasks, runs, memories, events |
| `GET` | `/analytics/per-role` | WIP, completed last 30 d, avg cycle days per agent role |
| `GET` | `/analytics/memory` | Memory totals by kind and scope |
| `GET` | `/analytics/forecast` | Estimated completion days (`?horizon_days=30`) |
| `GET` | `/replay/:run_id` | All events for a single run, ordered by time |

## API

### Core metric functions

| Function | Signature | Description |
|---|---|---|
| `rollupDaily` | `(input: RollupDailyInput) => Promise<void>` | Aggregate live table counts into `analytics_daily` for a given date |
| `recordDailyMetrics` | `(input: DailyMetrics) => Promise<void>` | Upsert a pre-computed `DailyMetrics` row |
| `getMetrics` | `(input: GetMetricsInput) => Promise<Metrics>` | Return `{ daily, project }` metric arrays |
| `getBurndown` | `(input: GetBurndownInput) => Promise<BurndownData>` | Task burndown with daily `total / completed / remaining` points |
| `getAgentMetrics` | `(input: GetAgentMetricsInput) => Promise<AgentMetrics[]>` | Per-agent run stats from `analytics_agent` |
| `replayRun` | `(input: ReplayRunInput) => Promise<RunReplay>` | All events for a run, in chronological order |

### Extended / analytics functions (accept `db` as first arg)

| Function | Description |
|---|---|
| `getIssueBurndown(db, input)` | Issues created vs resolved per day |
| `getTaskCycleTime(db, input)` | Avg task cycle time in days, per agent role |
| `getWipCount(db, input)` | Active run count per agent role |
| `getThroughputDaily(db, input)` | Tasks completed per day |
| `getReviewRejectionRate(db, input)` | Rejection rate per reviewer |
| `getFailedRunRate(db, input)` | Failed run rate per role |
| `getAgentRunSummary(db, input)` | Per-agent total/completed/failed/avg-duration |
| `getMemoryScopeDistribution(db, input)` | Memory count by scope |
| `getMemoryRecallCount(db, input)` | Recalled memories by kind |
| `getPerRoleMetrics(db, input)` | WIP + completed 30 d + avg cycle days per role |
| `getMemoryMetrics(db, input)` | Memory totals: `{ total, by_kind, by_scope }` |
| `getForecasting(db, input)` | `avg_cycle_days`, `avg_daily_throughput`, `estimated_completion_days` |

### Server

| Function | Signature | Description |
|---|---|---|
| `startMonitorServer` | `(config: MonitorServerConfig) => MonitorServer` | Create the Hono server; call `.start()` to bind the port |

```typescript
interface MonitorServerConfig {
  port?: number        // default 7331
  host?: string        // default '127.0.0.1'
  workspace_id?: string
}

interface MonitorServer {
  start(): Promise<void>
  stop(): Promise<void>
  port: number
}
```

See [`docs/superpowers/plans/2026-04-13-monitor.md`](../../docs/superpowers/plans/2026-04-13-monitor.md) for the full implementation plan.
