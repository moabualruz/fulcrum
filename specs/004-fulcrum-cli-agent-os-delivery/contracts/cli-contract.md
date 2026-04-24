# CLI Contract

## General Rules

- Binary name: `fulcrum`.
- All commands support `--json` for machine-readable output when they return structured data.
- All state-changing commands support `--preview` or produce a preview automatically when destructive, externally visible, permanent, broad-scope, remote, or trust-boundary-crossing. Preview mode is a safety feature and never replaces the real command implementation.
- Exit code `0` means command succeeded. Exit code `1` means command failed. Exit code `2` means policy approval is required. Exit code `3` means requested capability is degraded or unavailable. Exit code `4` means invalid input.
- JSON output uses shared schemas from `packages/shared/` and includes `schemaVersion`, `requestId`, `status`, and `data` or `error`.
- Human output and JSON output must derive from the same core service response.

## Global Flags

- `--json`: emits machine-readable output for commands with structured responses.
- `--config <path>`: loads an explicit Fulcrum configuration file and records the config source in command output.
- `--project <projectId>`: scopes commands to a registered project and fails with structured ambiguity when omitted for multi-project operations.
- `--task <taskId>`: scopes commands to a task and records the selector in provenance for generated context, runs, artifacts, gates, and writebacks.
- `--run <runId>`: scopes commands to a run and records the selector in provenance for logs, artifacts, gates, summaries, worktree status, and writebacks.
- `--local-only`: denies remote PM, remote model/provider, remote telemetry, remote observability, and public-bind actions unless the operator changes policy outside the command.
- `--preview`: evaluates effects, policy requirements, affected records, and external visibility without mutating state.
- `--dry-run`: SRS compatibility alias for `--preview`; help text MUST prefer `--preview`, and this alias MUST NOT count as implementation of the real action.
- `--yes`: skips non-policy interactive confirmations only where policy allows; it MUST NOT bypass required approvals.
- `--verbose`: includes debug-level local diagnostics with redaction applied.
- `--no-color`: disables color and preserves non-color status labels.

## Shared Error Shape

```json
{
  "schemaVersion": "1.0",
  "requestId": "req_01",
  "status": "error",
  "error": {
    "code": "POLICY_APPROVAL_REQUIRED",
    "message": "Worktree cleanup requires approval.",
    "actionable": true,
    "nextAction": "Run fulcrum policy approve pol_01 or retry with --request-approval.",
    "policyDecisionId": "pol_01",
    "redactionStatus": "redacted"
  }
}
```

## Setup Commands

### `fulcrum setup preview`

Shows local state locations, proposed changes, required capabilities, optional capabilities, privacy defaults, and approvals needed. Must not mutate state.

JSON `data`: `SetupPreview`.

### `fulcrum setup apply`

Applies approved local setup. Must not install privileged dependencies, edit shell profiles, start remote services, or mutate global state without policy approval.

JSON `data`: `SetupState`.

## Doctor Commands

### `fulcrum doctor`

Reports capability health for local and optional capabilities. Supports `--json`, `--deep`, `--project <projectId>`, and `--no-network`.

JSON `data`: `DoctorReport` with capability states `managed`, `detected`, `guided`, `optional`, `blocked`, `degraded`, `disabled`, or `unknown`.

### `fulcrum repair`

Repairs Fulcrum-owned local state only after previewing affected records. Must not mutate user repositories or global host state without explicit approval.

### `fulcrum uninstall`

Removes Fulcrum-managed local state according to a previewed plan. Backups are preserved unless purge is explicitly approved.

## Project Commands

### `fulcrum project add <path>`

Registers a local Git repository as a Fulcrum project.

Required output: stable `projectId`, root path, default branch, ignored path policy, worktree policy, quality gates, privacy mode, and health state.

### `fulcrum project list`

Lists projects with health, degraded capabilities, active runs, task counts, review queue counts, and privacy status.

### `fulcrum project show <project>`

Shows project registry data, external mapping, memory path, worktree base, quality gates, ignored paths, agents, health, and privacy status.

### `fulcrum project doctor <project>`

Runs project-scoped doctor checks for Git, memory backend, AGENTS.md, CLAUDE.md, MCP configuration, quality gates, worktree base, ignored paths, redaction, and enabled adapters.

### `fulcrum project config <project>`

Shows or updates project configuration through previewed, policy-aware changes.

## External PM Commands

### `fulcrum plane connect`

