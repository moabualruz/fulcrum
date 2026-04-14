// packages/worker/src/lifecycle.ts
// spawnAgent — the lifecycle driver that ties policy + adapter + DB together.
//
// Flow:
//   1. Policy gate: only roles with `can_invoke_teams` may spawn subordinates.
//   2. Resolve adapter (input.adapter → FULCRUM_AGENT_ADAPTER env → 'stub').
//   3. Create the agent_runs row via startAgentRun().
//   4. Run the adapter, piping heartbeats into heartbeatAgentRun().
//   5. Translate the terminal WorkerResult into completeAgentRun /
//      blockAgentRun, and also catch any thrown error and funnel it to
//      blockAgentRun so runs never leak in 'running' state.

import {
  startAgentRun,
  heartbeatAgentRun,
  completeAgentRun,
  blockAgentRun,
  canInvokeTeams,
  FulcrumError,
  startSpan,
  endSpan,
} from '@fulcrum/core'
import type { RunArtifacts } from '@fulcrum/core'
import { getAgentAdapter, registerAgentAdapter } from './adapter.js'
import { stubAdapter } from './stub.js'
import { subprocessAdapter } from './subprocess.js'
import type { SpawnAgentInput, SpawnContext, WorkerResult } from './types.js'

// Register built-in adapters once at module load. Re-registering is
// idempotent for the `stub` and `subprocess` names — tests that need
// to override these can call `registerAgentAdapter` again with the
// same name.
registerAgentAdapter(stubAdapter)
registerAgentAdapter(subprocessAdapter)

/**
 * Build a RunArtifacts blob from a WorkerResult. We only include keys
 * that were actually set by the adapter so the row stays compact.
 */
function buildArtifacts(result: WorkerResult): RunArtifacts | undefined {
  const artifacts: RunArtifacts = {}
  if (result.artifact_paths && result.artifact_paths.length > 0) {
    artifacts.files_changed = result.artifact_paths
  }
  if (typeof result.tests_passed === 'number') artifacts.tests_passed = result.tests_passed
  if (typeof result.tests_failed === 'number') artifacts.tests_failed = result.tests_failed
  return Object.keys(artifacts).length > 0 ? artifacts : undefined
}

export async function spawnAgent(
  input: SpawnAgentInput,
): Promise<{ run_id: string; result: WorkerResult }> {
  // 1. Policy check — only L1 may invoke subordinate agents (§15).
  if (!canInvokeTeams(input.caller_role)) {
    throw new FulcrumError(
      `role '${input.caller_role}' lacks can_invoke_teams`,
      'policy_denied',
    )
  }

  // 2. Pick adapter
  const adapterName = input.adapter ?? process.env['FULCRUM_AGENT_ADAPTER'] ?? 'stub'
  const adapter = getAgentAdapter(adapterName)
  if (!adapter) {
    throw new FulcrumError(`unknown agent adapter: ${adapterName}`, 'not_found')
  }

  // 3. Create the agent_run row. startAgentRun requires a task_id.
  const run = await startAgentRun({
    workspace_id: input.workspace_id,
    task_id: input.task_id,
    role: input.target_role,
  })

  // Telemetry: open a span for the agent run. Attaches to the new run_id
  // so downstream consumers can correlate spans ↔ agent_runs rows.
  const span = await startSpan({
    name: 'agent.run',
    workspace_id: input.workspace_id,
    run_id: run.run_id,
    payload: {
      role: input.target_role,
      adapter: adapterName,
      model: input.model ?? null,
      caller_role: input.caller_role,
    },
  })

  // 4. Invoke the adapter with a heartbeat callback that writes through
  //    to the DB. Heartbeats default to 0% progress when an adapter
  //    doesn't supply a number — the core API requires it.
  const ctx: SpawnContext = {
    run_id: run.run_id,
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    task_id: input.task_id,
    role: input.target_role,
    model: input.model ?? null,
    handoff: input.handoff ?? null,
    worktree_path: input.worktree_path ?? null,
    heartbeat: async (current_step, progress_pct) => {
      await heartbeatAgentRun({
        run_id: run.run_id,
        current_step,
        progress_pct: progress_pct ?? 0,
      })
    },
  }

  let result: WorkerResult
  try {
    result = await adapter.spawn(ctx)
  } catch (err) {
    result = { status: 'blocked', error: (err as Error).message }
  }

  // 5. Persist terminal state.
  try {
    if (result.status === 'completed') {
      const artifacts = buildArtifacts(result)
      await completeAgentRun({
        run_id: run.run_id,
        output_summary: result.summary ?? '',
        ...(artifacts ? { artifacts } : {}),
      })
    } else {
      await blockAgentRun({
        run_id: run.run_id,
        reason: result.error ?? 'adapter reported blocked status',
      })
    }
  } finally {
    await endSpan({
      span_id: span.span_id,
      status: result.status === 'blocked' ? 'error' : 'ok',
      payload: {
        status: result.status,
        summary: result.summary,
        error: result.error,
      },
    })
  }

  return { run_id: run.run_id, result }
}
