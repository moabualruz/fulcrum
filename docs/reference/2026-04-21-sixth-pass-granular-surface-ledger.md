---
title: "Sixth pass granular surface ledger"
type: reference
status: active
date: 2026-04-21
origin: "User correction that previous sixth-pass coverage was not granular and skipped packages/plugins/extensions."
---

# Sixth Pass Granular Surface Ledger

This ledger reopened the sixth pass because the earlier report was a targeted
gap-closure run plus broad verification, not a full granular project pass. The
ledger is now terminal: every unit below is accepted with evidence.

Guard: `scripts/surface-inventory.test.ts`.
Machine-checked unit ledger:
`docs/reference/2026-04-21-sixth-pass-unit-acceptance-ledger.json`.

The JSON ledger currently contains 3,006 explicit unit rows:

| Unit class | Rows |
|---|---:|
| workspace projects | 17 |
| package source files | 291 |
| package test files | 334 |
| package config files | 37 |
| package generated artifacts | 37 |
| script source files | 23 |
| package manifest scripts | 80 |
| public package entrypoints | 13 |
| package exports | 966 |
| CLI dispatch tokens | 44 |
| fanout targets | 8 |
| MCP tool schemas | 43 |
| tool registry entries | 50 |
| monitor routes | 40 |
| workflow steps | 29 |
| installer functions | 18 |
| opencode native tools | 10 |
| PI native tools | 11 |
| agent integration artifacts | 859 |
| host hook config events | 61 |
| PI extension events | 14 |
| PI extension commands | 13 |
| opencode plugin events | 8 |

Current JSON status counts:

| Status | Rows |
|---|---:|
| accepted | 3,006 |
| blocked-external | 0 |
| blocked-decision | 0 |
| open (`test-gap`, `integration-gap`, `runtime-unverified`) | 0 |

Presence in this ledger is not acceptance; terminal acceptance now requires the
per-row `evidence` field added in the JSON ledger.

## Workspace Projects

- `package.json`
- `agent-integration/opencode/package.json`
- `agent-integration/pi/cockpit/package.json`
- `packages/agent-fanout/package.json`
- `packages/cli/package.json`
- `packages/core/package.json`
- `packages/fulcrum-mcp/package.json`
- `packages/memory/package.json`
- `packages/monitor/package.json`
- `packages/planning/package.json`
- `packages/policy/package.json`
- `packages/sync/package.json`
- `packages/teams/package.json`
- `packages/worker/package.json`
- `packages/workflows/package.json`
- `packages/worktrees/package.json`
- `scripts/package.json`

Status: terminal. Root workspace package is included because workspace scripts
and dependency graph are part of the shippable surface. Release tag/push scripts
are explicit external blockers instead of hidden open work.

## Agent Host Integrations

- `agent-integration/claude`
- `agent-integration/codex`
- `agent-integration/gemini`
- `agent-integration/opencode`
- `agent-integration/pi`
- `agent-integration/qwen`
- `agent-integration/copilot`
- `agent-integration/cursor`
- `agent-integration/windsurf`

Status: inventory complete, per-host acceptance incomplete. Cursor, Windsurf,
and Copilot now have targeted runtime proof for generated hook dispatch,
documented payload normalization, trusted-session bootstrap, and read/search
bias. Cursor coverage includes documented `sessionStart` env handoff because
`preToolUse` does not include `session_id`. Each host still needs separate
rows for every install path, hook/event,
skill/rule/agent artifact, MCP/native tool, generated artifact, publish state,
negative path, and runtime proof.

## Public Package Entrypoints

- `packages/agent-fanout/src/index.ts`
- `packages/cli/src/index.ts`
- `packages/core/src/index.ts`
- `packages/fulcrum-mcp/src/index.ts`
- `packages/memory/src/index.ts`
- `packages/monitor/src/index.ts`
- `packages/planning/src/index.ts`
- `packages/policy/src/index.ts`
- `packages/sync/src/index.ts`
- `packages/teams/src/index.ts`
- `packages/worker/src/index.ts`
- `packages/workflows/src/index.ts`
- `packages/worktrees/src/index.ts`

Status: terminal in the JSON ledger. Guard rejects wildcard exports from
public package entrypoints. Export rows are individually accepted or blocked
with evidence in the JSON ledger.

## CLI Dispatch Tokens

