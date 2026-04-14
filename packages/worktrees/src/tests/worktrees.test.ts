// packages/worktrees/src/tests/worktrees.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { execFileSync } from 'child_process'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { setDb } from '@fulcrum/core'
import { runMigration008 } from '../schema.js'
import type { ArtifactType, HandoffMode } from '../types.js'
import {
  allocateWorktree,
  deallocateWorktree,
  markDirty,
  markReadyForMerge,
  enqueueMerge,
  processMergeQueue,
  discardWorktree,
  listMergeQueue,
  cleanupAbandonedWorktrees,
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
      type         TEXT NOT NULL DEFAULT 'git',
      status       TEXT NOT NULL DEFAULT 'active',
      git_url      TEXT,
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

/**
 * Helper: insert the two gate artifacts (`review_report` + `test_report`)
 * with status='final' so a worktree can pass processMergeQueue's gate check.
 */
function createGateArtifacts(worktree_id: string): void {
  db.prepare(`
    INSERT INTO artifacts
      (artifact_id, workspace_id, project_id, display_id, artifact_type,
       title, file_path, owner_type, owner_id, status)
    VALUES (?, 'ws_test', 'proj_test', ?, 'review_report', ?, ?, 'worktree', ?, 'final')
  `).run(`art_rv_${worktree_id.slice(-8)}`, `ART-RV-${worktree_id.slice(-8)}`, `Review ${worktree_id}`, `/tmp/review-${worktree_id}.md`, worktree_id)
  db.prepare(`
    INSERT INTO artifacts
      (artifact_id, workspace_id, project_id, display_id, artifact_type,
       title, file_path, owner_type, owner_id, status)
    VALUES (?, 'ws_test', 'proj_test', ?, 'test_report', ?, ?, 'worktree', ?, 'final')
  `).run(`art_ts_${worktree_id.slice(-8)}`, `ART-TS-${worktree_id.slice(-8)}`, `Tests ${worktree_id}`, `/tmp/tests-${worktree_id}.md`, worktree_id)
}

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
    createGateArtifacts(wt.worktree_id)

    const result = await processMergeQueue('proj_test', 'integration_worker')

    expect(result.merged).toContain(wt.worktree_id)
    expect(result.results).toHaveLength(1)
    expect(result.results[0].success).toBe(true)
    expect(result.results[0].merged_at).toBeDefined()

    // Verify DB row is updated
    const queue = await listMergeQueue('proj_test')
    expect(queue.find((w) => w.worktree_id === wt.worktree_id)).toBeUndefined()
  })

  it('throws POLICY_DENIED for non-integration_worker callers', async () => {
    await expect(
      processMergeQueue('proj_test', 'software_engineer')
    ).rejects.toMatchObject({ code: 'policy_denied' })
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
    createGateArtifacts(wt.worktree_id)
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

describe('cleanupAbandonedWorktrees (H-10)', () => {
  it('removes rows with status=discarded AND updated_at older than TTL', async () => {
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() // 48h ago
    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO worktrees (worktree_id, workspace_id, project_id, path, branch_name, status, updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('wt_old_discarded', 'ws_test', 'proj_test', '/tmp/old', 'branch-old', 'discarded', old, old)
    db.prepare(`
      INSERT INTO worktrees (worktree_id, workspace_id, project_id, path, branch_name, status, updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('wt_new_discarded', 'ws_test', 'proj_test', '/tmp/new', 'branch-new', 'discarded', now, now)
    db.prepare(`
      INSERT INTO worktrees (worktree_id, workspace_id, project_id, path, branch_name, status, updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('wt_active', 'ws_test', 'proj_test', '/tmp/active', 'branch-active', 'allocated', old, old)

    const deleted = await cleanupAbandonedWorktrees({ ttl_sec: 24 * 60 * 60 })
    expect(deleted).toBe(1) // only wt_old_discarded

    const remaining = db
      .prepare(`SELECT worktree_id FROM worktrees`)
      .all() as { worktree_id: string }[]
    const ids = remaining.map((r) => r.worktree_id).sort()
    expect(ids).toEqual(['wt_active', 'wt_new_discarded'])
  })

  it('also reaps old merged worktrees', async () => {
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    db.prepare(`
      INSERT INTO worktrees (worktree_id, workspace_id, project_id, path, branch_name, status, updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('wt_old_merged', 'ws_test', 'proj_test', '/tmp/m', 'branch-m', 'merged', old, old)

    const deleted = await cleanupAbandonedWorktrees({ ttl_sec: 24 * 60 * 60 })
    expect(deleted).toBe(1)
  })

  it('returns 0 when no worktrees match', async () => {
    const deleted = await cleanupAbandonedWorktrees({ ttl_sec: 3600 })
    expect(deleted).toBe(0)
  })

  it('ttl_sec defaults to 24 hours when omitted', async () => {
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    db.prepare(`
      INSERT INTO worktrees (worktree_id, workspace_id, project_id, path, branch_name, status, updated_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('wt_x', 'ws_test', 'proj_test', '/tmp/x', 'b', 'discarded', old, old)

    const deleted = await cleanupAbandonedWorktrees()
    expect(deleted).toBe(1)
  })

  it('does not touch in-progress statuses (allocated, dirty, ready_for_merge)', async () => {
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
    for (const [id, status] of [
      ['wt_a', 'allocated'],
      ['wt_d', 'dirty'],
      ['wt_r', 'ready_for_merge'],
    ] as const) {
      db.prepare(`
        INSERT INTO worktrees (worktree_id, workspace_id, project_id, path, branch_name, status, updated_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, 'ws_test', 'proj_test', `/tmp/${id}`, `b-${id}`, status, old, old)
    }

    const deleted = await cleanupAbandonedWorktrees({ ttl_sec: 60 })
    expect(deleted).toBe(0)

    const count = (db.prepare(`SELECT COUNT(*) as c FROM worktrees`).get() as { c: number }).c
    expect(count).toBe(3)
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

// --- H-3: git subprocess integration --------------------------------------

describe('allocateWorktree git subprocess (H-3)', () => {
  let repoDir: string
  const tmpDirs: string[] = []

  function seedGitRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), 'fulcrum-wt-h3-'))
    tmpDirs.push(dir)
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
    execFileSync('git', ['config', 'user.email', 'test@fulcrum.dev'], { cwd: dir })
    execFileSync('git', ['config', 'user.name', 'Fulcrum Test'], { cwd: dir })
    execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir })
    writeFileSync(join(dir, 'README.md'), '# test\n')
    execFileSync('git', ['add', '.'], { cwd: dir })
    execFileSync('git', ['commit', '-m', 'init', '-q'], { cwd: dir })
    return dir
  }

  beforeEach(() => {
    // Fresh DB with a project pointing at a real temp git repo.
    repoDir = seedGitRepo()
    db.prepare(
      `UPDATE projects SET git_url = ?, type = 'git' WHERE project_id = 'proj_test'`
    ).run(repoDir)
  })

  afterEach(() => {
    for (const d of tmpDirs) {
      try { rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
    }
    tmpDirs.length = 0
  })

  it('runs git worktree add and creates the directory + branch', async () => {
    const wt = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      agent_role: 'software_engineer',
      base_branch: 'main',
    })
    expect(wt.worktree_id).toMatch(/^wt_/)
    expect(wt.path).toContain('.fulcrum-worktrees')
    expect(existsSync(wt.path)).toBe(true)
    expect(wt.branch_name).toMatch(/^fulcrum\/software_engineer\//)
    expect(wt.base_branch).toBe('main')

    const branches = execFileSync('git', ['branch', '--list', wt.branch_name], {
      cwd: repoDir, encoding: 'utf8'
    })
    expect(branches).toContain(wt.branch_name)
  })

  it('appends .fulcrum-worktrees/ to .gitignore idempotently', async () => {
    await allocateWorktree({
      workspace_id: 'ws_test', project_id: 'proj_test',
      agent_role: 'software_engineer', base_branch: 'main',
    })
    const gi1 = readFileSync(join(repoDir, '.gitignore'), 'utf8')
    expect(gi1).toContain('.fulcrum-worktrees/')

    // Second allocation — should NOT duplicate the entry
    await allocateWorktree({
      workspace_id: 'ws_test', project_id: 'proj_test',
      agent_role: 'qa_engineer', base_branch: 'main',
    })
    const gi2 = readFileSync(join(repoDir, '.gitignore'), 'utf8')
    const matches = gi2.match(/\.fulcrum-worktrees\//g) ?? []
    expect(matches.length).toBe(1)
  })

  it('non-git project falls back to sequential mode (no .git, no subprocess)', async () => {
    const nonGitDir = mkdtempSync(join(tmpdir(), 'fulcrum-nongit-'))
    tmpDirs.push(nonGitDir)
    db.prepare(
      `INSERT INTO projects (project_id, workspace_id, name, type, git_url) VALUES (?, ?, ?, ?, ?)`
    ).run('proj_nongit', 'ws_test', 'non-git', 'non_git', nonGitDir)

    const wt = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_nongit',
      agent_role: 'software_engineer',
      base_branch: 'main',
    })
    // In sequential mode, path is the project root itself and no
    // .fulcrum-worktrees dir is created.
    expect(wt.path).toBe(nonGitDir)
    expect(existsSync(join(nonGitDir, '.fulcrum-worktrees'))).toBe(false)
    expect(existsSync(join(nonGitDir, '.gitignore'))).toBe(false)
  })

  it('rolls back the DB row if git worktree add fails', async () => {
    await expect(
      allocateWorktree({
        workspace_id: 'ws_test',
        project_id: 'proj_test',
        agent_role: 'software_engineer',
        base_branch: 'nonexistent-branch-xyz',
      })
    ).rejects.toMatchObject({ code: 'git_error' })

    const rows = db.prepare(`SELECT * FROM worktrees`).all()
    expect(rows.length).toBe(0)
  })

  it('deallocateWorktree runs git worktree remove and deletes the row', async () => {
    const wt = await allocateWorktree({
      workspace_id: 'ws_test', project_id: 'proj_test',
      agent_role: 'software_engineer', base_branch: 'main',
    })
    expect(existsSync(wt.path)).toBe(true)

    await deallocateWorktree({ worktree_id: wt.worktree_id })
    expect(existsSync(wt.path)).toBe(false)
    const remaining = db.prepare(`SELECT * FROM worktrees WHERE worktree_id = ?`).get(wt.worktree_id)
    expect(remaining).toBeUndefined()
  })

  it('rejects managed-mode allocation when project has no git_url', async () => {
    db.prepare(
      `INSERT INTO projects (project_id, workspace_id, name, type) VALUES ('proj_no_path', 'ws_test', 'no path', 'git')`
    ).run()
    await expect(
      allocateWorktree({
        workspace_id: 'ws_test',
        project_id: 'proj_no_path',
        agent_role: 'software_engineer',
        base_branch: 'main',
      })
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})

// --- H-4: processMergeQueue runs real git merge ---------------------------

describe('processMergeQueue real git merge (H-4)', () => {
  let repoDir: string
  const tmpDirs: string[] = []

  function seedGitRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), 'fulcrum-wt-h4-'))
    tmpDirs.push(dir)
    execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
    execFileSync('git', ['config', 'user.email', 'test@fulcrum.dev'], { cwd: dir })
    execFileSync('git', ['config', 'user.name', 'Fulcrum Test'], { cwd: dir })
    execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir })
    writeFileSync(join(dir, 'README.md'), '# test\n')
    execFileSync('git', ['add', '.'], { cwd: dir })
    execFileSync('git', ['commit', '-m', 'init', '-q'], { cwd: dir })
    return dir
  }

  function commitInWorktree(wtPath: string, fileName: string, content: string, msg: string): void {
    writeFileSync(join(wtPath, fileName), content)
    execFileSync('git', ['add', '.'], { cwd: wtPath })
    execFileSync('git', ['commit', '-q', '-m', msg], { cwd: wtPath })
  }

  beforeEach(() => {
    repoDir = seedGitRepo()
    db.prepare(
      `UPDATE projects SET git_url = ?, type = 'git' WHERE project_id = 'proj_test'`
    ).run(repoDir)
  })

  afterEach(() => {
    for (const d of tmpDirs) {
      try { rmSync(d, { recursive: true, force: true }) } catch { /* ignore */ }
    }
    tmpDirs.length = 0
  })

  it('rejects callers that cannot merge (canMerge gate)', async () => {
    const wt = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      agent_role: 'software_engineer',
      base_branch: 'main',
    })
    commitInWorktree(wt.path, `feat-${wt.worktree_id}.txt`, 'new feature', 'feat: add feature')
    await markDirty({ worktree_id: wt.worktree_id })
    await markReadyForMerge({ worktree_id: wt.worktree_id })
    createGateArtifacts(wt.worktree_id)

    await expect(
      processMergeQueue({ workspace_id: 'ws_test', actor_role: 'software_engineer' })
    ).rejects.toMatchObject({ code: 'policy_denied' })
  })

  it('merges a ready worktree, removes its directory, and marks status=merged', async () => {
    const wt = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      agent_role: 'software_engineer',
      base_branch: 'main',
    })
    commitInWorktree(wt.path, `feat-${wt.worktree_id}.txt`, 'feature A', 'feat: A')
    await markDirty({ worktree_id: wt.worktree_id })
    await markReadyForMerge({ worktree_id: wt.worktree_id })
    createGateArtifacts(wt.worktree_id)

    const result = await processMergeQueue({
      workspace_id: 'ws_test',
      actor_role: 'integration_worker',
    })

    expect(result.merged).toContain(wt.worktree_id)
    expect(result.conflicts).not.toContain(wt.worktree_id)
    expect(result.skipped).not.toContain(wt.worktree_id)

    // Main branch now contains a real merge commit referencing the branch.
    const log = execFileSync('git', ['log', '--oneline', 'main'], {
      cwd: repoDir, encoding: 'utf8',
    })
    expect(log).toMatch(/Merge/i)
    expect(log).toContain('feat: A')

    // Worktree row marked merged.
    const row = db
      .prepare(`SELECT status, merged_at FROM worktrees WHERE worktree_id = ?`)
      .get(wt.worktree_id) as { status: string; merged_at: string | null }
    expect(row.status).toBe('merged')
    expect(row.merged_at).not.toBeNull()

    // Git worktree directory is gone.
    expect(existsSync(wt.path)).toBe(false)
  })

  it('skips worktrees missing gate artifacts and leaves them ready_for_merge', async () => {
    const wt = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      agent_role: 'software_engineer',
      base_branch: 'main',
    })
    commitInWorktree(wt.path, `feat-${wt.worktree_id}.txt`, 'ungated', 'feat: ungated')
    await markDirty({ worktree_id: wt.worktree_id })
    await markReadyForMerge({ worktree_id: wt.worktree_id })
    // Intentionally no gate artifacts.

    const result = await processMergeQueue({
      workspace_id: 'ws_test',
      actor_role: 'integration_worker',
    })

    expect(result.merged).not.toContain(wt.worktree_id)
    expect(result.skipped).toContain(wt.worktree_id)

    // Row still ready_for_merge.
    const row = db
      .prepare(`SELECT status FROM worktrees WHERE worktree_id = ?`)
      .get(wt.worktree_id) as { status: string }
    expect(row.status).toBe('ready_for_merge')

    // Directory still present — nothing was removed.
    expect(existsSync(wt.path)).toBe(true)
  })

  it('skips worktrees where only one gate is final (draft review fails)', async () => {
    const wt = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      agent_role: 'software_engineer',
      base_branch: 'main',
    })
    commitInWorktree(wt.path, `feat-${wt.worktree_id}.txt`, 'partial', 'feat: partial')
    await markDirty({ worktree_id: wt.worktree_id })
    await markReadyForMerge({ worktree_id: wt.worktree_id })

    // Draft review (not final) + passing test — should still be skipped.
    db.prepare(`
      INSERT INTO artifacts
        (artifact_id, workspace_id, project_id, display_id, artifact_type,
         title, file_path, owner_type, owner_id, status)
      VALUES (?, 'ws_test', 'proj_test', ?, 'review_report', ?, ?, 'worktree', ?, 'draft')
    `).run(`art_rv_draft_${wt.worktree_id.slice(-8)}`, `ART-RV-D-${wt.worktree_id.slice(-8)}`, 'Draft review', '/tmp/rv.md', wt.worktree_id)
    db.prepare(`
      INSERT INTO artifacts
        (artifact_id, workspace_id, project_id, display_id, artifact_type,
         title, file_path, owner_type, owner_id, status)
      VALUES (?, 'ws_test', 'proj_test', ?, 'test_report', ?, ?, 'worktree', ?, 'final')
    `).run(`art_ts_${wt.worktree_id.slice(-8)}`, `ART-TS-${wt.worktree_id.slice(-8)}`, 'Tests', '/tmp/ts.md', wt.worktree_id)

    const result = await processMergeQueue({
      workspace_id: 'ws_test',
      actor_role: 'integration_worker',
    })
    expect(result.skipped).toContain(wt.worktree_id)
  })

  it('detects merge conflicts, aborts the merge, and sets status=conflict', async () => {
    const wt1 = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      agent_role: 'software_engineer',
      base_branch: 'main',
    })
    const wt2 = await allocateWorktree({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      agent_role: 'software_engineer',
      base_branch: 'main',
    })

    // Both worktrees modify the SAME line of README.md.
    commitInWorktree(wt1.path, 'README.md', '# version A\n', 'feat: A')
    commitInWorktree(wt2.path, 'README.md', '# version B\n', 'feat: B')

    await markDirty({ worktree_id: wt1.worktree_id })
    await markReadyForMerge({ worktree_id: wt1.worktree_id })
    createGateArtifacts(wt1.worktree_id)
    await markDirty({ worktree_id: wt2.worktree_id })
    await markReadyForMerge({ worktree_id: wt2.worktree_id })
    createGateArtifacts(wt2.worktree_id)

    const result = await processMergeQueue({
      workspace_id: 'ws_test',
      actor_role: 'integration_worker',
    })

    expect(result.merged).toContain(wt1.worktree_id)
    expect(result.conflicts).toContain(wt2.worktree_id)

    const row2 = db
      .prepare(`SELECT status FROM worktrees WHERE worktree_id = ?`)
      .get(wt2.worktree_id) as { status: string }
    expect(row2.status).toBe('conflict')

    // Main is at wt1's state — the failed wt2 merge was aborted.
    const readme = readFileSync(join(repoDir, 'README.md'), 'utf8')
    expect(readme).toContain('version A')
    expect(readme).not.toContain('version B')

    // The repo is not stuck mid-merge (no tracked changes dangling).
    const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
      cwd: repoDir, encoding: 'utf8',
    })
    expect(status.trim()).toBe('')

    // A merge_conflict_report artifact was recorded for wt2.
    const artifact = db
      .prepare(
        `SELECT artifact_type FROM artifacts WHERE owner_type = 'worktree' AND owner_id = ? AND artifact_type = 'merge_conflict_report'`
      )
      .get(wt2.worktree_id) as { artifact_type: string } | undefined
    expect(artifact?.artifact_type).toBe('merge_conflict_report')
  })

  it('processes the queue in FIFO order by updated_at', async () => {
    // Three worktrees committed to non-overlapping files so all merges succeed.
    const wts: Array<{ id: string; path: string }> = []
    for (let i = 0; i < 3; i++) {
      const wt = await allocateWorktree({
        workspace_id: 'ws_test',
        project_id: 'proj_test',
        agent_role: 'software_engineer',
        base_branch: 'main',
      })
      commitInWorktree(wt.path, `file-${i}.txt`, `content ${i}\n`, `feat: file-${i}`)
      wts.push({ id: wt.worktree_id, path: wt.path })
    }

    // Mark ready in a deliberate non-creation order and stamp updated_at so
    // the queue processes wts[2], then wts[0], then wts[1].
    const stamps = [
      { id: wts[2].id, ts: '2026-01-01T00:00:00.000Z' },
      { id: wts[0].id, ts: '2026-01-02T00:00:00.000Z' },
      { id: wts[1].id, ts: '2026-01-03T00:00:00.000Z' },
    ]
    for (const s of stamps) {
      await markDirty({ worktree_id: s.id })
      await markReadyForMerge({ worktree_id: s.id })
      createGateArtifacts(s.id)
      db.prepare(`UPDATE worktrees SET updated_at = ? WHERE worktree_id = ?`).run(s.ts, s.id)
    }

    const result = await processMergeQueue({
      workspace_id: 'ws_test',
      actor_role: 'integration_worker',
    })
    expect(result.merged).toEqual([wts[2].id, wts[0].id, wts[1].id])
  })
})
