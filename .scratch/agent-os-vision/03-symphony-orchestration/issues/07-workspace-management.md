---
Status: ready-for-agent
Triage: AFK
Pillar: 03-symphony-orchestration
Blocked-by: 03-schema-agent-runs-symphony-columns
---

# Workspace management: create-on-claim, sanitize key, destroy-on-release

## Parent
PRD: `.scratch/agent-os-vision/prds/03-symphony-orchestration.md`

## What to build
Implement `src/orchestration/symphony/workspace.ts`:
- `sanitizeWorkspaceKey(title, taskId)` — strips non-`[A-Za-z0-9._-]` chars, appends `_<taskId[0..7]>` suffix on collision, enforces max 128 chars.
- `createWorkspace(run)` — mkdir `$FULCRUM_WORKSPACE_ROOT/<orgId>/<sanitizedKey>` (default root `~/.fulcrum/workspaces`); stores `workspace_path` in `agent_runs`.
- `destroyWorkspace(run, opts)` — `rm -rf` on release; when `opts.keepOnFailure=true` + run failed, skip deletion (configurable per project via `WORKFLOW.md`).
Expose `orchestration.getWorkspacePath` tRPC procedure.

## Acceptance criteria
- [ ] Schema / state machine: `agent_runs.workspace_path` populated on claim; cleared or retained on release per `keepOnFailure` flag
- [ ] Tracker adapter: N/A
- [ ] Dispatch loop / hooks: `createWorkspace` called in claim flow; `destroyWorkspace` called in release flow
- [ ] Surfaces (web/cli/tui parity): `fulcrum symphony runs show <runId> --json` includes `workspacePath`; Web run detail page shows path
- [ ] Tests: `sanitizeWorkspaceKey` test matrix: special chars stripped, collision suffix appended, max-length truncation; `createWorkspace` creates dir on disk; `destroyWorkspace` removes dir; `keepOnFailure=true` leaves dir after simulated failure
- [ ] SPEC conformance traced in `docs/symphony-conformance.md`: §Workspace §Naming Invariant mapped to `workspace.ts:sanitizeWorkspaceKey`

## Blocked by
03-schema-agent-runs-symphony-columns

## Notes
`FULCRUM_WORKSPACE_ROOT` env var; doctor checks root writable. Org-scoped subdirectory prevents cross-org path collisions.
