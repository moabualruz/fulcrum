# Phase 5: Reports & Analytics Research

**Date:** 2026-05-05
**Scope:** Sprint, flow, project, team, quality, portfolio reports + data model patterns
**Purpose:** Comprehensive reporting to match Jira/Shortcut analytics depth

---

## Platform Reporting Capabilities

| Report Category | Linear | Jira | ClickUp | Shortcut | Plane | Asana | Monday |
|---|---|---|---|---|---|---|---|
| **Burndown (sprint)** | ✓ (Business+) | ✓ (native) | ✓ (dashboard card) | ✓ | ✓ | ✗ | ✓ (dev only) |
| **Burnup** | Partial | Marketplace | ✓ | ✗ | ✗ | ✓ | ✗ |
| **Velocity** | ✓ (Business+) | ✓ (native) | ✓ | ✓ (via CFD slope) | ✓ | Via integration | ✓ (dev) |
| **CFD** | ✗ | ✓ (native) | ✓ (dashboard) | **✓ (native, best)** | ✗ | ✗ | ✗ |
| **Cycle time** | ✓ (scatterplot, Business+) | Marketplace | ✓ (dashboard) | ✓ (via CFD) | ✗ | ✗ | ✗ |
| **Lead time** | ✓ (scatterplot, Business+) | Marketplace | ✓ (dashboard) | ✗ | ✗ | ✗ | ✗ |
| **Throughput** | ✗ | Marketplace | ✗ | ✓ | ✗ | ✗ | ✗ |
| **Workload** | ✗ | ✓ (gadgets) | ✓ | ✗ | ✓ | ✓ | ✓ |
| **Epic burndown** | ✗ | ✓ (native) | ✗ | ✗ | ✗ | ✗ | ✗ |
| **Portfolio** | ✗ | ✓ (Jira Align) | ✓ | ✗ | Partial | ✓ (Advanced+) | ✓ (200 boards) |
| **Time tracking** | ✗ | ✓ | ✓ | ✗ | ✗ | ✓ | ✓ |
| **CSV export** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Scheduled email** | ✗ | ✓ (marketplace) | ✓ | ✗ | ✗ | ✗ | ✗ |
| **Embeddable** | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

---

## Best-in-Class Per Category

### CFD + Flow Metrics — Shortcut
Native CFD with iteration scope, labeled workflow states, bottleneck identification via expanding bands. Data is event-driven (state transitions logged per story).

### Sprint/Cycle Reports — Jira
Burndown, burnup, velocity, sprint report (carries over + added mid-sprint), release burndown, epic burndown all native. Data model: daily snapshot per sprint day + event log.

### Dashboard Flexibility — ClickUp
Widget-based builder, 15+ card types, covers burndown + burnup + CFD + cycle time + lead time + workload. Caveat: data refreshes at 4 AM daily, not real-time.

### Simplicity + Cycle Focus — Linear Insights (Business+)
Measures: issue count, effort, cycle time, lead time, triage time, issue age — all sliceable by assignee/label/project/team. Scatterplots with percentile bands (p25/50/75/95). Shareable links + CSV export. No CFD or throughput natively.

### Portfolio — Monday.com
AI-powered risk summaries, 200-board All Projects Dashboard, pre-configured portfolio widgets.

### Open Source — Plane
Burndown + velocity + workspace analytics included. Gaps: no CFD, no lead time, no throughput.

---

## Adjacent Solutions (Third-Party Analytics)

### Screenful (screenful.com)
Third-party analytics layer for Linear, Jira, Asana, GitHub. Fills "missing CFD + throughput + forecasting" gap. Pattern: reads via webhooks/polling → stores own event log → computes metrics. If building custom analytics, their data contract (issue events → cycle time histogram → Monte Carlo forecast) is validated.

### Count.co
SQL-driven analytics on top of Linear/Asana/Jira. Exposes raw events as queryable tables; users build burndown via SQL + viz layer. Proves `events_log` + ad-hoc aggregation viable without pre-baked metrics.

### Jellyfish / LinearB / Axify
Engineering analytics that sit above project management data. All use same model: ingest webhook events, materialize daily snapshots for slow-changing aggregates (velocity, WIP), keep raw events for distribution queries (cycle time histogram).

---

## Market Signals

### Data Freshness Gap
ClickUp's 4 AM refresh widely criticized. Linear Insights doesn't document refresh rate. Jira native charts reflect live board state. **Near-real-time (<5 min) is a differentiator.**

### Analytics Behind Paywalls
Linear: Business+. Asana: Advanced+. ClickUp: Business+. Monday: "dev" product for burndown. Plane is only platform with full analytics on free tier (self-hosted). **Ungating basic metrics is a differentiator for developer-focused product.**

### CFD Underserved
Only Shortcut and Jira (natively), plus ClickUp via dashboard card. Linear, Asana, Plane, Monday all miss it. **Most useful flow metric for bottleneck identification** — buildable from status-change events log.

---

## Data Model Architecture

### Two-Layer Model (Industry Converged)

All platforms and third-party analytics tools converge on this:

**Layer 1 — Event Log** (`task_events`):
```
(task_id, event_type, from_value, to_value, field_name, actor_id, sprint_id, project_id, timestamp, metadata)
```

Powers:
- **Cycle time** = diff between `status_change` to "started" and to "completed"
- **Lead time** = diff between `task_created` and `status_change` to "completed"
- **CFD** = count per status per day (GROUP BY date, to_value WHERE event_type='status_change')
- **Throughput** = count of `status_change` to "completed" per week
- **WIP** = count of tasks currently in "started" status (open transitions with no close)
- **Activity feed** = filtered query per task
- **Audit trail** = full history

No snapshots needed for these — query-time computation from event log.

