import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { _configureDb, closeDb, getDb, runMigrations, setDb } from 'fulcrum-agent-core'
import { executeRagRebuildCommand, getRagRebuildReport } from '../commands/memory-rag-lifecycle.js'

beforeEach(() => {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  db.prepare("INSERT INTO workspaces(workspace_id, name) VALUES ('ws_1', 'ws_1')").run()
  db.prepare("INSERT INTO projects(project_id, workspace_id, name) VALUES ('proj_1', 'ws_1', 'proj_1')").run()
})

afterEach(() => {
  closeDb()
})

describe('RAG rebuild JSON contract', () => {
  it('returns stable plan response fields', async () => {
    const result = await executeRagRebuildCommand({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      mode: 'plan',
      domains: ['code'],
      allow_empty: true,
    }, getDb())

    expect(result).toMatchObject({
      status: 'completed',
      mode: 'plan',
      scope: { workspace_id: 'ws_1', project_id: 'proj_1', domains: ['code'] },
      candidate: null,
      parity: [],
      warnings: [],
      errors: [],
      artifact_path: null,
    })
    expect(result.report_id).toMatch(/^report_/)
    expect(result.counts).toHaveProperty('code_files')
  })

  it('persists execute reports and reads them with workspace scope', async () => {
    const result = await executeRagRebuildCommand({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      mode: 'execute',
      runtime_profile: 'dev',
      domains: ['code'],
      allow_empty: true,
    }, getDb())

    expect(result.report_id).toMatch(/^report_/)
    expect(result.candidate?.candidate_id).toMatch(/^candidate_/)

    const report = getRagRebuildReport({ report_id: result.report_id, workspace_id: 'ws_1' }, getDb())
    expect(report.report_id).toBe(result.report_id)
    expect(report.scope.workspace_id).toBe('ws_1')
  })
})
