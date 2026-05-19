# Jobs

Application-layer runtime that drains the platform-core **Job** queue: a worker registry, a queue store contract, a tick loop, queue-depth metrics, and the task-mutation rollup that turns domain events into snapshot writes.

## Language

**WorkerTask**:
A named handler bound to a payload assertion that the worker registry runs when a `Job.kind` is claimed.
_Avoid_: job handler, processor, consumer, executor

**WorkerRegistry**:
The in-memory map of `WorkerTask` entries that asserts the payload then dispatches the handler with caller-supplied helpers.
_Avoid_: dispatcher, task bus, handler map

**JobQueueStore**:
The persistence contract (`enqueue`, `claimNext`, `complete`, `fail`, `listForMetrics`) the tick loop calls; implementations back it with TypeORM or a fake.
_Avoid_: queue driver, job repo, jobs DAO

**WorkerTick**:
One iteration of the loop that claims the next ready **Job**, runs its **WorkerTask**, and reports `idle | succeeded | retryable-failed | terminal-failed`.
_Avoid_: poll, drain cycle, worker step

**QueueDefinition**:
The declarative pair of a queue name and its single **WorkerTask**, produced by `defineQueue` and consumed by bootstrap wiring.
_Avoid_: queue config, queue binding

**CronDefinition**:
A `{ name, taskName, intervalMs }` schedule registered by a bootstrap so the runtime re-enqueues a **WorkerTask** on a fixed cadence.
_Avoid_: scheduled job, timer, recurring task

**JobQueueMetrics**:
A per-queue rollup (`depth`, `running`, `succeeded`, `retryableFailures`, `terminalFailures`, `oldestQueuedLatencyMs`) derived from `LocalJob` rows by `rollupJobQueueMetrics`.
_Avoid_: queue stats, queue health

**MetricsRollupJob**:
The `metrics_rollup` **WorkerTask** that recomputes a `MetricsCache` snapshot for a `(scope_type, scope_id, date)` triple from live `Task` state.
_Avoid_: stats job, snapshot worker, aggregator

**RollupEventPayload**:
The `task.*` **EventBus** payload (`orgId`, `projectId?`, `sprintId?`, `taskId?`) that `setupMetricsRollupListener` fans out into project / sprint / workspace rollups.
_Avoid_: task event, change notification

## Relationships

- A **QueueDefinition** binds one queue name to exactly one **WorkerTask**; the **WorkerRegistry** holds many **WorkerTask** entries across queues.
- A **WorkerTick** consumes one **Job** from a **JobQueueStore**, runs the matching **WorkerTask** via the **WorkerRegistry**, and emits one `WorkerTickResult`.
- A failed **WorkerTick** marks the **Job** retryable while `attempts < maxAttempts`, otherwise terminal — the **JobQueueStore** owns the state transition.
- `rollupJobQueueMetrics` reads `LocalJob` rows from `JobQueueStore.listForMetrics` and returns one **JobQueueMetrics** per queue, sorted by queue name.
- The **MetricsRollupJob** subscribes to `task.status_changed | points_changed | sprint_changed | created | deleted` via **EventBus** and writes one `MetricsCache` row per `(scope, date)` it touches.
- `registerRepoWorkerBootstrap` and `registerNotificationWorkerBootstrap` register cross-service **WorkerTask** entries plus optional **CronDefinition** schedules into the same **WorkerRegistry**.

## Example dialogue

> **Dev:** "If a **WorkerTask** throws and `attempts` already equals `maxAttempts`, what does the **WorkerTick** return?"
> **Domain expert:** "`terminal-failed` — the **JobQueueStore** flips the **Job** to `failed`, and the next `rollupJobQueueMetrics` pass counts it under `terminalFailures`, not `retryableFailures`."
> **Dev:** "And a `task.points_changed` event — does that enqueue a **Job** or run inline?"
> **Domain expert:** "Today `setupMetricsRollupListener` calls `handleMetricsRollup` inline per scope; the **MetricsRollupJob** definition exists so the same handler can move behind a real queue without rewriting the listener."

## Flagged ambiguities

- "task" overloaded between **WorkerTask** (a registered job handler in this folder) and `Task` (the work-management entity the **MetricsRollupJob** reads) — resolved: never drop the `Worker` prefix when speaking about handlers here.
- "queue" overloaded between a **JobQueueStore** queue name (a string label on `LocalJob.queue`) and the in-process **EventBus** topic the rollup listener subscribes to — resolved: jobs are persisted and claimed; events are in-memory pub/sub and never persisted by this folder.
