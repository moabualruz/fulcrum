---
Status: in-progress
Triage: AFK
Pillar: artifacts
Blocked-by: [03-harvest-pipeline.md]
PRD: .scratch/agent-os-vision/prds/10-artifacts.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 10 section)
Decisions: [Q25, Q34]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Artifacts row)
Docs: []
---

# graphile-worker job: artifact.harvest task + enqueue shim from Symphony after_run hook

## Parent
PRD: `.scratch/agent-os-vision/prds/10-artifacts.md` (Always-on: Harvest pipeline, graphile-worker task; issues 10-05)

## What to build
Register a graphile-worker task `artifact.harvest` (payload: `{ runId: string, extractedDir: string }`) that calls `harvestArtifacts()` and handles errors without crashing the worker. Implement the enqueue shim in `src/orchestration/symphony/after_run_hook.ts` that immediately enqueues `artifact.harvest` and returns — decoupling Symphony's `after_run` hook from the harvest latency. Wire doctor check: reports pending/failed harvest jobs count.

## Acceptance criteria
- [ ] Schema migration: graphile-worker job entity/repository from Pillar 1 holds `artifact.harvest` entries.
- [ ] tRPC procedure / module: `src/artifacts/worker.ts` exports `registerArtifactWorkerTasks(worker)` called from main worker bootstrap.
- [ ] Web surface: `/runs/<id>/artifacts` populates after job completes (eventual — no polling needed in this slice; page refresh shows harvested artifacts).
- [ ] CLI command: `fulcrum artifacts list --run-id <id> --json` returns harvested artifacts once job processes.
- [ ] TUI screen: Artifacts pane reflects harvested files after job processes (manual refresh or next TUI tick).
- [ ] Tests: unit — worker task calls `harvestArtifacts()` with correct args; error thrown → job retried (graphile-worker retry contract); enqueue shim returns without awaiting harvest; doctor reports 0 pending on clean run; RED→GREEN.

## Blocked by
- `03-harvest-pipeline.md` — `harvestArtifacts()` must exist.
- Pillar 1 (Foundation) — graphile-worker bootstrap, worker registration pattern.
- Pillar 3 (Symphony) — `after_run` hook contract; enqueue shim lives in Symphony adapter.

## Notes / Tech-stack hints
- graphile-worker retries on thrown errors; do NOT swallow errors — rethrow so graphile-worker can retry.
- Enqueue via `addJob('artifact.harvest', { runId, extractedDir }, { queueName: 'artifacts', jobKey: `harvest:${runId}` })` — jobKey prevents duplicate enqueues for same run.
- Doctor check: `GraphileJobRepository.countPending('artifact.harvest')` reports pending count.