Configures Plane or compatible external PM credentials and endpoint through previewed local credential handling.

### `fulcrum plane doctor`

Reports external PM health, credential status, workspace/project mapping, sync status, privacy impact, and next actions.

### `fulcrum plane import`

Imports configured external projects and work items as local task mirrors with separate external IDs and local Fulcrum IDs.

### `fulcrum plane sync`

Synchronizes configured external work items, reports conflict/local-newer/remote-newer states, and preserves Fulcrum execution history.

### `fulcrum plane link-task <taskId> <externalWorkItemId>`

Links a local task to an external work item with provenance and mapping status.

### `fulcrum plane writeback <runId>`

Previews and policy-gates external comments, status updates, artifact links, and summarized run writebacks.

## Task Commands

### `fulcrum task create --project <projectId> --title <title>`

Creates a local task. Optional flags include `--description`, `--priority`, `--label`, `--agent`, `--file`, and `--memory`.

### `fulcrum task list`

Lists tasks by project, status, priority, agent, queue, or degraded state.

### `fulcrum task show <taskId>`

Shows task details, external mirror, linked files, memory, artifacts, current run, policy constraints, and next action.

### `fulcrum task claim <taskId>`

Claims a ready task for an operator or agent and records requester, time, and policy context.

### `fulcrum task status <taskId> <status>`

Attempts an SRS-defined task lifecycle transition with the same validation as `task transition`.

### `fulcrum task assign <taskId> --agent <agent>`

Assigns a configured agent or role preference to a task and records availability/degraded status.

### `fulcrum task transition <taskId> --to <status>`

Attempts a task lifecycle transition. Invalid transitions fail unless policy-approved override is provided.

## Run Commands

### `fulcrum run start <taskId> --agent <agentName>`

Creates a supervised run, allocates or validates worktree, builds or links context pack, records command identity, starts process supervision, and streams events unless `--detach` is used.

### `fulcrum run status <runId>`

Shows run status, heartbeat, events, context pack, worktree, logs, artifacts, quality gates, policy decisions, and next action.

### `fulcrum run cancel <runId>`

Requests controlled cancellation. Records cancellation request, stop attempt, preserved artifacts, and terminal state.

### `fulcrum run tail <runId>`

Streams redacted stdout/stderr or event summaries for the run without treating raw logs as writeback content.

### `fulcrum run summarize <runId>`

Produces an operator-visible summary from artifacts, events, gates, and context with provenance references.

### `fulcrum run complete <runId>`

Completes a run only when required gates, policy decisions, review state, artifacts, and terminal-state rules allow it.

## Context Commands

### `fulcrum context build <taskId>`

Builds an explainable context pack. Supports `--budget`, `--lane`, `--offline`, `--format markdown|json|prompt`, and `--output <path>`.

Output includes included items, omitted items, degraded lanes, freshness, evidence type, source refs, and redaction status.

### `fulcrum context show <contextPackId>`

Shows context pack metadata, lanes, items, budget, omissions, degraded lanes, and export refs.

### `fulcrum context explain <contextPackId>`

Explains why each context item was included, what was omitted, and which sources were stale/degraded.

### `fulcrum context export <contextPackId> --format markdown|json|prompt`

Exports context pack content locally with provenance and redaction status.

## Memory Commands

### `fulcrum memory import <path> --project <projectId>`

Imports local markdown/text memory with source provenance.

### `fulcrum memory add --file <path>`

Adds or drafts a memory entry from a local markdown source with frontmatter validation and source refs.

### `fulcrum memory search <query> --project <projectId>`

Returns memory results with source file, linked refs, status, backend, rank, reason, and limitations.

### `fulcrum memory approve <memoryId>`

Approves a draft memory update after policy check.

### `fulcrum memory writeback <runId>`

Creates or approves a run-linked memory update with source refs and policy decision.

### `fulcrum memory stale <memoryId>`

Marks memory stale when linked files, tasks, runs, or source documents are deleted, renamed, or superseded.

### `fulcrum memory open <memoryId>`

Opens or prints the local memory source path/metadata without bypassing redaction/export policy.

## Code Commands

### `fulcrum code search <query> --project <projectId>`

Searches exact identifiers, strings, paths, filenames, errors, symbols, imports, exports, structural results, and optional semantic results. Results include evidence type, source ref, ignored path behavior, freshness, and reason.

### `fulcrum code files <pattern>`