- `--help`
- `--version`
- `-h`
- `-v`
- `action`
- `actions`
- `agent`
- `agents`
- `bias`
- `board`
- `daemon`
- `doctor`
- `dream`
- `epic`
- `epics`
- `hook`
- `init`
- `install`
- `issue`
- `issues`
- `job`
- `jobs`
- `log`
- `mcp`
- `memory`
- `pi`
- `plugin`
- `plugins`
- `projects`
- `queue`
- `serve`
- `skill`
- `skills`
- `sync`
- `task`
- `tasks`
- `team`
- `teams`
- `tool`
- `tools`
- `tui`
- `version`
- `workflow`
- `workflows`
- `workspaces`

Status: inventory complete. Command-group existence is not acceptance; each
dispatch token still needs subcommand, flag, help, exit-code, and action parity
rows.

## Fanout Targets

- `claude`
- `codex`
- `gemini`
- `opencode`
- `pi`
- `copilot`
- `cursor`
- `windsurf`

Status: inventory complete. Target existence is not acceptance; each target
still needs source-to-output equality, installer utilization, and host-native
runtime rows.

## MCP Tool Schemas

- `list_tasks`
- `create_task`
- `update_task`
- `recall_memory`
- `recall_knowledge`
- `get_memory_sources`
- `get_rag_rebuild_plan`
- `get_rag_rebuild_dry_run`
- `start_rag_rebuild`
- `get_runtime_profile_paths`
- `get_rag_rebuild_report`
- `get_rag_health`
- `start_embedding_job`
- `get_embedding_job_status`
- `get_embedding_job_logs`
- `cancel_embedding_job`
- `resume_embedding_job`
- `retry_embedding_job_failed`
- `inspect_memory`
- `read_raw_source`
- `trace_claim`
- `consolidate_memory`
- `lint_memory`
- `mark_memory_wrong`
- `write_memory`
- `list_agent_profiles`
- `get_agent_run_status`
- `start_agent_run`
- `heartbeat_agent_run`
- `complete_agent_run`
- `block_agent_run`
- `sweep_stale_runs`
- `build_cos_context`
- `get_workspace_status`
- `create_team_template`
- `invoke_team`
- `list_team_templates`
- `list_team_instances`
- `create_agent_profile`
- `create_agent_definition`
- `get_agent_definition`
- `update_agent_definition`
- `list_agent_definitions`
- `get_current_context`

Status: inventory complete. Need per-tool rows for schema, registry, handler,
CLI/action parity, response contract, negative path, and docs.

## Tool Registry Entries

- `get_task`
- `list_tasks`
- `create_task`
- `update_task`
- `get_memory_sources`
- `inspect_memory`
- `read_raw_source`
- `trace_claim`
- `consolidate_memory`
- `lint_memory`
- `mark_memory_wrong`
- `recall_knowledge`
- `recall_memory`
- `write_memory`
- `code_context`
- `project_context`
- `query_memory`
- `search_code`
- `get_rag_rebuild_plan`
- `get_rag_rebuild_dry_run`
- `start_rag_rebuild`
- `get_runtime_profile_paths`
- `get_rag_rebuild_report`
- `get_rag_health`
- `start_embedding_job`
- `get_embedding_job_status`
- `get_embedding_job_logs`
- `cancel_embedding_job`
- `resume_embedding_job`
- `retry_embedding_job_failed`
- `list_agent_profiles`
- `create_agent_profile`
- `get_agent_run_status`
- `start_agent_run`
- `heartbeat_agent_run`
- `complete_agent_run`
- `block_agent_run`
- `sweep_stale_runs`
- `build_cos_context`
- `get_workspace_status`
- `get_current_context`
- `create_team_template`
- `invoke_team`
- `list_team_templates`
- `list_team_instances`
- `create_agent_definition`
- `get_agent_definition`
- `update_agent_definition`
- `list_activations`
- `list_agent_definitions`
- `graph_consistency_check`

Status: inventory complete. Seven registry entries are not public MCP schemas:
`get_task`, `code_context`, `project_context`, `query_memory`, `search_code`,
`list_activations`, `graph_consistency_check`.

## Monitor Routes

