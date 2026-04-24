# Quickstart: Operator Validation Scenario

This quickstart validates Fulcrum from clean local setup through project registration, task execution, context, memory, code evidence, worktree safety, quality gates, policy, terminal dashboard/TUI parity, backup, restore, export, rebuild, uninstall preview, and full release acceptance evidence. It assumes a local developer machine, one test Git repository, and no required cloud account.

## 1. Install Or Run Development Build

1. Install dependencies for the TypeScript monorepo.
2. Build the CLI, local server, MCP package, shared schemas, cockpit assets, and terminal dashboard/TUI assets.
3. Confirm `fulcrum --version` prints version and runtime.
4. Confirm `fulcrum --help` lists setup, doctor, repair, uninstall, project, external PM/Plane, task, run, context, memory, code, worktree, gate, artifact, policy, backup, restore, rebuild, export, and reset commands.

Expected result: CLI starts without network access and reports local runtime information.

## 2. Preview Setup

Run:

```bash
fulcrum setup preview --json
```

Verify:

- No local state is created or mutated.
- Output shows state root, config path, SQLite path, artifact root, log root, backup root, managed memory root, privacy defaults, required capabilities, optional capabilities, and approvals needed.
- Network defaults are local-only and no telemetry is enabled.

## 3. Apply Setup

Run:

```bash
fulcrum setup apply --json
```

Verify:

- SQLite database and local directories are created under previewed paths.
- Setup state is recorded.
- No privileged installation, shell profile edit, remote service startup, or external account setup occurs.

## 4. Run Doctor In Local-Only Mode

Run:

```bash
fulcrum doctor --no-network --json
```

Verify:

- Required local capabilities are classified as `managed`, `detected`, `guided`, `blocked`, or `unknown`.
- Optional remote capabilities are `disabled` or `degraded`, not fatal.
- Each blocked or guided capability has exact next action.
- Human doctor output and JSON output show the same capability states.

## 5. Register Test Project

Create or choose a local Git repository, then run:

```bash
fulcrum project add /path/to/test-repo --json
fulcrum project list --json
```

Verify:

- Project receives stable `projectId`.
- Root path, default branch, worktree policy, ignored paths, quality gates, privacy mode, and health state are recorded.
- Cockpit and CLI show same project ID and health.

## 6. Start Local Server, Cockpit, And Terminal Dashboard

Run:

```bash
fulcrum server start --bind 127.0.0.1 --open
fulcrum tui --project <projectId>
```

Verify:

- Server binds only to loopback.
- Cockpit opens global overview.
- Terminal dashboard opens the same project/run/task data through local core services.
- Doctor/privacy state is visible.
- Project board, review queue, merge queue, activity, adapters, policy views, and terminal dashboard views are reachable by keyboard.

## 7. Create Local Task

Run:

```bash
fulcrum task create --project <projectId> --title "Change README heading" --description "Use deterministic validation agent to edit README safely." --json
fulcrum task transition <taskId> --to ready --json
```

Verify:

- Task has stable `taskId`, status, priority, labels, linked project, and no external dependency.
- Cockpit, CLI, and JSON output agree.

## 8. Import Or Create Memory

Run:

```bash
fulcrum memory import /path/to/test-repo/NOTES.md --project <projectId> --json
fulcrum memory search "README heading" --project <projectId> --json
```

Verify:

- Memory entries include source file, status, freshness, backend, linked refs, rank, reason, and limitations.
- Missing optional memory backend is degraded with fallback local markdown behavior.

## 9. Search Code With Provenance

Run:

```bash
fulcrum code search "README" --project <projectId> --json
```

Verify:

- Results include evidence type, path, line ref when available, query, ignored-path behavior, source tool, freshness, count, and reason.
- Ignored paths are excluded and reported.
- Semantic search disabled state does not break exact search.

## 10. Build Context Pack

Run:

```bash
fulcrum context build <taskId> --budget 8000 --format json --json
```

Verify:

- Context pack includes task details, memory, exact code evidence, structural/repo-map lanes when available, recent run state if present, policy constraints, quality gates, omissions, degraded lanes, and budget.
- Every context item has source reference, evidence type, freshness, inclusion reason, confidence or limitation, and redaction status.

## 11. Start Deterministic Validation Agent Run

Run:

```bash
fulcrum run start <taskId> --agent validation --json
```

Verify:

- Run has stable `runId`.
- Worktree is allocated or policy-compliant existing workspace reason is recorded.
- Context pack, event stream, policy state, log artifact refs, and task link are visible.
- Cockpit live activity updates as the deterministic validation agent emits heartbeat and progress.

## 12. Attach Artifact And Run Quality Gate

Run:

```bash
fulcrum artifact attach --run <runId> --type note --path /path/to/artifact.txt --summary "Deterministic validation agent output" --json
fulcrum gate run <taskId> --gate fast --run <runId> --json
```

Verify:

