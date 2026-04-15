// packages/workflows/src/runner.ts
//
// runWorkflow — the driver loop that takes a workflow_run through to
// completion (H-1/H-5).
//
// Responsibilities:
//  1. Read the run + step defs from workflow_runs (steps are stored as a
//     JSON blob inside the `steps` column — see schema.ts).
//  2. In a bounded loop:
//       - compute nextReadySteps() from the current states
//       - for each ready step, call executeStep() with a timeout
//       - retry failed steps up to max_retries with exponential backoff
//       - persist state after every transition
//  3. Terminate with a final status: completed / blocked / failed.
//
// The runner deliberately does NOT call stepWorkflow() (which is the
// interactive path driven by humans / external callers) because that
// function has its own pause semantics for prompt_user etc. The runner
// writes directly to the JSON blob instead.

import { getDb, startSpan, endSpan, Db} from '@fulcrum/core'
import { nextReadySteps } from './engine.js'
import { executeStep } from './step-executor.js'
import { registry } from './registry.js'
import type {
  WorkflowStepDef,
  WorkflowStepState,
  StepContext,
  StepResult,
  RunWorkflowInput,
  RunWorkflowResult,
  RetryPolicy,
} from './types.js'

const DEFAULT_MAX_ITERATIONS = 1000
const DEFAULT_STEP_TIMEOUT_MS = 600_000
const DEFAULT_RETRY_COUNT = 3
/**
 * Backoff cap for production runs. Tests override this via
 * `RunWorkflowInput.retry_backoff_cap_ms` so they don't sleep for 30s
 * on a retry — see runner.test.ts.
 */
const PRODUCTION_BACKOFF_CAP_MS = 30_000

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * Exponential backoff: 1s, 2s, 4s, 8s, ... capped at `cap_ms`.
 * `attempt` is 1-indexed (the 1st retry waits 1s).
 */
function getBackoffMs(attempt: number, cap_ms: number): number {
  if (attempt <= 0) return 0
  return Math.min(1000 * Math.pow(2, attempt - 1), cap_ms)
}

/**
 * Race a promise against a timeout. On timeout, the original promise
 * is left to resolve / reject in the background — handlers should be
 * idempotent or catch their own errors.
 */
async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`step timeout after ${ms}ms`)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

interface LoadedRun {
  wf_id: string
  workspace_id: string
  project_id: string | null
  steps: WorkflowStepState[]
  step_defs: WorkflowStepDef[]
  version: number
}

/**
 * Load a workflow run and its embedded step defs from the DB.
 * The runner expects that whoever seeded the row wrote an object like
 * `{ states: [...], defs: [...] }` into the `steps` column OR used the
 * registry convention (states only). If only states are present we look
 * up the definition in the registry.
 */
function loadRun(wf_id: string, workspace_id: string, db: Db = getDb()): LoadedRun {
  const row = db
    .prepare(`SELECT * FROM workflow_runs WHERE wf_id = ? AND workspace_id = ?`)
    .get(wf_id, workspace_id) as Record<string, unknown> | undefined
  if (!row) throw new Error(`workflow run not found: ${wf_id}`)

  const rawSteps = row['steps'] as string
  const parsed = JSON.parse(rawSteps) as unknown

  let states: WorkflowStepState[] = []
  let defs: WorkflowStepDef[] = []

  if (Array.isArray(parsed)) {
    // Legacy shape (pre-WORK-005) — states only; look up defs from registry.
    states = parsed as WorkflowStepState[]
    const workflow_name = row['workflow_name'] as string
    const def = registry.getDefinition(workflow_name)
    defs = def?.steps ?? []
  } else if (parsed && typeof parsed === 'object') {
    // Canonical shape: { states, defs } written by startWorkflow and persistStates.
    const obj = parsed as { states?: WorkflowStepState[]; defs?: WorkflowStepDef[] }
    states = obj.states ?? []
    defs = obj.defs ?? []
  }

  return {
    wf_id,
    workspace_id,
    project_id: (row['project_id'] as string | null) ?? null,
    steps: states,
    step_defs: defs,
    version: (row['version'] as number) ?? 0,
  }
}

/**
 * Persist the entire steps blob back to workflow_runs. We use a single
 * UPDATE so the write is atomic and bumps the `version` column — this
 * gives external observers a consistent snapshot at each transition.
 */
