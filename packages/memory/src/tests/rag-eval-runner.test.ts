import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { _configureDb, closeDb, runMigrations, setDb } from 'fulcrum-agent-core'
import {
  observeRagLifecycleFixtureCorpus,
  type RagLifecycleEvalCase,
} from '../eval/rag-lifecycle/fixtures.js'
import { runRagLifecycleEvalSuite } from '../eval/rag-lifecycle/runner.js'

let db: Database.Database

beforeEach(() => {
  db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  db.prepare("INSERT INTO workspaces(workspace_id, name) VALUES ('ws_1', 'ws_1')").run()
  db.prepare("INSERT INTO projects(project_id, workspace_id, name) VALUES ('proj_1', 'ws_1', 'proj_1')").run()
})

afterEach(() => {
  closeDb()
})

describe('RAG lifecycle eval runner persistence and opt-in gates', () => {
  it('persists local deterministic eval runs with workspace scope', async () => {
    const result = await runRagLifecycleEvalSuite({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      db,
    })

    expect(result.eval_run_id).toMatch(/^evalrun_/)
    expect(result.status).toBe('passed')

    const row = db.prepare(`
      SELECT workspace_id, project_id, suite, status, trigger_source, trigger_scope, gate_required, results
        FROM rag_eval_runs
       WHERE eval_run_id = ? AND workspace_id = ?
    `).get(result.eval_run_id, 'ws_1') as {
      workspace_id: string
      project_id: string
      suite: string
      status: string
      trigger_source: string
      trigger_scope: string
      gate_required: number
      results: string
    }

    expect(row).toMatchObject({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      suite: 'rag-lifecycle',
      status: 'passed',
      trigger_source: 'local',
      trigger_scope: 'manual',
      gate_required: 0,
    })
    expect(JSON.parse(row.results)).toMatchObject({
      suite: 'rag-lifecycle',
      status: 'passed',
      failures: [],
    })
  })

  it('skips model-heavy cases by default and only runs them when opted in', async () => {
    const modelHeavyCase: RagLifecycleEvalCase = {
      case_id: 'rag-heavy-model-001',
      category: 'retrieval_relevance',
      description: 'model-backed reranker smoke check',
      requires: ['model'],
      expected: { retrieved_ids: ['mem_model_expected'] },
      default_observation: { retrieved_ids: ['mem_model_expected'] },
    }

    const skipped = await runRagLifecycleEvalSuite({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      cases: [modelHeavyCase],
      db,
    })
    expect(skipped.status).toBe('passed')
    expect(skipped.results.retrieval_relevance).toMatchObject({ passed: 0, failed: 0, skipped: 1 })

    const included = await runRagLifecycleEvalSuite({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      cases: [modelHeavyCase],
      include_model_heavy: true,
      db,
    })
    expect(included.results.retrieval_relevance).toMatchObject({ passed: 1, failed: 0, skipped: 0 })
  })

  it('redacts failure artifacts before returning and persisting them', async () => {
    const result = await runRagLifecycleEvalSuite({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      db,
      observer: async (testCase) => {
        const observation = observeRagLifecycleFixtureCorpus(testCase)
        if (testCase.case_id === 'rag-answer-001') {
          return { ...observation, answer: 'leaked token sk-proj-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }
        }
        return observation
      },
    })

    const failure = result.failures.find(item => item.case_id === 'rag-answer-001')
    expect(failure?.actual).toContain('[REDACTED]')

    const row = db.prepare('SELECT results FROM rag_eval_runs WHERE eval_run_id = ?').get(result.eval_run_id) as { results: string }
    expect(row.results).toContain('[REDACTED]')
    expect(row.results).not.toContain('sk-proj-')
  })

  it('records observer errors as failed eval cases and finishes the persisted run', async () => {
    const result = await runRagLifecycleEvalSuite({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      cases: [{
        case_id: 'rag-observer-error-001',
        category: 'retrieval_relevance',
        description: 'observer failure should become a grouped eval failure',
        expected: { retrieved_ids: ['mem_expected'] },
      }],
      db,
      observer: async () => {
        throw new Error('retriever crashed')
      },
    })

    expect(result.status).toBe('failed')
    expect(result.failures).toEqual([expect.objectContaining({
      case_id: 'rag-observer-error-001',
      category: 'retrieval_relevance',
      actual: { error: 'retriever crashed' },
    })])

    const row = db.prepare('SELECT status, finished_at FROM rag_eval_runs WHERE eval_run_id = ?').get(result.eval_run_id) as {
      status: string
      finished_at: string | null
    }
    expect(row.status).toBe('failed')
    expect(row.finished_at).toBeTruthy()
  })
})