- Artifact has stable ID, local ref, content hash when available, size, summary, linked run/task, retention status, and redaction status.
- Gate result has command identity, working context, status, timing, output refs, summary, and linked run/task.
- Required gate failure blocks readiness, external writeback, merge readiness, and completion claims until passing evidence is recorded. Operator exceptions remain visible review items and do not satisfy release acceptance.

## 13. Exercise Policy Gates

Run destructive or trust-boundary previews:

```bash
fulcrum worktree cleanup <worktreeId> --preview --json
fulcrum policy check --action external_writeback --subject <taskId> --json
fulcrum policy check --action permanent_memory_write --subject <taskId> --json
```

Verify:

- Cleanup is blocked if dirty, untracked, conflicted, active, unpushed, missing artifacts, or unapproved.
- External writeback and permanent memory write are denied or approval-required by default.
- Policy decisions include action, subject, requester, reason, approval requirement, scope, and audit event.

## 14. Complete Run And Review Delivery

Run:

```bash
fulcrum run status <runId> --json
fulcrum worktree status <worktreeId> --json
```

Verify:

- Completed run shows final summary, changed files or diff summary, context pack, artifacts, quality gates, policy decisions, worktree state, and required review actions.
- Failed or cancelled run preserves logs, artifacts, and worktree state.
- Run reaches at most one terminal state.

## 15. Validate Cross-Surface Parity

Compare:

- `fulcrum task list --json`
- `fulcrum run status <runId> --json`
- Cockpit project/task/run views
- Terminal dashboard/TUI project/task/run views
- MCP `fulcrum_task_get`, `fulcrum_context_get`, `fulcrum_worktree_status`, and resource `fulcrum://runs/<runId>`
- Local health report

Verify matching IDs, statuses, degraded states, artifacts, gates, and policy decisions, or explicit stale/partial markers.

## 16. Backup, Export, Restore, And Rebuild

Run:

```bash
fulcrum backup create --json
fulcrum export --project <projectId> --json
fulcrum rebuild --json
fulcrum restore <backupId> --target /tmp/fulcrum-restore-check --json
```

Verify:

- Backup manifest includes canonical state, config, artifacts, logs, managed memory, and requested context packs.
- Export includes provenance and redaction status.
- Rebuild regenerates derived indexes/projections or marks unavailable sources with next action.
- Restore validates task/run/artifact/policy/context references.

## 17. Reset And Uninstall Preview

Run:

```bash
fulcrum reset preview --json
fulcrum uninstall preview --json
```

Verify:

- Preview lists removed, preserved, and purged data.
- Backups and user work are preserved unless explicit purge approval exists.
- Destructive choices require confirmation and policy decision.

## 18. No-Network Regression

Disable network or run with network blocked, then repeat:

- Doctor quick checks.
- Project list.
- Task create/list.
- Context build from local evidence.
- Deterministic validation agent run.
- Quality gate.
- Backup/export/rebuild.

Expected result: core workflows complete locally. Remote-only capabilities are disabled or degraded with next actions.

## 19. Full Release Acceptance

Run release evidence checks after the local deterministic scenario:

```bash
fulcrum doctor --deep --json
fulcrum gate list --project <projectId> --json
fulcrum run start <taskId> --agent <realAgentA> --json
fulcrum run start <taskId> --agent <realAgentB> --json
fulcrum gate run <taskId> --gate release --json
fulcrum export --format jsonl --project <projectId> --json
```

Verify:

- At least two configured real CLI agents complete the supervised lifecycle through the same task, run, context, worktree, artifact, gate, and policy model.
- Every SRS CLI command group exists and returns human and JSON output from shared services.
- Every SRS MCP tool exists with canonical snake_case names or documented same-schema aliases.
- Cockpit, terminal dashboard/TUI, CLI, MCP, JSON/JSONL, local health reports, and exports show matching canonical IDs, statuses, degraded states, artifacts, quality gates, and policy decisions.
- Optional external PM, memory, semantic search, telemetry, remote-provider, and agent adapters are visible, health-checked, disableable, and degraded with next actions when unavailable.
- No release criterion is counted from preview-only behavior, generated samples, unexecuted checks, placeholder adapters, or documentation-only claims.

## Recommended Skill Calls

Use [skill-calls.md](skill-calls.md) as the full catalog. For quickstart and
acceptance validation, prioritize [$browser-testing-with-devtools](/home/mkh/.raise/profiles/vanilla/codex/skills/browser-testing-with-devtools/SKILL.md),
[$playwright-cli](/home/mkh/.agents/skills/playwright-cli/SKILL.md),
[$agent-browser](/home/mkh/.agents/skills/agent-browser/SKILL.md),
[$test-driven-development](/home/mkh/.raise/profiles/vanilla/codex/skills/test-driven-development/SKILL.md),
[$deployment-verification-agent](/home/mkh/.raise/profiles/vanilla/codex/skills/deployment-verification-agent/SKILL.md),
[$shipping-and-launch](/home/mkh/.raise/profiles/vanilla/codex/skills/shipping-and-launch/SKILL.md),
and [$ce-demo-reel](/home/mkh/.raise/profiles/vanilla/codex/skills/ce-demo-reel/SKILL.md).