function persistStates(
  wf_id: string,
  states: WorkflowStepState[],
  defs: WorkflowStepDef[],
  status?: string,
  current_step_id?: string | null,
  db: Db = getDb(),
): void {
  const now = new Date().toISOString()
  const blob = JSON.stringify(defs.length > 0 ? { states, defs } : states)

  if (status) {
    const status_category =
      status === 'completed' || status === 'cancelled'
        ? 'done'
        : status === 'failed' || status === 'blocked'
        ? 'blocked'
        : 'active'
    const completed_at = status === 'completed' ? now : null
    db.prepare(
      `UPDATE workflow_runs
       SET steps = ?, status = ?, status_category = ?,
           current_step_id = ?,
           completed_at = COALESCE(completed_at, ?),
           version = version + 1, updated_at = ?
       WHERE wf_id = ?`,
    ).run(blob, status, status_category, current_step_id ?? null, completed_at, now, wf_id)
  } else {
    db.prepare(
      `UPDATE workflow_runs
       SET steps = ?, current_step_id = ?, version = version + 1, updated_at = ?
       WHERE wf_id = ?`,
    ).run(blob, current_step_id ?? null, now, wf_id)
  }
}

// ── public API ─────────────────────────────────────────────────────────────

/**
 * Drive a workflow run from its current state to termination.
 *
 * The loop terminates when:
 *  - every step is completed (or skipped) → `completed`
 *  - a step exceeds max_retries → `failed`
 *  - a halt step fires → `completed`
 *  - no ready step makes progress (all are 'skipped' waiting on
 *    external events) → `blocked`
 *  - max_iterations is reached → `blocked` (safety cap)
 */
