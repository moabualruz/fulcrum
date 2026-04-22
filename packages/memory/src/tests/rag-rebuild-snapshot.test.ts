import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from 'fulcrum-agent-core'
import { captureRebuildInputSnapshot, validateRebuildInputSnapshot } from '../setup/rebuild-snapshot.js'

beforeEach(() => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO memories (
      memory_id, workspace_id, project_id, scope, kind, title, summary, content,
      tags, entities, confidence, importance, freshness, content_hash,
      source, content_type, tier, slug, vault_path, provenance,
      schema_version, created_at, updated_at, last_accessed_at, access_count
    ) VALUES ('mem_snap', 'ws_1', 'proj_1', 'project', 'fact', 'snap', '', 'body',
              '[]', '[]', 0.5, 0.5, 1.0, 'hash_a',
              'manual', 'text', 'short_term', 'mem_snap', 'legacy/mem_snap.md', '{}',
              3, ?, ?, ?, 0)
  `).run(now, now, now)
})

afterEach(() => {
  resetTestDb()
})

describe('RAG rebuild source snapshots', () => {
  it('marks promotion snapshots stale when canonical sources change', () => {
    const snapshot = captureRebuildInputSnapshot({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      domains: ['l1'],
    })

    getDb().prepare("UPDATE memories SET content_hash = 'hash_b' WHERE memory_id = 'mem_snap'").run()

    const validated = validateRebuildInputSnapshot(snapshot.input_snapshot_id)
    expect(validated.status).toBe('stale')
    expect(validated.stale_reason).toContain('manifest changed')
  })
})

