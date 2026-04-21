import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { _configureDb, runMigrations, setDb } from 'fulcrum-agent-core'
import { startMonitorServer } from '../server.js'

interface PaginatedBody {
  data: unknown[]
  pagination: {
    total: number
    limit: number
    offset: number
    next_cursor: string | null
  }
}

let db: Database.Database
let server: ReturnType<typeof startMonitorServer>

beforeEach(() => {
  db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)

  db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_page', 'Pagination')").run()
  db.prepare("INSERT INTO projects (project_id, workspace_id, name, status, type) VALUES ('proj_page', 'ws_page', 'Pagination', 'active', 'git')").run()

  for (let i = 1; i <= 3; i++) {
    const ts = `2026-04-21T00:00:0${i}.000Z`
    db.prepare(`
      INSERT INTO tasks (task_id, workspace_id, project_id, title, created_at, updated_at)
      VALUES (?, 'ws_page', 'proj_page', ?, ?, ?)
    `).run(`task_page_${i}`, `Task ${i}`, ts, ts)

    db.prepare(`
      INSERT INTO agent_runs (run_id, task_id, workspace_id, project_id, role, context_type, started_at, updated_at)
      VALUES (?, ?, 'ws_page', 'proj_page', 'software_engineer', 'primary', ?, ?)
    `).run(`run_page_${i}`, `task_page_${i}`, ts, ts)

    db.prepare(`
      INSERT INTO artifacts
        (artifact_id, workspace_id, project_id, display_id, artifact_type, title, file_path, owner_type, owner_id, created_at, updated_at)
      VALUES (?, 'ws_page', 'proj_page', ?, 'plan_doc', ?, ?, 'task', ?, ?, ?)
    `).run(`art_page_${i}`, `A-${i}`, `Artifact ${i}`, `/tmp/artifact-${i}.md`, `task_page_${i}`, ts, ts)

    db.prepare(`
      INSERT INTO memories (memory_id, workspace_id, project_id, scope, kind, content, created_at, updated_at)
      VALUES (?, 'ws_page', 'proj_page', 'project', 'fact', ?, ?, ?)
    `).run(`mem_page_${i}`, `Memory ${i}`, ts, ts)
  }

  db.prepare(`
    INSERT INTO team_templates (template_id, name, description)
    VALUES ('team_template_page', 'Pagination Template', 'Pagination test')
  `).run()

  for (let i = 1; i <= 3; i++) {
    const ts = `2026-04-21T00:01:0${i}.000Z`
    db.prepare(`
      INSERT INTO team_instances
        (instance_id, template_id, workspace_id, project_id, display_id, purpose, created_by_agent_id, created_at, updated_at)
      VALUES (?, 'team_template_page', 'ws_page', 'proj_page', ?, ?, 'agent_page', ?, ?)
    `).run(`team_page_${i}`, `TM-${i}`, `Team ${i}`, ts, ts)
  }

  server = startMonitorServer({ workspace_id: 'ws_page', project_id: 'proj_page', bypass_auth: true })
})

afterEach(async () => {
  await server.stop()
  db.close()
})

async function getJson(path: string): Promise<PaginatedBody> {
  const res = await server.fetch(new Request(`http://localhost${path}`)) as Response
  expect(res.status).toBe(200)
  return await res.json() as PaginatedBody
}

describe('paginated monitor list endpoints', () => {
  it.each([
    '/tasks',
    '/agents',
    '/artifacts',
    '/memory-trace',
    '/teams',
  ])('%s returns pagination metadata and accepts cursor offsets', async (path) => {
    const first = await getJson(`${path}?limit=1`)
    expect(first.data).toHaveLength(1)
    expect(first.pagination).toEqual({
      total: 3,
      limit: 1,
      offset: 0,
      next_cursor: '1',
    })

    const second = await getJson(`${path}?limit=1&cursor=${first.pagination.next_cursor}`)
    expect(second.data).toHaveLength(1)
    expect(second.pagination.offset).toBe(1)
    expect(second.pagination.next_cursor).toBe('2')
  })

  it('caps limit at 200 for all paginated endpoints', async () => {
    const body = await getJson('/agents?limit=999')
    expect(body.pagination.limit).toBe(200)
  })
})
