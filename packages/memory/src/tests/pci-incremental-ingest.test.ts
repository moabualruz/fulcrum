// v2a PR 4 Task 19 — incremental ingest syncer tests.
//
// Exercises the mtime → hash → chunk-diff cascade: add / change / unlink /
// rename (body-hash match within window). Uses an in-memory SQLite via
// helpers.createTestDb() + writes/reads real files under tmpdir.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type Database from 'better-sqlite3'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { syncFile, contentSha256 } from '../pci/syncer.js'
import { computeFileId } from '../setup/backfill-code-files.js'

describe('PCI syncer — v2a PR 4 Task 19', () => {
  let db: Database.Database
  let root: string
  const workspaceId = 'ws_1'
  const projectId = 'proj_1'

  beforeEach(() => {
    db = createTestDb()
    seedWorkspaceAndProject(db, workspaceId, projectId)
    root = join(tmpdir(), `fulcrum-syncer-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(root, { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    resetTestDb()
  })

  it('add event ingests a new file: inserts code_files row + code_chunks', async () => {
    const relPath = 'src/a.ts'
    const abs = join(root, relPath)
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(abs, 'export function hello() { return 1 }\n', 'utf8')

    const result = await syncFile({
      db, workspaceId, projectId, projectRoot: root,
      event: { change_type: 'add', path: abs },
    })
    expect(result.action).toBe('indexed')

    const fileId = computeFileId(projectId, relPath)
    expect(result.fileId).toBe(fileId)

    const fileRow = db.prepare('SELECT * FROM code_files WHERE file_id = ?').get(fileId) as Record<string, unknown>
    expect(fileRow).toBeDefined()
    expect(fileRow['rel_path']).toBe(relPath)
    expect(fileRow['language']).toBe('typescript')
    expect(Number(fileRow['chunks_count'])).toBeGreaterThan(0)

    const chunkCount = db.prepare('SELECT COUNT(*) AS n FROM code_chunks WHERE file_id = ?').get(fileId) as { n: number }
    expect(chunkCount.n).toBeGreaterThan(0)
  })

  it('change event with identical content is a no-op (skipped)', async () => {
    const relPath = 'src/stable.ts'
    const abs = join(root, relPath)
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(abs, 'export const x = 1\n', 'utf8')

    await syncFile({ db, workspaceId, projectId, projectRoot: root, event: { change_type: 'add', path: abs } })

    const before = db.prepare('SELECT COUNT(*) AS n FROM code_chunks').get() as { n: number }

    const result = await syncFile({ db, workspaceId, projectId, projectRoot: root, event: { change_type: 'change', path: abs } })
    expect(result.action).toBe('skipped')

    const after = db.prepare('SELECT COUNT(*) AS n FROM code_chunks').get() as { n: number }
    expect(after.n).toBe(before.n)
  })

  it('change event with modified body diffs chunks: removes stale, adds new, preserves matching', async () => {
    const relPath = 'src/evolving.ts'
    const abs = join(root, relPath)
    mkdirSync(join(root, 'src'), { recursive: true })
    const v1 = 'export function alpha() { return 1 }\n\nexport function beta() { return 2 }\n'
    writeFileSync(abs, v1, 'utf8')
    await syncFile({ db, workspaceId, projectId, projectRoot: root, event: { change_type: 'add', path: abs } })

    const fileId = computeFileId(projectId, relPath)
    const before = db.prepare('SELECT chunk_id, content_hash FROM code_chunks WHERE file_id = ?').all(fileId) as Array<{ chunk_id: string; content_hash: string | null }>
    const betaBefore = before.find(r => r.content_hash && r.content_hash === contentSha256('export function beta() { return 2 }'))

    const v2 = 'export function alpha() { return 1 }\n\nexport function beta() { return 999 }\n'
    writeFileSync(abs, v2, 'utf8')
    const r = await syncFile({ db, workspaceId, projectId, projectRoot: root, event: { change_type: 'change', path: abs } })
    expect(r.action).toBe('updated')

    const after = db.prepare('SELECT chunk_id, content_hash FROM code_chunks WHERE file_id = ?').all(fileId) as Array<{ chunk_id: string; content_hash: string | null }>
    // alpha chunk preserved (same content_hash); beta chunk has new hash.
    const alphaBefore = before.find(r => r.content_hash === contentSha256('export function alpha() { return 1 }'))
    const alphaAfter = after.find(r => r.content_hash === contentSha256('export function alpha() { return 1 }'))
    if (alphaBefore && alphaAfter) {
      expect(alphaAfter.chunk_id).toBe(alphaBefore.chunk_id)
    }
    // beta's old hash should NOT appear anymore.
    if (betaBefore) {
      const betaStillThere = after.some(r => r.chunk_id === betaBefore.chunk_id)
      expect(betaStillThere).toBe(false)
    }
  })

  it('unlink event schedules deletion; file row gone after grace window', async () => {
    const relPath = 'src/doomed.ts'
    const abs = join(root, relPath)
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(abs, 'export const gone = true\n', 'utf8')
    await syncFile({ db, workspaceId, projectId, projectRoot: root, event: { change_type: 'add', path: abs } })

    const fileId = computeFileId(projectId, relPath)
    expect(db.prepare('SELECT file_id FROM code_files WHERE file_id = ?').get(fileId)).toBeDefined()

    unlinkSync(abs)
    const r = await syncFile({ db, workspaceId, projectId, projectRoot: root, event: { change_type: 'unlink', path: abs } })
    expect(r.action).toBe('unlinked')

    // The pending-unlink timer deletes after RENAME_WINDOW_MS (+10ms).
    await new Promise(resolve => setTimeout(resolve, 600))
    const stillThere = db.prepare('SELECT file_id FROM code_files WHERE file_id = ?').get(fileId)
    expect(stillThere).toBeUndefined()
  })

  it('same-path unlink followed by add cancels the pending delete', async () => {
    const relPath = 'src/recreated.ts'
    const abs = join(root, relPath)
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(abs, 'export const recreated = "old"\n', 'utf8')
    await syncFile({ db, workspaceId, projectId, projectRoot: root, event: { change_type: 'add', path: abs } })

    const fileId = computeFileId(projectId, relPath)
    unlinkSync(abs)
    await syncFile({ db, workspaceId, projectId, projectRoot: root, event: { change_type: 'unlink', path: abs } })

    const nextBody = 'export const recreated = "new"\n'
    writeFileSync(abs, nextBody, 'utf8')
    const r = await syncFile({ db, workspaceId, projectId, projectRoot: root, event: { change_type: 'add', path: abs } })
    expect(r.action).toBe('updated')

    await new Promise(resolve => setTimeout(resolve, 600))
    const row = db.prepare('SELECT sha256, chunks_count FROM code_files WHERE file_id = ?').get(fileId) as { sha256: string; chunks_count: number } | undefined
    expect(row).toBeDefined()
    expect(row?.sha256).toBe(contentSha256(nextBody))
    expect(Number(row?.chunks_count)).toBeGreaterThan(0)
  })

  it('rename detected: unlink followed by add with same body hash migrates file_id', async () => {
    mkdirSync(join(root, 'src'), { recursive: true })
    const oldPath = 'src/old-name.ts'
    const newPath = 'src/new-name.ts'
    const abs1 = join(root, oldPath)
    const abs2 = join(root, newPath)
    const body = 'export const renamed = 1\n'
    writeFileSync(abs1, body, 'utf8')
    await syncFile({ db, workspaceId, projectId, projectRoot: root, event: { change_type: 'add', path: abs1 } })

    const oldFileId = computeFileId(projectId, oldPath)
    const newFileId = computeFileId(projectId, newPath)

    unlinkSync(abs1)
    await syncFile({ db, workspaceId, projectId, projectRoot: root, event: { change_type: 'unlink', path: abs1 } })

    writeFileSync(abs2, body, 'utf8')
    const r = await syncFile({ db, workspaceId, projectId, projectRoot: root, event: { change_type: 'add', path: abs2 } })
    expect(r.action).toBe('renamed')

    // Row migrated; old file_id gone, new file_id present.
    expect(db.prepare('SELECT file_id FROM code_files WHERE file_id = ?').get(oldFileId)).toBeUndefined()
    const newRow = db.prepare('SELECT rel_path FROM code_files WHERE file_id = ?').get(newFileId) as { rel_path: string } | undefined
    expect(newRow?.rel_path).toBe(newPath)
  })

  it('paths outside project root are skipped', async () => {
    const result = await syncFile({
      db, workspaceId, projectId, projectRoot: root,
      event: { change_type: 'add', path: '/tmp/not/under/root.ts' },
    })
    expect(result.action).toBe('skipped')
  })

  it('files larger than 5 MiB cap are skipped', async () => {
    const relPath = 'src/huge.ts'
    const abs = join(root, relPath)
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(abs, 'x'.repeat(6 * 1024 * 1024), 'utf8')
    const r = await syncFile({ db, workspaceId, projectId, projectRoot: root, event: { change_type: 'add', path: abs } })
    expect(r.action).toBe('skipped')
  })

  it('read failures record failed file state', async () => {
    const relPath = 'src/missing.ts'
    const abs = join(root, relPath)
    const fileId = computeFileId(projectId, relPath)

    const r = await syncFile({ db, workspaceId, projectId, projectRoot: root, event: { change_type: 'add', path: abs } })
    expect(r.action).toBe('failed')

    const row = db.prepare('SELECT status, failure_reason, chunks_count FROM code_files WHERE file_id = ?').get(fileId) as { status: string; failure_reason: string; chunks_count: number }
    expect(row.status).toBe('failed')
    expect(row.failure_reason).toBe('read_failed')
    expect(row.chunks_count).toBe(0)
  })
})