Finds files and paths using local file discovery with ignored-path reporting.

### `fulcrum code structural <pattern>`

Runs structural search through a configured local structural-search adapter and reports degraded state when unavailable.

### `fulcrum code repomap refresh` and `fulcrum code repomap show`

Builds and shows repo-map evidence with tool version, repository commit, config hash, generated time, included file count, and cache freshness.

### `fulcrum code repomix build` and `fulcrum code repomix show`

Builds and shows local repo-pack evidence with included files preview, ignored-path behavior, size, freshness, and redaction status.

## Worktree Commands

### `fulcrum worktree allocate <taskId>`

Allocates or validates an isolated worktree/branch for a task or records a policy-approved reason for using an existing workspace.

### `fulcrum worktree status <worktreeId>`

Shows dirty state, untracked count, conflicts, unpushed commits, active runs, artifacts, gates, review findings, merge readiness, and cleanup eligibility.

### `fulcrum worktree cleanup <worktreeId>`

Requires preview and policy approval when cleanup is destructive or unsafe. Blocks dirty, untracked, conflicted, active, unpushed, or unapproved cleanup.

### `fulcrum worktree diff <worktreeId>`

Shows diff summary, file-change summary, linked artifacts, review findings, conflicts, and merge readiness.

## Artifact Commands

### `fulcrum artifact attach --run <runId>`

Attaches a local artifact to a run and linked task. Required fields are artifact type, local path or local reference, and summary. Output includes stable artifact ID, content hash when available, size, linked refs, retention/export status, and redaction status.

### `fulcrum artifact show <artifactId>`

Shows artifact metadata, local reference, summary, linked project/task/run, redaction status, retention status, and export status. Raw artifact content is not printed by default when redaction status is unknown or sensitive.

### `fulcrum artifact list <runId>`

Lists run-linked artifacts with type, local ref, hash, size, summary, redaction status, export status, and linked refs.

## Quality Gate Commands

### `fulcrum gate list`

Lists configured quality gates, required/optional status, language preset source, timeout, and readiness impact.

### `fulcrum gate run <taskId> --gate <gateName>`

Runs a configured gate and records output artifacts, status, timing, redaction status, and linked run/task when provided.

### `fulcrum gate show <gateResultId>`

Shows command, working directory, start/end time, duration, exit code, stdout/stderr artifact refs, parsed summary, status, and readiness impact.

## Policy Commands

### `fulcrum policy check --action <action> --subject <id>`

Returns `allowed`, `denied`, or `approval_required` with reason, preview, and audit record.

### `fulcrum policy approve <decisionId>`

Approves a pending policy decision within allowed scope.

## Backup And Recovery Commands

### `fulcrum backup create`

Creates restorable manifest with canonical state, config, artifacts, logs, managed memory, and requested context packs.

### `fulcrum backup list`

Lists backup manifests with integrity, coverage, local refs, redaction status, and purge approval state.

### `fulcrum backup restore <backupId>` and `fulcrum restore <backupId>`

Restores canonical records and validates references.

### `fulcrum rebuild projections`, `fulcrum rebuild memory-index`, and `fulcrum rebuild code-cache`

Rebuilds derived indexes, repo maps, memory indexes, graph projections, and context previews.

### `fulcrum export --format json|jsonl`

Exports local machine-readable records with provenance and redaction status.

### `fulcrum reset preview` and `fulcrum uninstall preview`

List removed, preserved, and purged data. Destructive choices require confirmation and policy decision.

## Recommended Skill Calls

Use [../skill-calls.md](../skill-calls.md) as the full catalog. For CLI
contracts, prioritize [$cli-agent-readiness-reviewer](/home/mkh/.raise/profiles/vanilla/codex/skills/cli-agent-readiness-reviewer/SKILL.md),
[$cli-readiness-reviewer](/home/mkh/.raise/profiles/vanilla/codex/skills/cli-readiness-reviewer/SKILL.md),
[$api-and-interface-design](/home/mkh/.raise/profiles/vanilla/codex/skills/api-and-interface-design/SKILL.md),
[$source-driven-development](/home/mkh/.raise/profiles/vanilla/codex/skills/source-driven-development/SKILL.md),
[$test-driven-development](/home/mkh/.raise/profiles/vanilla/codex/skills/test-driven-development/SKILL.md),
and [$document-review](/home/mkh/.raise/profiles/vanilla/codex/skills/document-review/SKILL.md).
