import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { _configureDb, closeDb, getDb, runMigrations, setDb } from 'fulcrum-agent-core'
import { executeRagRebuildCommand } from '../commands/memory-rag-lifecycle.js'

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

function auditEvents(): Array<{ payload: string; severity: string }> {
  return getDb().prepare("SELECT payload, severity FROM events WHERE evt_type = 'rag_maintenance_audit' ORDER BY ts").all() as Array<{ payload: string; severity: string }>
}

describe('RAG rebuild authorization', () => {
  it('does not emit audit events for read-only plan and dry-run modes', async () => {
    await executeRagRebuildCommand({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      mode: 'plan',
      allow_empty: true,
    })
    await executeRagRebuildCommand({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      mode: 'dry_run',
      allow_empty: true,
    })

    expect(auditEvents()).toEqual([])
  })

  it('denies destructive execute for non-writing reviewer roles and audits denial', async () => {
    await expect(executeRagRebuildCommand({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      mode: 'execute',
      allow_empty: true,
      actor: { kind: 'agent', role: 'code_reviewer', id: 'run_reviewer' },
    })).rejects.toThrow('not authorized')

    const payload = JSON.parse(auditEvents()[0]!.payload) as { authorized: boolean; authorization_reason: string }
    expect(payload.authorized).toBe(false)
    expect(payload.authorization_reason).toBe('actor_lacks_rag_maintenance_capability')
  })

  it('allows human operator execute and writes an authorized audit event', async () => {
    const result = await executeRagRebuildCommand({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      mode: 'execute',
      allow_empty: true,
      actor: { kind: 'human', role: 'software_engineer', id: 'operator' },
    })

    expect(result.status).toBe('completed')
    const payload = JSON.parse(auditEvents().at(-1)!.payload) as { authorized: boolean; authorization_reason: string }
    expect(payload.authorized).toBe(true)
    expect(payload.authorization_reason).toBe('human_operator')
  })
})
