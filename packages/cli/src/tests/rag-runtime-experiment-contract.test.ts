import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { _configureDb, closeDb, getDb, runMigrations, setDb } from 'fulcrum-agent-core'
import { createRuntimeExperiment } from 'fulcrum-memory'
import { TOOL_SCHEMA_MAP } from '../mcp-tools.js'
import { TOOL_REGISTRY } from '../tool-registry.js'
import {
  getRuntimeExperimentReportCommand,
  listRuntimeExperimentsCommand,
} from '../commands/memory-runtime-experiments.js'

beforeEach(() => {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  db.prepare("INSERT INTO workspaces(workspace_id, name) VALUES ('ws_1', 'ws_1')").run()
  db.prepare("INSERT INTO projects(project_id, workspace_id, name) VALUES ('proj_1', 'ws_1', 'proj_1')").run()
  db.prepare("INSERT INTO workspaces(workspace_id, name) VALUES ('ws_2', 'ws_2')").run()
  db.prepare("INSERT INTO projects(project_id, workspace_id, name) VALUES ('proj_2', 'ws_2', 'proj_2')").run()
})

afterEach(() => {
  closeDb()
})

describe('runtime experiment CLI contract', () => {
  it('exposes runtime experiment MCP tools with read/write semantics matching behavior', () => {
    expect(TOOL_SCHEMA_MAP.get('list_runtime_experiments')?.annotations?.readOnlyHint).toBe(true)
    expect(TOOL_SCHEMA_MAP.get('get_runtime_experiment_report')?.annotations?.readOnlyHint).toBe(true)
    expect(TOOL_SCHEMA_MAP.get('adopt_runtime_experiment')?.annotations?.readOnlyHint).not.toBe(true)
    expect(TOOL_REGISTRY.get('list_runtime_experiments')?.capabilities.readOnly).toBe(true)
    expect(TOOL_REGISTRY.get('adopt_runtime_experiment')?.capabilities.readOnly).toBe(false)
  })

  it('lists optional runtime experiments with stable scoped JSON and redacted fields', () => {
    const visible = createRuntimeExperiment({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      status: 'planned',
      experiment_type: 'vector_store',
      baseline_eval_run_id: 'evalrun_baseline',
      candidate_adapter: '/home/alice/private/vector-adapter',
      comparison: { candidate_config: { token: 'sk-proj-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' } },
    }, getDb())
    createRuntimeExperiment({
      workspace_id: 'ws_2',
      project_id: 'proj_2',
      status: 'planned',
      experiment_type: 'vector_store',
      candidate_adapter: 'other-scope',
    }, getDb())

    const result = listRuntimeExperimentsCommand({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
    }, getDb())

    expect(result.experiments).toHaveLength(1)
    expect(result.experiments[0]).toMatchObject({
      runtime_experiment_id: visible.runtime_experiment_id,
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      status: 'planned',
      experiment_type: 'vector_store',
    })
    const json = JSON.stringify(result)
    expect(json).not.toContain('/home/alice')
    expect(json).not.toContain('sk-proj-')
  })

  it('reports disabled optional runtime experiments as out_of_scope instead of failing baseline CLI', () => {
    const experiment = createRuntimeExperiment({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      experiment_type: 'model_runtime',
      candidate_adapter: 'unconfigured-model',
      risk_notes: ['optional candidate unavailable; keep local baseline'],
    }, getDb())

    const report = getRuntimeExperimentReportCommand({
      runtime_experiment_id: experiment.runtime_experiment_id,
      workspace_id: 'ws_1',
      project_id: 'proj_1',
    }, getDb())

    expect(report).toMatchObject({
      runtime_experiment_id: experiment.runtime_experiment_id,
      status: 'disabled',
      lane_contract: expect.objectContaining({
        contract_version: 'unregistered',
        status: 'unregistered',
      }),
      availability: {
        status: 'disabled',
        scope: 'out_of_scope',
        local_baseline_impact: 'none',
      },
      next_actions: expect.arrayContaining([
        expect.objectContaining({ command: expect.stringContaining('fulcrum memory runtime-experiments list --json') }),
      ]),
    })
  })

  it('requires workspace/project scope for report lookup', () => {
    const experiment = createRuntimeExperiment({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      status: 'planned',
      experiment_type: 'code_indexer',
      candidate_adapter: 'candidate-indexer',
    }, getDb())

    expect(() => getRuntimeExperimentReportCommand({
      runtime_experiment_id: experiment.runtime_experiment_id,
      workspace_id: 'ws_2',
      project_id: 'proj_2',
    }, getDb())).toThrow(/runtime experiment not found/)
  })
})
