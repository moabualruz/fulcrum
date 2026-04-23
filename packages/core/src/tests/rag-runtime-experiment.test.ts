import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb, newId } from '../index.js'
import type { RuntimeExperimentStatus } from '../types.js'

const STATUSES: RuntimeExperimentStatus[] = [
  'disabled',
  'planned',
  'running',
  'completed',
  'failed',
  'adopted',
  'rejected',
  'rolled_back',
]

const EXPERIMENT_TYPES = [
  'vector_store',
  'graph_store',
  'code_indexer',
  'model_runtime',
] as const

function seedWorkspaceAndProject(): void {
  const db = getDb()
  db.prepare("INSERT INTO workspaces(workspace_id, name) VALUES ('ws_1', 'ws_1')").run()
  db.prepare("INSERT INTO projects(project_id, workspace_id, name) VALUES ('proj_1', 'ws_1', 'proj_1')").run()
  db.prepare("INSERT INTO workspaces(workspace_id, name) VALUES ('ws_2', 'ws_2')").run()
  db.prepare("INSERT INTO projects(project_id, workspace_id, name) VALUES ('proj_2', 'ws_2', 'proj_2')").run()
}

beforeEach(() => {
  createTestDb()
  seedWorkspaceAndProject()
})

afterEach(() => {
  resetTestDb()
})

describe('RAG runtime experiment persistence', () => {
  it('persists optional runtime experiment JSON with runtimeexp IDs', () => {
    const runtime_experiment_id = newId('runtime_experiment')
    expect(runtime_experiment_id).toMatch(/^runtimeexp_/)

    getDb().prepare(`
      INSERT INTO runtime_experiments (
        runtime_experiment_id, workspace_id, project_id, status, experiment_type,
        baseline_eval_run_id, candidate_adapter, comparison, adoption_gates,
        rollback_plan, risk_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      runtime_experiment_id,
      'ws_1',
      'proj_1',
      'planned',
      'vector_store',
      'evalrun_baseline',
      'sqlite-vec-candidate',
      JSON.stringify({ baseline_eval_run_id: 'evalrun_baseline', candidate_eval_run_id: 'evalrun_candidate' }),
      JSON.stringify({ quality: { status: 'pending' } }),
      JSON.stringify({ command: 'fulcrum memory runtime-experiments rollback' }),
      JSON.stringify(['operator must keep local baseline available']),
    )

    const row = getDb().prepare(`
      SELECT *
        FROM runtime_experiments
       WHERE runtime_experiment_id = ?
         AND workspace_id = ?
         AND project_id = ?
    `).get(runtime_experiment_id, 'ws_1', 'proj_1') as { comparison: string; adoption_gates: string; risk_notes: string } | undefined

    expect(row).toBeTruthy()
    expect(JSON.parse(row!.comparison)).toMatchObject({ baseline_eval_run_id: 'evalrun_baseline' })
    expect(JSON.parse(row!.adoption_gates)).toMatchObject({ quality: { status: 'pending' } })
    expect(JSON.parse(row!.risk_notes)).toEqual(['operator must keep local baseline available'])
  })

  it('keeps status values constrained to RuntimeExperimentStatus without changing enum CHECKs', () => {
    const db = getDb()
    const runtime_experiment_id = newId('runtime_experiment')
    db.prepare(`
      INSERT INTO runtime_experiments (runtime_experiment_id, workspace_id, project_id, status, experiment_type, candidate_adapter)
      VALUES (?, 'ws_1', 'proj_1', 'disabled', 'model_runtime', 'disabled-by-default')
    `).run(runtime_experiment_id)

    for (const status of STATUSES) {
      db.prepare(`
        UPDATE runtime_experiments
           SET status = ?
         WHERE runtime_experiment_id = ?
           AND workspace_id = 'ws_1'
           AND project_id = 'proj_1'
      `).run(status, runtime_experiment_id)
      const row = db.prepare('SELECT status FROM runtime_experiments WHERE runtime_experiment_id = ?')
        .get(runtime_experiment_id) as { status: RuntimeExperimentStatus }
      expect(row.status).toBe(status)
    }

    expect(() => db.prepare(`
      UPDATE runtime_experiments
         SET status = 'out_of_scope'
       WHERE runtime_experiment_id = ?
         AND workspace_id = 'ws_1'
         AND project_id = 'proj_1'
    `).run(runtime_experiment_id)).toThrow()
  })

  it('keeps experiment types constrained to supported runtime adapter kinds', () => {
    const db = getDb()
    const runtime_experiment_id = newId('runtime_experiment')
    db.prepare(`
      INSERT INTO runtime_experiments (runtime_experiment_id, workspace_id, project_id, status, experiment_type, candidate_adapter)
      VALUES (?, 'ws_1', 'proj_1', 'disabled', 'vector_store', 'candidate-vector')
    `).run(runtime_experiment_id)

    for (const experimentType of EXPERIMENT_TYPES) {
      db.prepare(`
        UPDATE runtime_experiments
           SET experiment_type = ?
         WHERE runtime_experiment_id = ?
           AND workspace_id = 'ws_1'
           AND project_id = 'proj_1'
      `).run(experimentType, runtime_experiment_id)
      const row = db.prepare('SELECT experiment_type FROM runtime_experiments WHERE runtime_experiment_id = ?')
        .get(runtime_experiment_id) as { experiment_type: typeof EXPERIMENT_TYPES[number] }
      expect(row.experiment_type).toBe(experimentType)
    }

    expect(() => db.prepare(`
      UPDATE runtime_experiments
         SET experiment_type = 'remote_store'
       WHERE runtime_experiment_id = ?
         AND workspace_id = 'ws_1'
         AND project_id = 'proj_1'
    `).run(runtime_experiment_id)).toThrow()
  })

  it('requires workspace/project scope for status transitions', () => {
    const db = getDb()
    const runtime_experiment_id = newId('runtime_experiment')
    db.prepare(`
      INSERT INTO runtime_experiments (runtime_experiment_id, workspace_id, project_id, status, experiment_type, candidate_adapter)
      VALUES (?, 'ws_1', 'proj_1', 'planned', 'graph_store', 'candidate-graph')
    `).run(runtime_experiment_id)

    const wrongScope = db.prepare(`
      UPDATE runtime_experiments
         SET status = 'adopted'
       WHERE runtime_experiment_id = ?
         AND workspace_id = 'ws_2'
         AND project_id = 'proj_2'
    `).run(runtime_experiment_id)

    expect(wrongScope.changes).toBe(0)
    const row = db.prepare('SELECT status FROM runtime_experiments WHERE runtime_experiment_id = ?')
      .get(runtime_experiment_id) as { status: RuntimeExperimentStatus }
    expect(row.status).toBe('planned')
  })
})
