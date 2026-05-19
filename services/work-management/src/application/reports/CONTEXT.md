# Reports

Application sub-area that exposes read-only metrics and exportable rollups over Tasks, Sprints, and Projects. Wraps `WorkMetricsService` and `MetricsCache` into a stable query surface for HTTP/tRPC and web report pages.

## Language

**ReportSnapshot**:
A persisted `MetricsCache` row serialized as a DTO carrying `completedCount`, `pointsCompleted`, `scopeType`, and `date` for one scope.
_Avoid_: Metric row, cache entry, datapoint.

**ReportScope**:
The `{ scopeType, scopeId }` pair that narrows a report to `sprint | project | epic | workspace`.
_Avoid_: Filter, target, context.

**BurndownPoint**:
One `{ date, pointsRemaining, ideal }` sample on a Sprint burndown series, computed against cached actuals with a linear ideal line.
_Avoid_: Tick, sample, datum.

**ReportType**:
The discriminator of an export request — one of `burndown | burnup | velocity | cfd | cycleTime | leadTime | throughput | wipOverTime | workload | blockedItems | staleIssues | progressRollup`.
_Avoid_: Chart kind, metric name.

## Relationships

- A **ReportSnapshot** belongs to one **Project** and optionally one **Sprint** via `MetricsCache`.
- A **BurndownPoint** series belongs to one **Sprint** and is derived from **Task** points plus cached **ReportSnapshot** rows.
- Every report query takes a **ReportScope**; CSV export takes a **ReportScope** plus a **ReportType**.

## Example dialogue

> **Dev:** "Is `getSprintBurndown` reading the same data as `getBurndownReport`?"
> **Domain expert:** "No. `getSprintBurndown` builds a per-day series for one Sprint from Task points and `MetricsCache`. `getBurndownReport` delegates to `WorkMetricsService` over a `ReportScope` + `DateRange` and returns the generic router shape."

## Flagged ambiguities

- **ReportSnapshot vs MetricsSnapshot** — resolved: **MetricsSnapshot** is the frozen Sprint-close summary on the Sprint entity; **ReportSnapshot** is a `MetricsCache` row serialized for the reports API. Different tables, different lifecycles.
- **scopeType `epic`** — resolved: accepted by the input type for parity with `WorkMetricsService`, but Epic is not a first-class entity in this service; treat as a pass-through scope key.
