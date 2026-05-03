# Symphony SPEC.md Conformance Trace

Maps each implemented SPEC.md section to the Fulcrum source file and function.

## §13.7 OPTIONAL HTTP Server Extension

| SPEC requirement | Fulcrum implementation |
|---|---|
| `GET /api/v1/state` — summary view of current system state | `src/product-kernel/symphony/http-api.ts:getSystemState()` |
| `GET /api/v1/<issue_identifier>` — issue-specific runtime details | `src/product-kernel/symphony/http-api.ts:getIssueDetail()` |
| `POST /api/v1/refresh` — queue immediate tracker poll | `src/product-kernel/symphony/http-api.ts:createHttpApiRoutes().postRefresh()` |
| 404 for unknown issue identifier | `src/product-kernel/symphony/http-api.ts:getIssueDetail()` returns null → 404 |
| Dashboard/API observability-only, not required for orchestrator correctness | Extension is flag-gated (`symphony-http-api`); orchestrator has no dependency on it |
| `server.port` enablement | Caller responsibility; flag gate at `src/product-kernel/features.ts:isFeatureEnabled('symphony-http-api')` |

## Appendix A. SSH Worker Extension (OPTIONAL)

| SPEC requirement | Fulcrum implementation |
|---|---|
| Orchestrator remains single source of truth for polling/claims/retries | SSH worker is dispatch-only; `src/product-kernel/symphony/ssh-worker.ts:dispatchSshWorker()` |
| `worker.ssh_hosts` provides candidate SSH destinations | `src/product-kernel/symphony/ssh-worker.ts:parseSshWorkerConfig()` reads `ssh_host` from WORKFLOW.md config |
| `workspace.root` interpreted on remote host | `SshWorkerConfig.remoteWorkspaceRoot` used in remote command; not local path |
| Coding-agent launched over SSH stdio | `buildSshCommand()` constructs `ssh ... -- <remote-cmd>` invocation |
| `worker.max_concurrent_agents_per_host` optional cap | `SshWorkerConfig.maxConcurrent` parsed from config |
| Flag-gated, off by default (local-first C2) | `src/product-kernel/features.ts:isFeatureEnabled('symphony-ssh-worker')` |

## SSE Extension (real-time-collab-server)

| SPEC requirement | Fulcrum implementation |
|---|---|
| State transitions publish to SSE channel `symphony:run:<runId>` | `src/product-kernel/symphony/sse.ts:SseEventBus.publish()` + `formatSseEvent()` |
| Web board subscribes for live updates without polling | `src/product-kernel/symphony/sse.ts:createSseStream()` produces `ReadableStream` for SSE endpoint |
| Polling fallback when flag off | Caller responsibility; flag gate at `src/product-kernel/features.ts:isFeatureEnabled('real-time-collab-server')` |
| Flag-gated, off by default | `isFeatureEnabled('real-time-collab-server')` defaults to false |
