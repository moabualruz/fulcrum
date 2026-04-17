import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { getDb } from '../db/client.js'
import { createTask } from '../tasks.js'
import { startAgentRun, blockAgentRun } from '../runs.js'
import { runJanitorCycle, decayMemories } from '../janitor.js'
import type { PolicyConfig } from '../types.js'

beforeEach(() => { createTestDb() })
afterEach(() => resetTestDb())

const policy: PolicyConfig = {
  wip_limit: 10,
  wip_limit_per_role: {},
  heartbeat_timeout_minutes: 0, // 0 = mark stale immediately in tests
  escalation_timeout_minutes: 0, // 0 = escalate immediately in tests
}

function seed() {
  const db = getDb()
  db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_1','test')").run()
  db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_1','ws_1','test')").run()
}

describe('runJanitorCycle — invalid policy', () => {
  it('throws invalid_input for negative heartbeat_timeout_minutes', async () => {
    seed()
    await expect(
      runJanitorCycle({
        workspace_id: 'ws_1',
        policy: { ...policy, heartbeat_timeout_minutes: -1 },
      })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('throws invalid_input for negative escalation_timeout_minutes', async () => {
    seed()
    await expect(
      runJanitorCycle({
        workspace_id: 'ws_1',
        policy: { ...policy, escalation_timeout_minutes: -1 },
      })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })
})

describe('runJanitorCycle', () => {
  it('marks running runs stale when heartbeat timeout exceeded', async () => {
    seed()
    const t = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T' })
    const run = await startAgentRun({ context_type: 'primary', task_id: t.task_id, workspace_id: 'ws_1', role: 'software_engineer' })

    // Backdating updated_at to simulate timeout
    const db = getDb()
    db.prepare("UPDATE agent_runs SET updated_at = datetime('now', '-60 minutes') WHERE run_id = ?").run(run.run_id)

    await runJanitorCycle({ workspace_id: 'ws_1', policy })

    const updated = db.prepare('SELECT status FROM agent_runs WHERE run_id = ?').get(run.run_id) as { status: string }
    expect(updated.status).toBe('stale')
  })

  it('auto-escalates blocked runs past escalation timeout', async () => {
    seed()
    const t = await createTask({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'T' })
    const run = await startAgentRun({ context_type: 'primary', task_id: t.task_id, workspace_id: 'ws_1', role: 'software_engineer' })
    await blockAgentRun({ run_id: run.run_id, reason: 'stuck' })

    const db = getDb()
    db.prepare("UPDATE agent_runs SET updated_at = datetime('now', '-120 minutes') WHERE run_id = ?").run(run.run_id)

    await runJanitorCycle({ workspace_id: 'ws_1', policy })

    const updated = db.prepare('SELECT status FROM agent_runs WHERE run_id = ?').get(run.run_id) as { status: string }
    expect(updated.status).toBe('aborted')

    // Should have created a CoS task
    const cosTasks = db.prepare("SELECT * FROM tasks WHERE assigned_to = 'chief_of_staff'").all()
    expect(cosTasks.length).toBeGreaterThan(0)
  })
})

describe('decayMemories', () => {
  it('returns 0 when no memories exist', () => {
    const count = decayMemories()
    expect(count).toBe(0)
  })

  it('does not decay recently-accessed memories', () => {
    seed()
    const db = getDb()
    // Insert a low-importance memory accessed today
    db.prepare(`
      INSERT INTO memories (memory_id, workspace_id, project_id, content, importance, last_accessed_at, created_at, updated_at)
      VALUES ('mem_01', 'ws_1', 'proj_1', 'recent content', 0.3, datetime('now'), datetime('now'), datetime('now'))
    `).run()
    const count = decayMemories('ws_1')
    expect(count).toBe(0)
  })

  it('decays low-importance memories not accessed in over 7 days', () => {
    seed()
    const db = getDb()
    db.prepare(`
      INSERT INTO memories (memory_id, workspace_id, project_id, content, importance, last_accessed_at, created_at, updated_at)
      VALUES ('mem_02', 'ws_1', 'proj_1', 'stale content', 0.4, datetime('now', '-30 days'), datetime('now', '-30 days'), datetime('now', '-30 days'))
    `).run()
    const count = decayMemories('ws_1')
    expect(count).toBe(1)
    const row = db.prepare('SELECT importance FROM memories WHERE memory_id = ?').get('mem_02') as { importance: number }
    expect(row.importance).toBeLessThan(0.4)
    expect(row.importance).toBeGreaterThanOrEqual(0.01) // above floor
  })

  it('does not decay memories with importance >= threshold (0.5)', () => {
    seed()
    const db = getDb()
    db.prepare(`
      INSERT INTO memories (memory_id, workspace_id, project_id, content, importance, last_accessed_at, created_at, updated_at)
      VALUES ('mem_03', 'ws_1', 'proj_1', 'important content', 0.8, datetime('now', '-60 days'), datetime('now', '-60 days'), datetime('now', '-60 days'))
    `).run()
    const count = decayMemories('ws_1')
    expect(count).toBe(0)
  })

  it('does not decay below floor (0.01)', () => {
    seed()
    const db = getDb()
    db.prepare(`
      INSERT INTO memories (memory_id, workspace_id, project_id, content, importance, last_accessed_at, created_at, updated_at)
      VALUES ('mem_04', 'ws_1', 'proj_1', 'very old content', 0.02, datetime('now', '-365 days'), datetime('now', '-365 days'), datetime('now', '-365 days'))
    `).run()
    decayMemories('ws_1')
    const row = db.prepare('SELECT importance FROM memories WHERE memory_id = ?').get('mem_04') as { importance: number }
    expect(row.importance).toBeGreaterThanOrEqual(0.01)
  })

  it('respects workspace_id filter', () => {
    const db = getDb()
    db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_1','test1')").run()
    db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_2','test2')").run()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_1','ws_1','p1')").run()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_2','ws_2','p2')").run()
    db.prepare(`
      INSERT INTO memories (memory_id, workspace_id, project_id, content, importance, last_accessed_at, created_at, updated_at)
      VALUES ('mem_05', 'ws_1', 'proj_1', 'ws1 memory', 0.3, datetime('now', '-30 days'), datetime('now', '-30 days'), datetime('now', '-30 days'))
    `).run()
    db.prepare(`
      INSERT INTO memories (memory_id, workspace_id, project_id, content, importance, last_accessed_at, created_at, updated_at)
      VALUES ('mem_06', 'ws_2', 'proj_2', 'ws2 memory', 0.3, datetime('now', '-30 days'), datetime('now', '-30 days'), datetime('now', '-30 days'))
    `).run()
    // Only decay ws_1
    const count = decayMemories('ws_1')
    expect(count).toBe(1)
    const ws2row = db.prepare('SELECT importance FROM memories WHERE memory_id = ?').get('mem_06') as { importance: number }
    expect(ws2row.importance).toBe(0.3) // untouched
  })
})

describe('consolidateMemories', () => {
  // Import at the top level won't work for a describe block — use dynamic
  let consolidateMemories: (workspace_id?: string) => number

  beforeEach(async () => {
    const mod = await import('../janitor.js')
    consolidateMemories = mod.consolidateMemories
  })

  it('returns 0 when fewer than 2 memories with embeddings exist', () => {
    expect(consolidateMemories()).toBe(0)
  })

  it('merges two near-duplicate memories (similarity > 0.92)', () => {
    seed()
    const db = getDb()
    // Craft two nearly identical embeddings (cosine sim ≈ 1.0)
    const dim = 4
    const vec = new Float32Array([1, 0, 0, 0])
    const vecNear = new Float32Array([0.99, 0.1, 0, 0]) // very close
    db.prepare(`
      INSERT INTO memories (memory_id, workspace_id, project_id, content, importance, embedding, last_accessed_at, created_at, updated_at)
      VALUES ('mem_dup1', 'ws_1', 'proj_1', 'content A', 0.8, ?, datetime('now'), datetime('now'), datetime('now'))
    `).run(Buffer.from(vec.buffer))
    db.prepare(`
      INSERT INTO memories (memory_id, workspace_id, project_id, content, importance, embedding, last_accessed_at, created_at, updated_at)
      VALUES ('mem_dup2', 'ws_1', 'proj_1', 'content B', 0.5, ?, datetime('now'), datetime('now'), datetime('now'))
    `).run(Buffer.from(vecNear.buffer))

    const merged = consolidateMemories('ws_1')
    expect(merged).toBe(1)

    // Lower-importance one (mem_dup2) should be deleted
    const remaining = db.prepare('SELECT memory_id FROM memories WHERE workspace_id = ?').all('ws_1') as { memory_id: string }[]
    expect(remaining.map(r => r.memory_id)).toContain('mem_dup1')
    expect(remaining.map(r => r.memory_id)).not.toContain('mem_dup2')
  })

  it('does not merge dissimilar memories (similarity < 0.92)', () => {
    seed()
    const db = getDb()
    const vec1 = new Float32Array([1, 0, 0, 0])
    const vec2 = new Float32Array([0, 1, 0, 0]) // orthogonal → sim = 0
    db.prepare(`
      INSERT INTO memories (memory_id, workspace_id, project_id, content, importance, embedding, last_accessed_at, created_at, updated_at)
      VALUES ('mem_diff1', 'ws_1', 'proj_1', 'content A', 0.8, ?, datetime('now'), datetime('now'), datetime('now'))
    `).run(Buffer.from(vec1.buffer))
    db.prepare(`
      INSERT INTO memories (memory_id, workspace_id, project_id, content, importance, embedding, last_accessed_at, created_at, updated_at)
      VALUES ('mem_diff2', 'ws_1', 'proj_1', 'content B', 0.8, ?, datetime('now'), datetime('now'), datetime('now'))
    `).run(Buffer.from(vec2.buffer))

    const merged = consolidateMemories('ws_1')
    expect(merged).toBe(0)

    const count = db.prepare('SELECT COUNT(*) AS n FROM memories WHERE workspace_id = ?').get('ws_1') as { n: number }
    expect(count.n).toBe(2)
  })

  it('respects workspace_id filter', () => {
    const db = getDb()
    db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_1','test1')").run()
    db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_2','test2')").run()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_1','ws_1','p1')").run()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_2','ws_2','p2')").run()
    const vec = new Float32Array([1, 0, 0, 0])
    db.prepare(`
      INSERT INTO memories (memory_id, workspace_id, project_id, content, importance, embedding, last_accessed_at, created_at, updated_at)
      VALUES ('mem_ws1a', 'ws_1', 'proj_1', 'A', 0.9, ?, datetime('now'), datetime('now'), datetime('now'))
    `).run(Buffer.from(vec.buffer))
    db.prepare(`
      INSERT INTO memories (memory_id, workspace_id, project_id, content, importance, embedding, last_accessed_at, created_at, updated_at)
      VALUES ('mem_ws1b', 'ws_1', 'proj_1', 'B', 0.5, ?, datetime('now'), datetime('now'), datetime('now'))
    `).run(Buffer.from(vec.buffer))
    db.prepare(`
      INSERT INTO memories (memory_id, workspace_id, project_id, content, importance, embedding, last_accessed_at, created_at, updated_at)
      VALUES ('mem_ws2a', 'ws_2', 'proj_2', 'A', 0.9, ?, datetime('now'), datetime('now'), datetime('now'))
    `).run(Buffer.from(vec.buffer))
    db.prepare(`
      INSERT INTO memories (memory_id, workspace_id, project_id, content, importance, embedding, last_accessed_at, created_at, updated_at)
      VALUES ('mem_ws2b', 'ws_2', 'proj_2', 'B', 0.5, ?, datetime('now'), datetime('now'), datetime('now'))
    `).run(Buffer.from(vec.buffer))

    const merged = consolidateMemories('ws_1')
    expect(merged).toBe(1) // only ws_1 affected

    const ws2count = db.prepare('SELECT COUNT(*) AS n FROM memories WHERE workspace_id = ?').get('ws_2') as { n: number }
    expect(ws2count.n).toBe(2) // ws_2 untouched
  })
})
