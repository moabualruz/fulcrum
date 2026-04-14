// packages/worktrees/src/tests/worktrees.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { setDb } from '@fulcrum/core'
import { runMigration008 } from '../schema.js'
import type { ArtifactType, HandoffMode } from '../types.js'
import {
  allocateWorktree,
  markDirty,
  markReadyForMerge,
  enqueueMerge,
  processMergeQueue,
  discardWorktree,
  listMergeQueue,
} from '../worktrees.js'

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Minimal prerequisite tables so foreign keys don't block worktrees migration
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspaces (
      workspace_id TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'active',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS projects (
      project_id   TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'active',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS tasks (
      task_id      TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id   TEXT NOT NULL,
      title        TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'queued',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS agent_runs (
      run_id       TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id   TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'created',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS issues (
      issue_id     TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      project_id   TEXT NOT NULL,
      title        TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'backlog',
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS memories (
      memory_id    TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      content      TEXT NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  runMigration008(db)

  // Seed workspace and project for FK satisfaction
  db.prepare(`INSERT INTO workspaces (workspace_id, name) VALUES ('ws_test', 'Test Workspace')`).run()
  db.prepare(`INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_test', 'ws_test', 'Test Project')`).run()

  return db
}

let db: Database.Database

beforeEach(() => {
  db = createTestDb()
  setDb(db)
})

describe('allocateWorktree', () => {
  it('creates a worktree with status allocated', async () => {
    const wt = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      branch_name: 'feature/my-branch',
      path: '/tmp/worktrees/my-branch',
    })

    expect(wt.worktree_id).toMatch(/^wt_/)
    expect(wt.workspace_id).toBe('ws_test')
    expect(wt.project_id).toBe('proj_test')
    expect(wt.branch_name).toBe('feature/my-branch')
    expect(wt.path).toBe('/tmp/worktrees/my-branch')
    expect(wt.status).toBe('allocated')
    expect(wt.task_id).toBeUndefined()
    expect(wt.run_id).toBeUndefined()
    expect(wt.merged_at).toBeUndefined()
    expect(wt.discarded_at).toBeUndefined()
  })
})

describe('markDirty', () => {
  it('transitions status from allocated to dirty', async () => {
    const wt = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      branch_name: 'feature/dirty-branch',
      path: '/tmp/worktrees/dirty',
    })

    const updated = await markDirty({ worktree_id: wt.worktree_id })

    expect(updated.worktree_id).toBe(wt.worktree_id)
    expect(updated.status).toBe('dirty')
    expect(updated.updated_at).toBeDefined()
  })

  it('rejects if status is not allocated (e.g. already dirty)', async () => {
    const wt = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      branch_name: 'feature/dirty-guard',
      path: '/tmp/worktrees/dirty-guard',
    })
    await markDirty({ worktree_id: wt.worktree_id })

    await expect(markDirty({ worktree_id: wt.worktree_id })).rejects.toMatchObject({
      code: 'invalid_state',
      message: expect.stringContaining("expected 'allocated'"),
    })
  })

  it('rejects if worktree does not exist', async () => {
    await expect(markDirty({ worktree_id: 'wt_nonexistent' })).rejects.toMatchObject({
      code: 'not_found',
    })
  })
})

describe('markReadyForMerge', () => {
  it('transitions status from dirty to ready_for_merge', async () => {
    const wt = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      branch_name: 'feature/ready-branch',
      path: '/tmp/worktrees/ready',
    })
    await markDirty({ worktree_id: wt.worktree_id })
    const updated = await markReadyForMerge({ worktree_id: wt.worktree_id })

    expect(updated.status).toBe('ready_for_merge')
  })

  it('rejects if status is not dirty (e.g. still allocated)', async () => {
    const wt = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      branch_name: 'feature/ready-guard',
      path: '/tmp/worktrees/ready-guard',
    })

    await expect(markReadyForMerge({ worktree_id: wt.worktree_id })).rejects.toMatchObject({
      code: 'invalid_state',
      message: expect.stringContaining("expected 'dirty'"),
    })
  })

  it('rejects if worktree does not exist', async () => {
    await expect(markReadyForMerge({ worktree_id: 'wt_nonexistent' })).rejects.toMatchObject({
      code: 'not_found',
    })
  })
})

describe('enqueueMerge + listMergeQueue', () => {
  it('enqueued worktree appears in the merge queue', async () => {
    const wt = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      branch_name: 'feature/enqueue-branch',
      path: '/tmp/worktrees/enqueue',
    })
    await markDirty({ worktree_id: wt.worktree_id })
    await markReadyForMerge({ worktree_id: wt.worktree_id })
    await enqueueMerge({ worktree_id: wt.worktree_id })

    const queue = await listMergeQueue('proj_test')
    const found = queue.find((w) => w.worktree_id === wt.worktree_id)

    expect(found).toBeDefined()
    expect(found!.status).toBe('ready_for_merge')
  })
})

