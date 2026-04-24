# Local API And Cockpit Contract

## Service Binding

- Default bind is `127.0.0.1` on an operator-visible port.
- Public or non-loopback bind requires preview, policy approval, and doctor/privacy visibility.
- The cockpit is a local UI over the same core services used by CLI and MCP.
- Cockpit state cannot become canonical workflow state.

## API Conventions

- Base path: `/api/v1`.
- Responses use `schemaVersion`, `requestId`, `status`, `data` or `error`.
- State-changing endpoints return previews for destructive, remote, permanent, public, or broad-scope actions.
- Event streams use Server-Sent Events or WebSocket over loopback and carry event contract payloads.

## Required Endpoints

### Setup And Doctor

- `GET /api/v1/setup/preview`
- `POST /api/v1/setup/apply`
- `GET /api/v1/doctor`
- `GET /api/v1/privacy/status`

### Projects

- `GET /api/v1/projects`
- `POST /api/v1/projects`
- `GET /api/v1/projects/{projectId}`
- `GET /api/v1/projects/{projectId}/health`

### Tasks And Queues

- `GET /api/v1/tasks`
- `POST /api/v1/tasks`
- `GET /api/v1/tasks/{taskId}`
- `POST /api/v1/tasks/{taskId}/transition`
- `GET /api/v1/queues/review`
- `GET /api/v1/queues/merge`
- `GET /api/v1/queues/policy`

### Runs And Activity

- `POST /api/v1/runs`
- `GET /api/v1/runs/{runId}`
- `POST /api/v1/runs/{runId}/cancel`
- `GET /api/v1/runs/{runId}/events`
- `GET /api/v1/activity`

### Context, Memory, And Code

- `POST /api/v1/context-packs`
- `GET /api/v1/context-packs/{contextPackId}`
- `GET /api/v1/memory/search`
- `POST /api/v1/memory/drafts`
- `GET /api/v1/code/search`

### Worktrees, Artifacts, Quality, Policy

- `GET /api/v1/worktrees/{worktreeId}`
- `POST /api/v1/worktrees/{worktreeId}/cleanup-preview`
- `POST /api/v1/worktrees/{worktreeId}/cleanup`
- `GET /api/v1/artifacts/{artifactId}`
- `POST /api/v1/quality/run`
- `POST /api/v1/policy/check`
- `POST /api/v1/policy/{decisionId}/approve`

### Adapters And Recovery

- `GET /api/v1/adapters`
- `POST /api/v1/adapters/{adapterId}/health-check`
- `POST /api/v1/backups`
- `POST /api/v1/restore`
- `POST /api/v1/rebuild`
- `POST /api/v1/exports`
- `POST /api/v1/reset/preview`
- `POST /api/v1/uninstall/preview`

## Cockpit Required Views

- Global overview with projects, tasks, active runs, degraded capabilities, review queues, merge queues, and privacy status.
- Per-project board with tasks by lifecycle, blockers, assigned agents, quality status, and health.
- Task detail with description, linked files, memory, artifacts, external mirror, current run, context, policy, and next action.
- Run detail with status, heartbeat, event stream, logs, artifacts, context pack, worktree, quality gates, policy decisions, summary, and review actions.
- Context/evidence view showing lanes, source refs, evidence type, omissions, degraded lanes, freshness, budget, and limitations.
- Worktree delivery view showing dirty state, diff summary, artifacts, gate status, conflicts, merge readiness, cleanup preview, and block reasons.
- Policy approvals view with requested action, requester, subject, preview, reason, scope, and approval controls.
- Doctor/health view with capability state, blocking status, next action, privacy status, affected workflows, and freshness.
- Adapter settings view with enablement, credentials status, ownership boundary, health, offline behavior, disablement behavior, and privacy notes.
- Backup/recovery view with backup manifests, restore validation, export, rebuild, reset, and uninstall previews.

## Cockpit State Requirements

- Every applicable workflow represents loading, empty, success, partial, degraded, denied, approval-required, conflict, error, and stale states.
- Status is not color-only; views use readable labels and accessible announcements.
- Primary workflows support keyboard navigation and usable focus order.
- Cockpit must surface stale or partial snapshots rather than silently disagreeing with CLI/MCP output.

## Recommended Skill Calls

Use [../skill-calls.md](../skill-calls.md) as the full catalog. For cockpit/API
contracts, prioritize [$frontend-ui-engineering](/home/mkh/.raise/profiles/vanilla/codex/skills/frontend-ui-engineering/SKILL.md),
[$frontend-design](/home/mkh/.raise/profiles/vanilla/codex/skills/frontend-design/SKILL.md),
[$browser-testing-with-devtools](/home/mkh/.raise/profiles/vanilla/codex/skills/browser-testing-with-devtools/SKILL.md),
[$api-and-interface-design](/home/mkh/.raise/profiles/vanilla/codex/skills/api-and-interface-design/SKILL.md),
[$design-lens-reviewer](/home/mkh/.raise/profiles/vanilla/codex/skills/design-lens-reviewer/SKILL.md),
and [$playwright-cli](/home/mkh/.agents/skills/playwright-cli/SKILL.md).
