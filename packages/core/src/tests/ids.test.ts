import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'
import { newId, nextDisplayId, projectIdsFromPath } from '../ids.js'

beforeEach(() => {
  const db = createTestDb()
  // display_id_sequences is added in MIGRATION_002 (Task 5)
  // Create it here for Task 2 isolation
  db.exec(`
    CREATE TABLE IF NOT EXISTS display_id_sequences (
      entity_type TEXT NOT NULL,
      project_id TEXT NOT NULL,
      last_value INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (entity_type, project_id)
    )
  `)
})
afterEach(() => resetTestDb())

function seed() {
  const db = getDb()
  db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_1','test ws')").run()
  db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_1','ws_1','test proj')").run()
}

describe('newId', () => {
  it('generates a plain ULID for unknown entity type', () => {
    const id = newId('unknown')
    expect(id).toMatch(/^[0-9A-Z]{26}$/)
  })

  it('prefixes task IDs with task_', () => {
    const id = newId('task')
    expect(id).toMatch(/^task_[0-9A-Z]{26}$/)
  })

  it('prefixes run IDs with run_', () => {
    const id = newId('run')
    expect(id).toMatch(/^run_[0-9A-Z]{26}$/)
  })

  it('prefixes workspace IDs with ws_', () => {
    const id = newId('workspace')
    expect(id).toMatch(/^ws_[0-9A-Z]{26}$/)
  })

  it('prefixes project IDs with proj_', () => {
    const id = newId('project')
    expect(id).toMatch(/^proj_[0-9A-Z]{26}$/)
  })

  it('prefixes memory IDs with mem_', () => {
    const id = newId('memory')
    expect(id).toMatch(/^mem_[0-9A-Z]{26}$/)
  })

  it('prefixes event IDs with evt_', () => {
    const id = newId('event')
    expect(id).toMatch(/^evt_[0-9A-Z]{26}$/)
  })

  it('generates unique IDs on each call', () => {
    const ids = Array.from({ length: 100 }, () => newId('task'))
    const unique = new Set(ids)
    expect(unique.size).toBe(100)
  })
})

describe('nextDisplayId', () => {
  it('returns TASK-1 for first task in a project', () => {
    seed()
    const db = getDb()
    const id = nextDisplayId('task', 'proj_1', db)
    expect(id).toBe('TASK-1')
  })

  it('auto-increments per project', () => {
    seed()
    const db = getDb()
    const id1 = nextDisplayId('task', 'proj_1', db)
    const id2 = nextDisplayId('task', 'proj_1', db)
    const id3 = nextDisplayId('task', 'proj_1', db)
    expect(id1).toBe('TASK-1')
    expect(id2).toBe('TASK-2')
    expect(id3).toBe('TASK-3')
  })

  it('sequences are independent per project', () => {
    seed()
    const db = getDb()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_2','ws_1','p2')").run()
    expect(nextDisplayId('task', 'proj_1', db)).toBe('TASK-1')
    expect(nextDisplayId('task', 'proj_2', db)).toBe('TASK-1')
    expect(nextDisplayId('task', 'proj_1', db)).toBe('TASK-2')
    expect(nextDisplayId('task', 'proj_2', db)).toBe('TASK-2')
  })

  it('sequences are independent per entity_type', () => {
    seed()
    const db = getDb()
    expect(nextDisplayId('task', 'proj_1', db)).toBe('TASK-1')
    expect(nextDisplayId('run', 'proj_1', db)).toBe('RUN-1')
    expect(nextDisplayId('task', 'proj_1', db)).toBe('TASK-2')
    expect(nextDisplayId('run', 'proj_1', db)).toBe('RUN-2')
  })

  it('throws for entity types with no display prefix', () => {
    seed()
    const db = getDb()
    expect(() => nextDisplayId('workspace', 'proj_1', db)).toThrow('No display prefix')
  })
})

describe('projectIdsFromPath', () => {
  it('returns ws_ and proj_ prefixed IDs', () => {
    const { workspace_id, project_id } = projectIdsFromPath('/home/user/myproject')
    expect(workspace_id).toMatch(/^ws_myproject_[a-f0-9]{12}$/)
    expect(project_id).toMatch(/^proj_myproject_[a-f0-9]{12}$/)
  })

  it('is deterministic — same path produces same IDs', () => {
    const a = projectIdsFromPath('/home/user/myproject')
    const b = projectIdsFromPath('/home/user/myproject')
    expect(a.workspace_id).toBe(b.workspace_id)
    expect(a.project_id).toBe(b.project_id)
  })

  it('produces different IDs for different paths', () => {
    const a = projectIdsFromPath('/home/user/project-a')
    const b = projectIdsFromPath('/home/user/project-b')
    expect(a.workspace_id).not.toBe(b.workspace_id)
    expect(a.project_id).not.toBe(b.project_id)
  })

  it('sanitizes special characters in dirname', () => {
    const { workspace_id } = projectIdsFromPath('/home/user/my-cool.project!')
    expect(workspace_id).toMatch(/^ws_my-cool_project__[a-f0-9]{12}$/)
  })

  it('uses process.cwd() when no path provided', () => {
    const { workspace_id } = projectIdsFromPath()
    expect(workspace_id).toMatch(/^ws_/)
  })
})

describe('newId prefixes (G-15)', () => {
  const cases: Array<[string, string]> = [
    ['subtask', 'subtask_'],
    ['cycle', 'cycle_'],
    ['milestone', 'mile_'],
    ['comment', 'cmt_'],
    ['status_event', 'sev_'],
    ['lock', 'lock_'],
    ['span', 'span_'],
    ['policy_event', 'pevt_'],
    ['team_instance', 'ti_'],
    ['agent_profile', 'ap_'],
    ['rag_rebuild_report', 'report_'],
    ['rag_rebuild_candidate', 'candidate_'],
    ['rag_rebuild_snapshot', 'snapshot_'],
    ['profile_backup', 'backup_'],
    ['embedding_job', 'job_'],
    ['embedding_job_item', 'jobitem_'],
    ['rag_job_event', 'ragevt_'],
    ['vector_metadata', 'vecmeta_'],
    ['rag_health_report', 'health_'],
    ['rag_eval_run', 'evalrun_'],
  ]
  for (const [kind, prefix] of cases) {
    it(`${kind} → ${prefix}...`, () => {
      const id = newId(kind)
      expect(id.startsWith(prefix)).toBe(true)
      expect(id.length).toBeGreaterThan(prefix.length)
    })
  }
})
