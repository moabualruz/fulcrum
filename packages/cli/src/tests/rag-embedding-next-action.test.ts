import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { _configureDb, closeDb, getDb, runMigrations, setDb } from 'fulcrum-agent-core'
import { startEmbeddingJobCommand } from '../commands/memory-embedding-jobs.js'

beforeEach(() => {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  db.prepare("INSERT INTO workspaces(workspace_id, name) VALUES ('ws_1', 'ws_1')").run()
  db.prepare("INSERT INTO projects(project_id, workspace_id, name) VALUES ('proj_1', 'ws_1', 'proj_1')").run()
  db.prepare(`
    INSERT INTO memories (
      memory_id, workspace_id, project_id, kind, scope, content, content_hash,
      schema_version, vault_path, title, summary, entities, provenance
    ) VALUES (
      'mem_embed_next', 'ws_1', 'proj_1', 'fact', 'project',
      'next action source', 'hash-next',
      3, 'curated/pages/mem_embed_next.md', 'next', 'next', '[]', '{}'
    )
  `).run()
})

afterEach(() => {
  closeDb()
})

describe('embedding job next action contract', () => {
  it('returns terminal status or exact resume command from memory embed --scope --json', async () => {
    const result = await startEmbeddingJobCommand({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      scope: 'memories',
      allow_empty: false,
    }, getDb())

    expect(result.status).toBe('pending')
    expect(result.next_action).toEqual({
      command: `fulcrum jobs resume ${result.job_id} --json`,
      reason: 'embedding_job_pending',
    })
  })
})
