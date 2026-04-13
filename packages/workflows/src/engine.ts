// packages/workflows/src/engine.ts
import type { WorkflowStepDef, WorkflowStepState } from './types.js'

/**
 * Returns the step_ids that are ready to run:
 * - step itself is 'pending'
 * - all depends_on steps are 'completed'
 */
export function nextReadySteps(
  states: WorkflowStepState[],
  defs: WorkflowStepDef[]
): string[] {
  const stateMap = new Map<string, WorkflowStepState>()
  for (const s of states) {
    stateMap.set(s.step_id, s)
  }

  const ready: string[] = []
  for (const def of defs) {
    const state = stateMap.get(def.step_id)
    if (!state || state.status !== 'pending') continue

    const deps = def.depends_on ?? []
    const allDepsComplete = deps.every(depId => {
      const depState = stateMap.get(depId)
      return depState?.status === 'completed'
    })

    if (allDepsComplete) {
      ready.push(def.step_id)
    }
  }

  return ready
}

/**
 * Computes the top-level workflow status_category from step states.
 * - Any step 'failed' → 'blocked'
 * - All steps 'completed' or 'skipped' → 'done'
 * - Otherwise → 'active'
 */
export function computeStatusCategory(
  states: WorkflowStepState[]
): 'active' | 'blocked' | 'done' {
  if (states.some(s => s.status === 'failed')) return 'blocked'
  if (states.every(s => s.status === 'completed' || s.status === 'skipped')) return 'done'
  return 'active'
}

/**
 * Initialises all steps as pending WorkflowStepState records.
 */
export function initStepStates(defs: WorkflowStepDef[]): WorkflowStepState[] {
  return defs.map(def => ({
    step_id: def.step_id,
    status: 'pending',
    attempts: 0,
  }))
}