describe('processMergeQueue', () => {
  it('processes queue and marks worktrees as merged for integration_worker', async () => {
    const wt = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      branch_name: 'feature/merge-branch',
      path: '/tmp/worktrees/merge',
    })
    await markDirty({ worktree_id: wt.worktree_id })
    await markReadyForMerge({ worktree_id: wt.worktree_id })
    await enqueueMerge({ worktree_id: wt.worktree_id })

    const results = await processMergeQueue('proj_test', 'integration_worker')

    expect(results).toHaveLength(1)
    expect(results[0].worktree_id).toBe(wt.worktree_id)
    expect(results[0].success).toBe(true)
    expect(results[0].merged_at).toBeDefined()

    // Verify DB row is updated
    const queue = await listMergeQueue('proj_test')
    expect(queue.find((w) => w.worktree_id === wt.worktree_id)).toBeUndefined()
  })

  it('throws POLICY_DENIED for non-integration_worker callers', async () => {
    await expect(
      processMergeQueue('proj_test', 'implementer')
    ).rejects.toThrow('POLICY_DENIED: only integration_worker may process merge queue')
  })
})

describe('discardWorktree', () => {
  it('transitions status to discarded and sets discarded_at', async () => {
    const wt = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      branch_name: 'feature/discard-branch',
      path: '/tmp/worktrees/discard',
    })

    await discardWorktree({ worktree_id: wt.worktree_id, reason: 'stale branch' })

    const row = db
      .prepare('SELECT * FROM worktrees WHERE worktree_id = ?')
      .get(wt.worktree_id) as { status: string; discarded_at: string | null }

    expect(row.status).toBe('discarded')
    expect(row.discarded_at).not.toBeNull()
  })

  it('rejects if status is already discarded', async () => {
    const wt = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      branch_name: 'feature/discard-guard',
      path: '/tmp/worktrees/discard-guard',
    })
    await discardWorktree({ worktree_id: wt.worktree_id })

    await expect(discardWorktree({ worktree_id: wt.worktree_id })).rejects.toMatchObject({
      code: 'invalid_state',
      message: expect.stringContaining("already 'discarded'"),
    })
  })

  it('rejects if status is already merged', async () => {
    const wt = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      branch_name: 'feature/discard-merged-guard',
      path: '/tmp/worktrees/discard-merged-guard',
    })
    await markDirty({ worktree_id: wt.worktree_id })
    await markReadyForMerge({ worktree_id: wt.worktree_id })
    await processMergeQueue('proj_test', 'integration_worker')

    await expect(discardWorktree({ worktree_id: wt.worktree_id })).rejects.toMatchObject({
      code: 'invalid_state',
      message: expect.stringContaining("already 'merged'"),
    })
  })

  it('rejects if worktree does not exist', async () => {
    await expect(discardWorktree({ worktree_id: 'wt_nonexistent' })).rejects.toMatchObject({
      code: 'not_found',
    })
  })
})

describe('ArtifactType canonical 18-value set', () => {
  it('accepts all 18 canonical artifact types in the artifacts table', () => {
    const types: ArtifactType[] = [
      'prd',
      'plan',
      'issue_breakdown',
      'context_gathering_report',
      'patch',
      'changed_files_manifest',
      'command_log',
      'test_report',
      'benchmark_report',
      'review_report',
      'integration_report',
      'merge_conflict_report',
      'risk_report',
      'research_note',
      'source_digest',
      'comparison_matrix',
      'memory_promotion_summary',
      'task_outcome_summary',
    ]
    expect(types).toHaveLength(18)

    // Each type can be inserted without a CHECK constraint violation
    for (const artifact_type of types) {
      const artifactId = `art_${artifact_type}`
      expect(() =>
        db.prepare(`
          INSERT INTO artifacts
            (artifact_id, workspace_id, project_id, display_id, artifact_type,
             title, file_path, owner_type, owner_id)
          VALUES (?, 'ws_test', 'proj_test', ?, ?, ?, ?, 'task', 'task_1')
        `).run(artifactId, `ART-${artifact_type}`, artifact_type, `Title ${artifact_type}`, `/tmp/${artifact_type}.md`)
      ).not.toThrow()
    }
  })

  it('stores and retrieves research_note artifact type', () => {
    const artifactId = `art_rn_${Date.now()}`
    db.prepare(`
      INSERT INTO artifacts
        (artifact_id, workspace_id, project_id, display_id, artifact_type,
         title, file_path, owner_type, owner_id)
      VALUES (?, 'ws_test', 'proj_test', 'ART-RN1', 'research_note',
              'Research Note', '/tmp/research.md', 'task', 'task_1')
    `).run(artifactId)

    const row = db.prepare('SELECT artifact_type FROM artifacts WHERE artifact_id = ?').get(artifactId) as { artifact_type: string }
    expect(row.artifact_type).toBe('research_note')
  })

  it('stores and retrieves memory_promotion_summary artifact type', () => {
    const artifactId = `art_mps_${Date.now()}`
    db.prepare(`
      INSERT INTO artifacts
        (artifact_id, workspace_id, project_id, display_id, artifact_type,
         title, file_path, owner_type, owner_id)
      VALUES (?, 'ws_test', 'proj_test', 'ART-MPS1', 'memory_promotion_summary',
              'Memory Promotion Summary', '/tmp/mem.md', 'task', 'task_1')
    `).run(artifactId)

    const row = db.prepare('SELECT artifact_type FROM artifacts WHERE artifact_id = ?').get(artifactId) as { artifact_type: string }
    expect(row.artifact_type).toBe('memory_promotion_summary')
  })

  it('stores and retrieves task_outcome_summary artifact type', () => {
    const artifactId = `art_tos_${Date.now()}`
    db.prepare(`
      INSERT INTO artifacts
        (artifact_id, workspace_id, project_id, display_id, artifact_type,
         title, file_path, owner_type, owner_id)
      VALUES (?, 'ws_test', 'proj_test', 'ART-TOS1', 'task_outcome_summary',
              'Task Outcome Summary', '/tmp/outcome.md', 'task', 'task_1')
    `).run(artifactId)

    const row = db.prepare('SELECT artifact_type FROM artifacts WHERE artifact_id = ?').get(artifactId) as { artifact_type: string }
    expect(row.artifact_type).toBe('task_outcome_summary')
  })
})