- `GET /`
- `GET /status`
- `GET /content-index`
- `GET /metrics`
- `GET /burndown`
- `GET /events/stream`
- `GET /board`
- `GET /agents`
- `GET /workspaces`
- `GET /agents/:id`
- `GET /merge-queue`
- `GET /review-queue`
- `GET /artifacts`
- `GET /memory-trace`
- `GET /analytics/summary`
- `GET /pm/overview`
- `GET /policy/events`
- `GET /sync/state`
- `GET /teams`
- `GET /analytics/per-role`
- `GET /analytics/memory`
- `GET /memory/stats`
- `GET /rag/health`
- `GET /replay/:run_id`
- `GET /analytics/forecast`
- `GET /tasks`
- `POST /tasks`
- `PATCH /tasks/:id`
- `POST /runs`
- `POST /runs/:id/heartbeat`
- `POST /runs/:id/complete`
- `POST /runs/:id/block`
- `POST /runs/:id/unblock`
- `POST /runs/:id/kill`
- `POST /reviews/:id/approve`
- `POST /reviews/:id/reject`
- `POST /memory/recall`
- `POST /memory/write`
- `POST /cos-context`
- `POST /policy/check`
- `GET /.well-known/agent.json`

Status: terminal in the JSON ledger. Route rows now carry explicit evidence or
blocker state instead of parent-level acceptance.
Guard now also checks `docs/guides/monitor.md` route rows and PI cockpit
monitor route calls against the live server route registry.

## Workflow Step Types

- `prompt_user`
- `read_memory`
- `write_memory`
- `spawn_agent`
- `create_task`
- `create_issue`
- `create_epic`
- `write_artifact`
- `read_artifact`
- `evaluate_policy`
- `search_web`
- `search_code`
- `run_tool`
- `wait_for_task`
- `wait_for_review`
- `wait_for_artifact`
- `branch`
- `loop`
- `parallel`
- `complete`
- `halt`
- `escalate`
- `invoke_team`
- `run_script`
- `call_mcp_tool`
- `read_project`
- `review_artifact`
- `validate_schema`
- `gate`

Status: terminal in the JSON ledger. Workflow-step rows carry evidence or
explicit blocker semantics. `search_web` and `call_mcp_tool` are not accepted
by parent-level workflow presence alone.

## Installer Functions

- `installCliBin`
- `installClaudePluginNative`
- `installClaudeMcp`
- `installClaudeHook`
- `installClaudeContext`
- `installClaudeSkills`
- `installClaudeAgentMds`
- `installClaudeCommands`
- `installGeminiExtension`
- `installQwenExtension`
- `installPiCockpit`
- `installCodexGlobal`
- `installOpencodeGlobal`
- `installCursor`
- `installCodex`
- `installOpencode`
- `installWindsurf`
- `installCopilot`

Status: inventory complete. Cursor, Windsurf, and Copilot generated artifacts
now prove fanout byte-equality. Remaining install functions still need
per-function rows for dry-run, idempotence, rollback/journal, verify output,
generated artifact source, and platform-specific command validity.

## Native opencode Tools

- `fulcrum_workspace_status`
- `fulcrum_list_tasks`
- `fulcrum_create_task`
- `fulcrum_recall_memory`
- `fulcrum_write_memory`
- `fulcrum_start_run`
- `fulcrum_heartbeat`
- `fulcrum_complete_run`
- `fulcrum_block_run`
- `fulcrum_build_cos_context`

Status: inventory complete. Needs per-tool runtime rows proving args, action
mapping, policy/negative path, and response shape.

## Native PI Cockpit Tools

- `fulcrum_list_tasks`
- `fulcrum_create_task`
- `fulcrum_update_task`
- `fulcrum_recall_memory`
- `fulcrum_write_memory`
- `fulcrum_start_run`
- `fulcrum_heartbeat`
- `fulcrum_complete_run`
- `fulcrum_block_run`
- `fulcrum_workspace_status`
- `fulcrum_build_cos_context`

Status: inventory complete. Needs per-tool runtime rows plus PI event rows for
policy hook, lifecycle hooks, context/bias behavior, resources, shutdown, and
dashboard refresh.

## Host Artifact Counts

