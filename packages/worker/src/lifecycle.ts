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
} from '@moabualruz/fulcrum-core'
import type { RunArtifacts } from '@moabualruz/fulcrum-core'
import { getAgentAdapter, registerAgentAdapter } from './adapter.js'
import { stubAdapter } from './stub.js'
import { subprocessAdapter } from './subprocess.js'
import { claudeCodeAdapter } from './adapters/claude-code.js'
import type { SpawnAgentInput, SpawnContext, WorkerResult } from './types.js'

// ---------------------------------------------------------------------------
// WORK-004: Concurrency semaphore — prevents unbounded parallel agent spawns.
// ---------------------------------------------------------------------------
const MAX_CONCURRENT = Math.max(
  1,
  parseInt(process.env['FULCRUM_MAX_CONCURRENT_AGENTS'] ?? '10', 10),
)

class Semaphore {
  private _available: number
  private _queue: Array<() => void> = []
  constructor(max: number) { this._available = max }
  acquire(): Promise<void> {
    if (this._available > 0) { this._available--; return Promise.resolve() }
    return new Promise(resolve => this._queue.push(resolve))
  }
  release(): void {
    if (this._queue.length > 0) {
      this._queue.shift()!()
    } else {
      this._available++
    }
  }
}

const _sem = new Semaphore(MAX_CONCURRENT)

// ---------------------------------------------------------------------------
// WORK-003: Graceful shutdown — honour SIGTERM by draining in-flight runs.
// ---------------------------------------------------------------------------
let _inflightCount = 0
let _draining = false
let _drainResolve: (() => void) | null = null

/** Resolves when all in-flight spawnAgent calls finish (or immediately if none). */
export function waitForDrain(): Promise<void> {
  if (_inflightCount === 0) return Promise.resolve()
  return new Promise(resolve => { _drainResolve = resolve })
}

/** True once SIGTERM has been received. New spawnAgent calls will be rejected. */
export function isDraining(): boolean { return _draining }

// Register once; guard against double-registration in test environments.
if (typeof process !== 'undefined' && !process.listenerCount('SIGTERM')) {
  process.once('SIGTERM', () => {
    _draining = true
    if (_inflightCount === 0) _drainResolve?.()
  })
}

// ---------------------------------------------------------------------------
// WORK-008: Runtime input validation.
// ---------------------------------------------------------------------------
function validateSpawnAgentInput(input: SpawnAgentInput): void {
  if (!input.workspace_id?.trim()) throw new FulcrumError('workspace_id is required', 'invalid_input')
  if (!input.project_id?.trim()) throw new FulcrumError('project_id is required', 'invalid_input')
  if (!input.task_id?.trim()) throw new FulcrumError('task_id is required', 'invalid_input')
  if (!input.caller_role?.trim()) throw new FulcrumError('caller_role is required', 'invalid_input')
  if (!input.target_role?.trim()) throw new FulcrumError('target_role is required', 'invalid_input')
}

// Register built-in adapters once at module load. Re-registering is
// idempotent for these names — tests that need to override can call
// `registerAgentAdapter` again with the same name.
registerAgentAdapter(stubAdapter)
registerAgentAdapter(subprocessAdapter)
registerAgentAdapter(claudeCodeAdapter)

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
  // WORK-008: validate required fields before anything else
  validateSpawnAgentInput(input)

  // WORK-003: reject new work while draining
  if (_draining) {
    throw new FulcrumError('worker is draining — no new agent runs accepted', 'invalid_state')
  }

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

  // WORK-004: acquire concurrency semaphore before starting the run
  await _sem.acquire()
  _inflightCount++

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
    // WORK-004: release semaphore slot; WORK-003: signal drain if needed
    _sem.release()
    _inflightCount--
    if (_draining && _inflightCount === 0) _drainResolve?.()
  }

  return { run_id: run.run_id, result }
}
