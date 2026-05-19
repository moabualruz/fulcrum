# Repos: Workers

Background job handlers that materialize a registered repo's git state (branches, commits, file tree) into persistence and search documents, plus a periodic warmup pass for hot remotes.

## Language

**Local sync task**:
Worker that reads a registered local working tree and refreshes its branches, commits, files, and search index.
_Avoid_: pull job, fetch job.

**Remote sync task**:
Worker that ensures a bare mirror of a remote URL under the mirror root, then refreshes the same persistence as the local task.
_Avoid_: clone job, fetch worker.

**LRU warmup task**:
Cron-triggered task that re-enqueues the top recently-touched remote repos so their mirrors stay fresh.
_Avoid_: prefetch, preheater.

**Mirror root**:
Filesystem directory (default `~/.fulcrum/repos/<org>/<repo>`) holding bare mirrors of remote repos.
_Avoid_: cache dir, clone dir.

**Sync status**:
Lifecycle label written to the repo row during a task: `syncing`, `idle`, or `error`.
_Avoid_: state, phase.

**Warmup score**:
Ranking value combining `lastAccessedAt`/`lastTouchedAt` minus a failure-count penalty, used to pick LRU warmup candidates.
_Avoid_: priority, weight.

**Repo sync event**:
`repo.sync.completed` or `repo.sync.failed` row inserted on the events stream and optionally fanned out via the notification queue.
_Avoid_: sync log, audit entry.

## Relationships

- A **Local sync task** and a **Remote sync task** both write **Sync status** transitions and emit a **Repo sync event**.
- The **LRU warmup task** enqueues many **Remote sync tasks** ranked by **Warmup score**.
- A **Remote sync task** resolves a **Mirror root** path before invoking the git client.

## Example dialogue

> **Dev:** "Does the **LRU warmup task** call `syncRemoteRepo` directly?"
> **Domain expert:** "No — it only enqueues **Remote sync tasks** by **Warmup score**; the queue runs them."

## Flagged ambiguities

- "sync" was used for both the **Local sync task** and the **Remote sync task** — resolved: always qualify as local or remote at the worker boundary.
- "warmup" overlapped with generic cache prefetch — resolved: **LRU warmup task** is the only warmup concept in this sub-area.