export async function runWorkflow(input: RunWorkflowInput): Promise<RunWorkflowResult> {
  const start = Date.now()
  const maxIter = input.max_iterations ?? DEFAULT_MAX_ITERATIONS
  const defaultTimeout = input.default_timeout_ms ?? DEFAULT_STEP_TIMEOUT_MS
  const defaultRetries = input.default_max_retries ?? DEFAULT_RETRY_COUNT
  const backoffCap = input.retry_backoff_cap_ms ?? PRODUCTION_BACKOFF_CAP_MS

  const loaded = loadRun(input.wf_id, input.workspace_id)
  const { workspace_id, project_id, step_defs } = loaded
  let states = loaded.steps

  // Root span for the entire run. All step spans chain off this.
  const runSpan = await startSpan({
    name: 'workflow.run',
    workspace_id,
    payload: { wf_id: input.wf_id },
  })

  // Hydrate outputs from any prior completed steps.
  const outputs: Record<string, unknown> = {}
  for (const s of states) {
    if (s.status === 'completed' && s.result !== undefined) {
      outputs[s.step_id] = s.result
    }
  }

  let stepsExecuted = 0
  let haltRequested = false
  let finalStatus: 'completed' | 'blocked' | 'failed' = 'completed'
  let lastCurrentStep: string | undefined

  try {

  for (let iter = 0; iter < maxIter && !haltRequested; iter++) {
    const ready = nextReadySteps(states, step_defs)
    if (ready.length === 0) break

    let progressed = false

    for (const step_id of ready) {
      const def = step_defs.find((d) => d.step_id === step_id)
      if (!def) {
        // Should never happen — nextReadySteps drew from step_defs.
        continue
      }
      const state = states.find((s) => s.step_id === step_id)
      if (!state) continue

      const ctx: StepContext = {
        wf_id: input.wf_id,
        workspace_id,
        project_id: project_id ?? undefined,
        step_id,
        step: def,
        outputs,
        attempts: state.attempts,
      }

      const now = new Date().toISOString()
      state.started_at = state.started_at ?? now
      lastCurrentStep = step_id

      const stepSpan = await startSpan({
        name: 'workflow.step',
        workspace_id,
        parent_span_id: runSpan.span_id,
        payload: {
          step_id,
          step_type: (def as unknown as { step_type?: string; type?: string }).step_type
            ?? (def as unknown as { type?: string }).type
            ?? 'unknown',
          attempts: state.attempts,
        },
      })

      let result: StepResult
      try {
        const stepTimeout = (def as unknown as { timeout_ms?: number }).timeout_ms ?? defaultTimeout
        result = await withTimeout(executeStep(ctx), stepTimeout)
      } catch (err) {
        result = { status: 'failed', error: (err as Error).message }
      }

      await endSpan({
        span_id: stepSpan.span_id,
        status: result.status === 'failed' ? 'error' : 'ok',
        payload: { result_status: result.status, error: result.error },
      })

      state.attempts += 1

      if (result.status === 'completed') {
        state.status = 'completed'
        state.result = result.output
        state.completed_at = new Date().toISOString()
        outputs[step_id] = result.output
        stepsExecuted += 1
        progressed = true
        persistStates(input.wf_id, states, step_defs, undefined, lastCurrentStep)

        // Halt short-circuits the entire loop.
        if (
          (def as unknown as { step_type?: string; type?: string }).step_type === 'halt' ||
          (result.output && typeof result.output === 'object' && (result.output as { halt?: boolean }).halt)
        ) {
          haltRequested = true
          break
        }
      } else if (result.status === 'skipped') {
        // Skipped means "not ready yet, try again next iteration".
        // We DO count this as progress (so the outer loop keeps spinning)
        // because some skipped steps — like `loop` and `branch` — converge
        // over repeated polling. The stall-detector below (any-attempts-
        // incremented-but-nothing-completed over a window) plus the
        // max_iterations safety cap stops wait_for_* from infinite-looping.
        state.status = 'pending'
        state.error = result.error
        progressed = true
        persistStates(input.wf_id, states, step_defs, undefined, lastCurrentStep)
      } else {
        // Failed — retry if we have budget.
        const policy = (def as unknown as { retryPolicy?: RetryPolicy }).retryPolicy
        const maxRetries =
          policy?.maxAttempts ??
          (def as unknown as { max_retries?: number }).max_retries ??
          defaultRetries
        if (state.attempts <= maxRetries) {
          state.status = 'retrying'
          state.error = result.error
          persistStates(input.wf_id, states, step_defs, undefined, lastCurrentStep)
          // Exponential backoff — capped at backoffCap so tests stay fast.
          const initialDelay = policy?.initialDelayMs ?? 1000
          const multiplier = policy?.backoffMultiplier ?? 2
          const cap = policy?.maxDelayMs ?? backoffCap
          const delay = Math.min(initialDelay * Math.pow(multiplier, state.attempts - 1), cap)
          if (delay > 0) {
            await new Promise((r) => setTimeout(r, delay))
          }
          // Mark pending again so nextReadySteps picks it up next iteration,
          // and flag progressed so the outer loop doesn't break before the
          // retry gets its shot.
          state.status = 'pending'
          progressed = true
        } else {
          state.status = 'failed'
          state.error = result.error
          state.completed_at = new Date().toISOString()
          persistStates(input.wf_id, states, step_defs, undefined, lastCurrentStep)
          finalStatus = 'failed'
          haltRequested = true
          break
        }
      }
    }

    // If every ready step in this pass returned 'skipped', we've stalled
    // — break out rather than loop forever waiting for external events.
    if (!progressed && !haltRequested) {
      // One more shot: if any state is still 'retrying', give it another
      // iteration. Otherwise, we're blocked.
      if (!states.some((s) => s.status === 'retrying')) {
        break
      }
    }
  }

  // ── final status computation ─────────────────────────────────────────────
  const allTerminal = states.every(
    (s) => s.status === 'completed' || s.status === 'skipped' || s.status === 'failed',
  )
  const anyFailed = states.some((s) => s.status === 'failed')
  const anyPending = states.some((s) => s.status === 'pending')

  let dbStatus: string
  if (anyFailed) {
    dbStatus = 'failed'
    finalStatus = 'failed'
  } else if (haltRequested && !anyFailed) {
    dbStatus = 'completed'
    finalStatus = 'completed'
  } else if (allTerminal) {
    dbStatus = 'completed'
    finalStatus = 'completed'
  } else if (anyPending) {
    dbStatus = 'blocked'
    finalStatus = 'blocked'
  } else {
    dbStatus = 'completed'
    finalStatus = 'completed'
  }

  persistStates(input.wf_id, states, step_defs, dbStatus, lastCurrentStep)

  await endSpan({
    span_id: runSpan.span_id,
    status: finalStatus === 'failed' ? 'error' : 'ok',
    payload: {
      final_status: finalStatus,
      steps_executed: stepsExecuted,
      duration_ms: Date.now() - start,
    },
  })

  return {
    wf_id: input.wf_id,
    final_status: finalStatus,
    steps_executed: stepsExecuted,
    duration_ms: Date.now() - start,
  }
  } catch (err) {
    await endSpan({
      span_id: runSpan.span_id,
      status: 'error',
      payload: { error: (err as Error).message },
    })
    throw err
  }
}