| Host | Files | Skills | Agents | Hook files | Commands/workflows |
|---|---:|---:|---:|---:|---:|
| Claude | 34 | 0 | 24 | 1 | 4 |
| Codex | 73 | 33 | 0 | 1 | 0 |
| Gemini | 81 | 33 | 26 | 1 | 12 |
| opencode | 17 | 0 | 0 | 0 | 5 |
| PI | 10 | 0 | 0 | 0 | 0 |
| Qwen | 69 | 33 | 26 | 1 | 4 |
| Copilot | 64 | 0 | 24 | 1 | 0 |
| Cursor | 77 | 33 | 0 | 1 | 6 |
| Windsurf | 44 | 0 | 0 | 1 | 6 |

Status: counts only. Count parity is not acceptance; each artifact class needs
source, generated output, install path, and verifier rows. The guard now also
checks active host documentation for current hook/config path claims so stale
rules-first wording cannot hide shipped hook surfaces.

## Host Sentinel Artifacts

- `agent-integration/claude/.claude-plugin/plugin.json`
- `agent-integration/claude/.mcp.json`
- `agent-integration/claude/CLAUDE.md`
- `agent-integration/claude/hooks/hooks.json`
- `agent-integration/claude/settings-hooks-snippet.json`
- `agent-integration/codex/AGENTS.md`
- `agent-integration/codex/config.toml`
- `agent-integration/codex/hooks.json`
- `agent-integration/codex/marketplace.json`
- `agent-integration/codex/plugin/.mcp.json`
- `agent-integration/copilot/.github/copilot-instructions.md`
- `agent-integration/copilot/.mcp.json`
- `agent-integration/copilot/.vscode/mcp.json`
- `agent-integration/copilot/AGENTS.md`
- `agent-integration/cursor/.cursor/hooks.json`
- `agent-integration/cursor/.cursor/mcp.json`
- `agent-integration/cursor/.cursor/rules/fulcrum-core.mdc`
- `agent-integration/cursor/mcp.json`
- `agent-integration/cursor/rules/fulcrum.mdc`
- `agent-integration/gemini/GEMINI.md`
- `agent-integration/gemini/gemini-extension.json`
- `agent-integration/gemini/hooks/hooks.json`
- `agent-integration/gemini/policies/fulcrum-sensitive.toml`
- `agent-integration/gemini/policies/fulcrum-subagent-boundaries.toml`
- `agent-integration/opencode/opencode.jsonc`
- `agent-integration/opencode/opencode.md`
- `agent-integration/opencode/package.json`
- `agent-integration/opencode/plugins/fulcrum.ts`
- `agent-integration/opencode/plugins/rider.ts`
- `agent-integration/pi/PI.md`
- `agent-integration/pi/fulcrum.d.ts`
- `agent-integration/pi/cockpit/index.ts`
- `agent-integration/pi/cockpit/package.json`
- `agent-integration/qwen/QWEN.md`
- `agent-integration/qwen/hooks/hooks.json`
- `agent-integration/qwen/qwen-extension.json`
- `agent-integration/windsurf/.windsurf/hooks.json`
- `agent-integration/windsurf/.windsurf/mcp.json`
- `agent-integration/windsurf/.windsurf/rules/fulcrum-core.md`
- `agent-integration/windsurf/mcp.json`
- `agent-integration/windsurf/rules/fulcrum.mdc`

Status: terminal for sentinel artifacts. Removed the stale duplicate
`agent-integration/windsurf/.windsurf/mcp_config.json`; project Windsurf MCP
source is `.windsurf/mcp.json`.

## Acceptance State

| Area | State | Reason |
|---|---|---|
| Surface inventory | accepted | Guarded by `scripts/surface-inventory.test.ts`. |
| Full unit ledger | terminal-all-accepted | 3,006 unit rows: 3,006 accepted, 0 blocked, 0 open. |
| Package internals and exports | accepted | Package roots, 291 production source files, 334 test files, 37 package configs, 37 generated dist artifacts, 80 manifest scripts, and 966 exports have accepted rows. |
| Plugins/extensions | accepted | Host roots, native tools, 859 agent-integration artifact rows, 61 hook config events, 14 PI events, 13 PI commands, and 8 opencode plugin hooks have verifier evidence. |
| Monitor web | accepted for ledgered routes | Route/docs/PI-consumer rows are accepted. Separate browser-visual review remains a future audit surface if new UI claims are added. |
| Install/fanout | accepted | Setup, setup check, fanout utilization, generated artifact, and installer function rows are accepted. |
| Memory v3 | accepted for ledgered units | Eval scripts now have repo-local verifier evidence; shipped memory code/tests remain accepted. |
| External release tags | accepted | Opencode and PI cockpit release rows closed after signed `0.0.6` tags, remote tag verification, manual authenticated npm publish, and registry checks. |