describe('HandoffMode Python-spec values', () => {
  // Seed prerequisite tables for handoff inserts
  function insertHandoff(mode: HandoffMode): void {
    db.prepare(`
      INSERT INTO handoffs
        (handoff_id, workspace_id, project_id, from_agent_id, to_agent_id,
         goal, scope, handoff_mode)
      VALUES (?, 'ws_test', 'proj_test', 'agent_a', 'agent_b', 'do work', 'full', ?)
    `).run(`hf_${mode}_${Date.now()}`, mode)
  }

  it('accepts brief handoff mode', () => {
    expect(() => insertHandoff('brief')).not.toThrow()
  })

  it('accepts contextual handoff mode', () => {
    expect(() => insertHandoff('contextual')).not.toThrow()
  })

  it('accepts artifact_first_brief handoff mode', () => {
    expect(() => insertHandoff('artifact_first_brief')).not.toThrow()
  })

  it('accepts branched_session handoff mode', () => {
    expect(() => insertHandoff('branched_session')).not.toThrow()
  })

  it('rejects old context_first value', () => {
    expect(() =>
      db.prepare(`
        INSERT INTO handoffs
          (handoff_id, workspace_id, project_id, from_agent_id, to_agent_id,
           goal, scope, handoff_mode)
        VALUES ('hf_old', 'ws_test', 'proj_test', 'agent_a', 'agent_b', 'do work', 'full', 'context_first')
      `).run()
    ).toThrow()
  })
})

describe('listMergeQueue', () => {
  it('only returns ready_for_merge worktrees ordered by created_at ASC (FIFO)', async () => {
    // Create three worktrees; put two in ready_for_merge, one stays dirty
    const wt1 = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      branch_name: 'feature/fifo-1',
      path: '/tmp/worktrees/fifo-1',
    })
    const wt2 = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      branch_name: 'feature/fifo-2',
      path: '/tmp/worktrees/fifo-2',
    })
    const wt3 = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      branch_name: 'feature/fifo-3',
      path: '/tmp/worktrees/fifo-3',
    })

    await markDirty({ worktree_id: wt1.worktree_id })
    await markReadyForMerge({ worktree_id: wt1.worktree_id })
    await markDirty({ worktree_id: wt2.worktree_id })
    // wt2 stays dirty — not yet ready
    await markDirty({ worktree_id: wt3.worktree_id })
    await markReadyForMerge({ worktree_id: wt3.worktree_id })

    const queue = await listMergeQueue('proj_test')
    const ids = queue.map((w) => w.worktree_id)

    // Only wt1 and wt3 are ready_for_merge; wt2 is excluded
    expect(ids).toContain(wt1.worktree_id)
    expect(ids).toContain(wt3.worktree_id)
    expect(ids).not.toContain(wt2.worktree_id)

    // FIFO: wt1 was created first
    expect(ids.indexOf(wt1.worktree_id)).toBeLessThan(ids.indexOf(wt3.worktree_id))

    // All returned entries have correct status
    queue.forEach((w) => expect(w.status).toBe('ready_for_merge'))
  })
})
