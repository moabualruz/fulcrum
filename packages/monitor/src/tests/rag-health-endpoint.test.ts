import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { _configureDb, closeDb, runMigrations, setDb } from 'fulcrum-agent-core'
import { runMigration101MemoryV3Lifecycle } from 'fulcrum-memory'
import { startMonitorServer } from '../server.js'

let db: Database.Database
let server: ReturnType<typeof startMonitorServer>

beforeEach(() => {
  db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  runMigration101MemoryV3Lifecycle(db)
  setDb(db)
  db.prepare("INSERT INTO workspaces(workspace_id, name) VALUES ('ws_1', 'ws_1')").run()
  db.prepare("INSERT INTO projects(project_id, workspace_id, name) VALUES ('proj_1', 'ws_1', 'proj_1')").run()
  server = startMonitorServer({ workspace_id: 'ws_1', project_id: 'proj_1', bypass_auth: true })
})

afterEach(async () => {
  await server.stop()
  closeDb()
})

describe('GET /rag/health', () => {
  function totalChanges(): number {
    return (db.prepare('SELECT total_changes() AS n').get() as { n: number }).n
  }

  it('returns RAG health for the configured workspace and project', async () => {
    const res = await server.fetch(new Request('http://localhost/rag/health')) as Response

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body).toMatchObject({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      status: 'healthy',
    })
    expect(body['domains']).toHaveProperty('l0')
    expect(body['domains']).toHaveProperty('vectors')
  })

  it('does not persist health reports from the monitor endpoint', async () => {
    const before = db.prepare('SELECT COUNT(*) AS n FROM rag_health_reports').get() as { n: number }
    const beforeChanges = totalChanges()

    const res = await server.fetch(new Request('http://localhost/rag/health')) as Response

    expect(res.status).toBe(200)
    const after = db.prepare('SELECT COUNT(*) AS n FROM rag_health_reports').get() as { n: number }
    expect(after.n).toBe(before.n)
    expect(totalChanges()).toBe(beforeChanges)
  })

  it('requires project scope when no server default is configured', async () => {
    await server.stop()
    server = startMonitorServer({ workspace_id: 'ws_1', bypass_auth: true })

    const res = await server.fetch(new Request('http://localhost/rag/health')) as Response

    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/project_id/)
  })
})