## Latest Verification

- `pnpm --dir scripts test -- surface-inventory` passed with 12 inventory tests
  covering workspace roots, PI extension manifest path validity, host roots,
  public entrypoints, CLI dispatch tokens, fanout targets, host sentinel
  artifacts, callable surfaces, monitor docs/PI route parity, active host-doc
  config claims, package source/test/config/generated files, manifest scripts,
  hook config events, PI extension events/commands, opencode plugin hooks, and
  3,006 explicit terminal unit status rows.
- `pnpm -F fulcrum-agent-cli test -- hook-host-runtime hook-normalization`
  passed inside the full CLI suite with 73 CLI test files and 813 assertions,
  including black-box hook
  commands for Cursor, Windsurf, and Copilot. The tested rows cover generated
  dispatcher commands, real host payload shapes, Cursor `sessionStart` env
  handoff, task-backed trusted session creation, and read/search
  Fulcrum-first bias.
- `pnpm -F fulcrum-agent-cli test -- install-gemini-pi-pr145` passed after
  adding the Gemini native-install fallback verifier.
- `pnpm run setup:gemini && pnpm run setup:check` passed; setup check is all
  green on this machine.
- `pnpm -F fulcrum-memory run eval:fulcrum-recall` passed with 14 tests.
- `pnpm -F fulcrum-memory run eval:longmemeval` passed with 6 tests.
- `pnpm run publish:dry` passed; build completed and pnpm reported no new
  packages to publish.
- `pnpm run publish:all` passed; build completed and pnpm reported no new
  packages should be published.
- Opencode release closed: `pnpm --dir agent-integration/opencode run release`
  pushed signed `opencode-plugin/v0.0.6`, `npm publish --access public`
  published `@fulcrum-agent-os/opencode-plugin@0.0.6`, and `npm view`
  shows `latest: 0.0.6`.
- PI cockpit release closed: `pnpm --dir agent-integration/pi/cockpit run
  release` pushed signed `pi-cockpit/v0.0.6`, `npm publish --access public`
  published `@fulcrum-agent-os/pi-cockpit@0.0.6`, and `npm view` shows
  `latest: 0.0.6`.
- GitHub Actions publish attempts reached npm but failed with empty
  `NODE_AUTH_TOKEN`; repository secret `NPM_TOKEN` was then configured on
  2026-04-22 from the local npm auth token. The already-published `0.0.6` tag
  runs remain historical failures; the next fresh tag verifies CI publishing.
- Watch-script shape verifier passed: 14 `test:watch` scripts are `vitest`,
  with paired `test` scripts as `vitest run`.
- Version-script temp verifier passed: opencode and PI cockpit
  `version:patch`, `version:minor`, and `version:major` mutate only temp
  package versions as expected.
- Package-local suites passed for all tested workspaces: core 601, memory 1113,
  policy 108, CLI 813, fanout 250, monitor 134, planning 102, sync 26, teams
  35, worker 33, workflows 36, worktrees 41, fulcrum-mcp 7, opencode plugin
  30, PI cockpit 18, scripts 63.
- Root regression nets passed: `pnpm test`, `pnpm build`,
  `pnpm run check:cycles`, `git diff --check`.
- Docs inventory compare passed: 149 inventory rows matched
  `find docs -type f | sort`.

## Release Closure Notes

- `0.0.4` tags were pushed before workflow failures were discovered; those
  publish workflows failed before npm because `pnpm/action-setup@v4` lacked a
  pnpm version.
- `0.0.5` tags verified that pnpm setup was fixed, then failed in tarball
  secret scan because `.env` matched legitimate `process.env`/`output.env`
  code references.
- `0.0.6` tags verified both workflow fixes and reached npm publish, then
  failed only because `NPM_TOKEN` was not configured in GitHub Actions at run
  time. Manual authenticated npm publish closed the package availability rows;
  `NPM_TOKEN` is now configured for future tag releases.

## Next Sweep

The next pass can search for new units outside this ledger: browser-visual
claims, unlisted user journeys, live hosted-runtime probes, and newly added
files or docs since this ledger closed.
