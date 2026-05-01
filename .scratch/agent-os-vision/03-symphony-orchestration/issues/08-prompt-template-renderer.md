---
Status: ready-for-agent
Triage: AFK
Pillar: 03-symphony-orchestration
Blocked-by: 02-schema-workflow-definitions
---

# Prompt template renderer: liquidjs strict mode + WORKFLOW.md loader

## Parent
PRD: `.scratch/agent-os-vision/prds/03-symphony-orchestration.md`

## What to build
Implement `src/orchestration/symphony/prompt.ts`:
- `loadWorkflowDef(orgId, projectId)` — fetches `workflow_definitions` row; falls back to org-wide default (NULL `project_id`).
- `renderPrompt(workflowDef, context)` — instantiates `liquidjs` with `{ strictVariables: true, strictFilters: true }`; renders `prompt_md` with `context = { issue: TaskRow, attempt: number | null }`; unknown variable throws `UnknownVariableError` (not silent).
- `parseWorkflowConfig(configYaml)` — Zod-validates YAML front-matter (`stall_timeout_ms`, `max_retry_backoff_ms`, `keepOnFailure`, `maxAttempts`).
Expose `orchestration.renderPromptPreview` tRPC procedure for the Web editor.

## Acceptance criteria
- [ ] Schema / state machine: `workflow_definitions` read by `loadWorkflowDef`; fallback to org-wide default when no project-specific def found
- [ ] Tracker adapter: N/A
- [ ] Dispatch loop / hooks: `renderPrompt` called in `before_run` hook context (wired in slice 09)
- [ ] Surfaces (web/cli/tui parity): `orchestration.renderPromptPreview` tRPC procedure callable from the Web workflow editor; `fulcrum symphony runs show` includes rendered prompt excerpt in `--verbose` mode
- [ ] Tests: template with valid `{{issue.title}}` renders correctly; template with `{{unknown_var}}` throws `UnknownVariableError`; `parseWorkflowConfig` rejects invalid YAML; `loadWorkflowDef` returns org-wide default when no project match
- [ ] SPEC conformance traced in `docs/symphony-conformance.md`: §Prompt Template section mapped to `prompt.ts:renderPrompt`

## Blocked by
02-schema-workflow-definitions

## Notes
liquidjs MIT, TS-native. Strict mode is SPEC.md mandatory. The `attempt` variable is nullable (null on first run).