**Layer 2 — Daily Snapshots** (`metrics_snapshots`):
```
(scope_type: 'sprint'|'project'|'epic', scope_id, date, points_total, points_completed, points_remaining, tasks_total, tasks_completed, wip_count, status_counts: jsonb)
```

One row per scope per day. Powers:
- **Burndown** = points_remaining over time
- **Burnup** = points_completed + points_total (scope line) over time
- **Velocity** = sum points_completed per sprint
- **WIP over time** = wip_count per day
- **CFD** (pre-aggregated, faster) = status_counts per day

Required because recomputing from raw events on every dashboard load is expensive for burndown/CFD spanning months.

### What This Model Doesn't Cover
- **Time tracking** → requires separate `time_entries` table (deferred to v2)
- **Reopened issues** → requires `status_change` event with to_value reverting from "completed" to "started"/"unstarted" — covered by Layer 1
- **Custom field changes** → extend event_type to include `custom_field_change` with field_name = custom field id

---

## Report Types — Full Specification

### Sprint Reports (4 types)

| Report | Data Source | Chart Type | Key Features |
|---|---|---|---|
| **Burndown** | Layer 2 snapshots | Line + reference line | Points remaining vs ideal; scope changes as vertical jumps; toggle points/tasks |
| **Burnup** | Layer 2 snapshots | Line (2 series) | Points completed (ascending) + total scope line; shows scope creep explicitly |
| **Velocity** | Layer 2 (aggregated per sprint) | Bar + rolling average line | Last N sprints; bar color: on-target (green), below (amber) |
| **Sprint report** | Layer 1 events + Layer 2 snapshot | Summary card + table | Completed/carried over/added mid-sprint/removed counts; task timeline table; frozen at close |

### Flow Metrics (6 types)

| Report | Data Source | Chart Type | Key Features |
|---|---|---|---|
| **CFD** | Layer 1 events or Layer 2 status_counts | Stacked area | Count per status per day; bottlenecks = expanding bands |
| **Cycle time scatter** | Layer 1 events | Scatter | Each task as dot; x=completion date, y=hours; percentile bands p50/75/95 |
| **Lead time** | Layer 1 events | Scatter | Same as cycle time but created→completed |
| **Throughput** | Layer 1 events | Bar + rolling average | Tasks completed per week; trend direction |
| **WIP over time** | Layer 2 wip_count | Area | Items in started status per day; highlight when exceeding limit |
| **Age of open items** | Layer 1 events (computed) | Horizontal bar | Current items by status; bar = days in status; stale (>14d) red |

### Project/Epic/Milestone Reports (3 types)

| Report | Data Source | Chart Type | Key Features |
|---|---|---|---|
| **Progress rollup** | Layer 2 snapshots (latest per scope) | Donut / progress bar | % complete by tasks and points per epic/milestone/project; drill to task list |
| **Scope tracking** | Layer 2 snapshots over time | Line (3 series) | Original scope vs current vs completed; shows scope creep |
| **Deadline risk** | Layer 2 + velocity extrapolation | Table with traffic light | Items at risk based on velocity projection; green/amber/red |

### Team/Workload Reports (2 types)

| Report | Data Source | Chart Type | Key Features |
|---|---|---|---|
| **Workload distribution** | Query: tasks grouped by assignee + status | Stacked bar | Per assignee: task count by status category |
| **Capacity utilization** | Sprint assignments vs capacity | Bar + target line | Assigned points per member vs capacity; per-sprint |

### Quality/Health Reports (3 types)

| Report | Data Source | Chart Type | Key Features |
|---|---|---|---|
| **Stale issues** | Query: tasks with no event in N days | Table | Sortable by age; configurable threshold (default 14 days) |
| **Blocked items** | Query: tasks with active blocking relationships | Table | Blocker chain, days blocked |
| **Reopened rate** | Layer 1 events: status_change completed→started | Percentage per sprint | Quality signal over time |

### Portfolio Reports (from promoted features)

| Report | Data Source | Chart Type | Key Features |
|---|---|---|---|
| **Portfolio overview** | Layer 2 aggregated per project | Table + progress bars | All projects: name, progress %, sprint summary, overdue, health |
| **Resource allocation** | Sprint assignments across projects | Stacked bar per member | Distribution across projects; over-allocation highlight |
| **Cross-project velocity** | Layer 2 per project per sprint | Grouped bar chart | Velocity comparison across projects |

### Forecasting (from promoted features)

| Report | Data Source | Chart Type | Key Features |
|---|---|---|---|
| **Monte Carlo forecast** | Layer 1 throughput history (30/60/90 days) | Fan chart (layered area) | 1000 iterations; probability cone p50/75/85/95; per sprint/epic |

---

## Charting Library Mapping

| Report Type | LayerChart Component | Composition |
|---|---|---|
| Burndown | `LineChart` | 2 series (actual + ideal reference line) |
| Burnup | `LineChart` | 2 series (completed + scope) |
| Velocity | `BarChart` + `LineChart` overlay | Bar per sprint + rolling average line |
| CFD | `AreaChart` with `stack` layout | One series per status; stacked |
| Cycle time scatter | `ScatterChart` | Dots + percentile reference lines |
| Throughput | `BarChart` + `LineChart` | Bar per week + rolling average |
| WIP | `AreaChart` | Single series + limit reference line |
| Age of items | Horizontal `BarChart` | Grouped by status; stale items highlighted |
| Progress rollup | Custom (shadcn progress bar or donut) | Not LayerChart — simpler component |
| Workload | Stacked `BarChart` | Per assignee, stacked by status |
| Monte Carlo | `AreaChart` with multiple opacity layers | 4 probability bands (p50/75/85/95) |

All achievable with LayerChart composable primitives. No chart type requires an external library beyond LayerChart.
