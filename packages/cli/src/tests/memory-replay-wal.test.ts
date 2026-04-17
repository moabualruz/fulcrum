import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { _configureDb, setDb, closeDb, runMigrations } from 'fulcrum-agent-core'
import { replayWal } from '../commands/memory-replay-wal.js'

function freshDb() {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  return db
}

function seedWorkspaceProject(db: ReturnType<typeof freshDb>) {
  db.prepare(`INSERT OR IGNORE INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_1','w','active','2026-01-01T00:00:00Z')`).run()
  db.prepare(`INSERT OR IGNORE INTO projects (project_id, workspace_id, name, type, status, write_mode, created_at) VALUES ('proj_1','ws_1','p','git','active','worktree','2026-01-01T00:00:00Z')`).run()
}

describe('replayWal', () => {
  let walDir: string
  let db: ReturnType<typeof freshDb>

  beforeEach(() => {
    walDir = join(tmpdir(), `wal-test-${Date.now()}`)
    mkdirSync(walDir, { recursive: true })
    db = freshDb()
    seedWorkspaceProject(db)
  })

  afterEach(() => {
    closeDb()
    rmSync(walDir, { recursive: true, force: true })
  })

  it('replays a WAL record and restores memory row', async () => {
    const memId = 'mem_replay_001'
    const content = 'decision: auth middleware rewired for compliance'
    const contentHash = Buffer.from(content).toString('base64') // simplified hash

    // Write a WAL record
    const walRecord = {
      memory_id: memId,
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      content,
      kind: 'decision',
      scope: 'project',
      content_hash: contentHash,
      written_at: new Date().toISOString(),
    }
    const walPath = join(walDir, `${memId}.jsonl`)
    writeFileSync(walPath, JSON.stringify(walRecord) + '\n')

    const result = await replayWal({ walDir, db })
    expect(result.restored).toBe(1)
    expect(result.skipped).toBe(0)

    // Memory row should be present
    const row = db.prepare('SELECT memory_id, content FROM memories WHERE memory_id = ?').get(memId) as { memory_id: string; content: string } | undefined
    expect(row).toBeDefined()
    expect(row!.memory_id).toBe(memId)
  })

  it('skips already-present rows (idempotent)', async () => {
    const memId = 'mem_existing'
    const content = 'existing memory content'
    const contentHash = Buffer.from(content).toString('base64')

    // Pre-insert the memory row
    db.prepare(`
      INSERT INTO memories (memory_id, workspace_id, project_id, content, kind, scope, normalize_version, created_at, updated_at)
      VALUES (?, 'ws_1', 'proj_1', ?, 'decision', 'project', 1, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
    `).run(memId, content)

    const walRecord = {
      memory_id: memId,
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      content,
      kind: 'decision',
      scope: 'project',
      content_hash: contentHash,
      written_at: new Date().toISOString(),
    }
    writeFileSync(join(walDir, `${memId}.jsonl`), JSON.stringify(walRecord) + '\n')

    const result = await replayWal({ walDir, db })
    expect(result.restored).toBe(0)
    expect(result.skipped).toBe(1)
  })

  it('returns restored=0 when walDir has no .jsonl files', async () => {
    const result = await replayWal({ walDir, db })
    expect(result.restored).toBe(0)
    expect(result.skipped).toBe(0)
  })

  it('returns errors array for malformed WAL lines', async () => {
    writeFileSync(join(walDir, 'bad.jsonl'), 'not valid json\n')
    const result = await replayWal({ walDir, db })
    expect(result.errors.length).toBeGreaterThan(0)
  })
})
