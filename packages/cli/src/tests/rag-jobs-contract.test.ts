import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { _configureDb, closeDb, getDb, runMigrations, setDb } from 'fulcrum-agent-core'
import {
  authorizeEmbeddingJobOperation,
  cancelEmbeddingJobCommand,
  getEmbeddingJobLogsCommand,
  getEmbeddingJobStatusCommand,
  resumeEmbeddingJobCommand,
  retryFailedEmbeddingJobCommand,
  startEmbeddingJobCommand,
} from '../commands/memory-embedding-jobs.js'

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

describe('embedding jobs CLI contract', () => {
  it('starts, reads, logs, cancels, resumes, and retries jobs with stable JSON shapes', async () => {
    const started = await startEmbeddingJobCommand({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      scope: 'memories',
      allow_empty: true,
      actor: { kind: 'human', role: 'software_engineer', id: 'tester' },
    })

    expect(started).toMatchObject({
      status: 'pending',
      source_domain: 'memories',
      preflight_counts: { scanned: 0, current: 0, stale: 0, pending: 0, failed: 0, skipped: 0 },
      requested: expect.objectContaining({ device: 'auto', dimensions: 1024 }),
    })

    const status = getEmbeddingJobStatusCommand({ workspace_id: 'ws_1', job_id: started.job_id })
    expect(status).toMatchObject({ job_id: started.job_id, status: 'pending', progress: { total: 0 } })

    const cancelled = cancelEmbeddingJobCommand({
      workspace_id: 'ws_1',
      job_id: started.job_id,
      actor: { kind: 'human', role: 'software_engineer', id: 'tester' },
    })
    expect(cancelled.status).toBe('cancelled')

    const resumed = await resumeEmbeddingJobCommand({
      workspace_id: 'ws_1',
      job_id: started.job_id,
      actor: { kind: 'human', role: 'software_engineer', id: 'tester' },
    })
    expect(resumed.status).toBe('completed')

    const retried = await retryFailedEmbeddingJobCommand({
      workspace_id: 'ws_1',
      job_id: started.job_id,
      actor: { kind: 'human', role: 'software_engineer', id: 'tester' },
    })
    expect(retried.status).toBe('completed')

    const logs = getEmbeddingJobLogsCommand({ workspace_id: 'ws_1', job_id: started.job_id })
    expect(logs.events.map(event => event.event_type)).toEqual(expect.arrayContaining(['cancelled', 'resumed', 'retry']))
  })

  it('authorizes expensive operations and writes audit events for denied actors', async () => {
    expect(authorizeEmbeddingJobOperation({ kind: 'agent', role: 'software_engineer', id: 'agent' }).authorized).toBe(true)
    expect(authorizeEmbeddingJobOperation({ kind: 'agent', role: 'code_reviewer', id: 'agent' }).authorized).toBe(false)

    await expect(startEmbeddingJobCommand({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      scope: 'memories',
      actor: { kind: 'agent', role: 'code_reviewer', id: 'run_denied' },
    })).rejects.toThrow(/not authorized/)

    const audit = getDb().prepare(`
      SELECT payload FROM events
       WHERE evt_type = 'rag_maintenance_audit'
       ORDER BY rowid DESC
       LIMIT 1
    `).get() as { payload: string }
    expect(JSON.parse(audit.payload)).toMatchObject({
      operation: 'embed',
      actor_role: 'code_reviewer',
      authorized: false,
    })
  })
})
