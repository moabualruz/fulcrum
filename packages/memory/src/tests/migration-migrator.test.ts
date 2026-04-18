// packages/memory/src/tests/migration-migrator.test.ts
//
// Memory v3 PR 6 unit 6.2 — migrator.
//
// Per-row migration + bulk walker. Writes vault files only (no DB updates
// in this unit; 6.3 does the DB backfill):
//   L0-class → vault/raw/<source_type>/YYYY/MM/DD/<memory_id>.md (frontmatter + body verbatim, 0600)
//   L1-class → vault/curated/<type_dir>/<memory_id>.md (stub page, sources=[], confidence=0.5, 0644)

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, readFileSync, statSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { tmpdir } from 'os'
import { createHash } from 'crypto'
import { getDb, newId } from 'fulcrum-agent-core'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import {
  migrateMemoryRow,
  migrateAllMemories,
  type MigrationRecord,
} from '../migration/migrator.js'
import { classifyMemoriesForMigration } from '../migration/classifier.js'
import { parseCuratedPage } from '../l1/frontmatter.js'

let tmpVault: string

function seedMemory(kind: string, opts: { id?: string; content?: string; title?: string; summary?: string; createdAt?: string; sessionId?: string; workspaceId?: string; projectId?: string } = {}): string {
  const db = getDb()
  const id = opts.id ?? newId('memory')
  db.prepare(`
    INSERT INTO memories(memory_id, workspace_id, project_id, scope, kind, title, summary, content, session_id, created_at)
    VALUES(?, ?, ?, 'project', ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    opts.workspaceId ?? 'ws_mig',
    opts.projectId ?? 'proj_mig',
    kind,
    opts.title ?? '',
    opts.summary ?? '',
    opts.content ?? 'body',
    opts.sessionId ?? null,
    opts.createdAt ?? '2026-03-15T10:30:00.000Z',
  )
  return id
}

beforeEach(() => {
  createTestDb()
  seedWorkspaceAndProject(getDb(), 'ws_mig', 'proj_mig')
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-mig-migrator-'))
})

afterEach(() => {
  resetTestDb()
  rmSync(tmpVault, { recursive: true, force: true })
})

describe('migrateMemoryRow — L0_raw', () => {
  it('writes raw/<source_type>/<yyyy>/<mm>/<dd>/<memory_id>.md preserving memory_id as filename', () => {
    const id = seedMemory('bash_trace', { content: 'echo hi\n', createdAt: '2026-03-15T10:30:00.000Z' })
    const rec = migrateMemoryRow(tmpVault, getDb(), classifyMemoriesForMigration(getDb())[0]!)
    expect(rec.vault_path).toBe(`raw/bash_trace/2026/03/15/${id}.md`)
    expect(existsSync(join(tmpVault, rec.vault_path))).toBe(true)
  })

  it('session_summary kind aliases to session_transcript source_type', () => {
    seedMemory('session_summary', { content: 'x', createdAt: '2025-12-01T00:00:00.000Z' })
    const rec = migrateMemoryRow(tmpVault, getDb(), classifyMemoriesForMigration(getDb())[0]!)
    expect(rec.vault_path.startsWith('raw/session_transcript/2025/12/01/')).toBe(true)
  })

  it('frontmatter carries id, schema, source_type, workspace_id, content_hash, size_bytes', () => {
    const id = seedMemory('tool_trace', { content: 'hello world', workspaceId: 'ws_mig', projectId: 'proj_mig', sessionId: 'sess_42' })
    const rec = migrateMemoryRow(tmpVault, getDb(), classifyMemoriesForMigration(getDb())[0]!)
    const text = readFileSync(join(tmpVault, rec.vault_path), 'utf-8')
    expect(text).toContain(`id: ${id}`)
    expect(text).toContain('schema: fulcrum.source/v3')
    expect(text).toContain('source_type: tool_trace')
    expect(text).toContain('workspace_id: ws_mig')
    expect(text).toContain('project_id: proj_mig')
    expect(text).toContain('session_id: sess_42')
    const hash = createHash('sha256').update('hello world').digest('hex')
    expect(text).toContain(`content_hash: ${hash}`)
    expect(text).toContain('size_bytes: 11')
  })

  it('body appended verbatim after the frontmatter block (ends with exact memory.content)', () => {
    const body = 'line 1\nline 2\n\n\x01binary\x02\n'
    seedMemory('bash_trace', { content: body })
    const rec = migrateMemoryRow(tmpVault, getDb(), classifyMemoriesForMigration(getDb())[0]!)
    const text = readFileSync(join(tmpVault, rec.vault_path), 'utf-8')
    expect(text.endsWith(body)).toBe(true)
  })

  it('uses 0600 perms on the vault file (POSIX only)', () => {
    if (process.platform === 'win32') return
    seedMemory('bash_trace', { content: 'x' })
    const rec = migrateMemoryRow(tmpVault, getDb(), classifyMemoriesForMigration(getDb())[0]!)
    const mode = statSync(join(tmpVault, rec.vault_path)).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it('rec.result=`written` on first write; `skipped` on re-run with matching hash', () => {
    seedMemory('file_patch', { content: 'diff --git a/x b/x\n' })
    const row = classifyMemoriesForMigration(getDb())[0]!
    const first = migrateMemoryRow(tmpVault, getDb(), row)
    expect(first.result).toBe('written')
    const second = migrateMemoryRow(tmpVault, getDb(), row)
    expect(second.result).toBe('skipped')
    expect(second.vault_path).toBe(first.vault_path)
  })

  it('throws when an existing vault file has a different content_hash (refuses to overwrite)', () => {
    const id = seedMemory('bash_trace', { content: 'original', createdAt: '2026-03-15T10:30:00.000Z' })
    const row = classifyMemoriesForMigration(getDb())[0]!
    const first = migrateMemoryRow(tmpVault, getDb(), row)
    // Corrupt the file on disk to simulate drift.
    writeFileSync(join(tmpVault, first.vault_path), 'garbage', 'utf-8')
    expect(() => migrateMemoryRow(tmpVault, getDb(), row)).toThrowError(/content_hash mismatch/)
    expect(() => migrateMemoryRow(tmpVault, getDb(), row)).toThrowError(new RegExp(id))
  })
})

describe('migrateMemoryRow — L1_curated_stub', () => {
  it.each([
    ['decision', 'pages', 'page'],
    ['fact', 'pages', 'page'],
    ['concept', 'concepts', 'concept'],
    ['identity', 'entities', 'entity'],
    ['persona', 'entities', 'entity'],
  ] as const)('kind=%s writes curated/%s/<memory_id>.md with type=%s', (kind, dir, type) => {
    const id = seedMemory(kind, { content: 'the decision body', title: 'My title' })
    const rec = migrateMemoryRow(tmpVault, getDb(), classifyMemoriesForMigration(getDb())[0]!)
    expect(rec.vault_path).toBe(`curated/${dir}/${id}.md`)
    const page = parseCuratedPage(readFileSync(join(tmpVault, rec.vault_path), 'utf-8'))
    expect(page.type).toBe(type)
    expect(page.id).toBe(id)
  })

  it('stub frontmatter has sources=[], sources_via=[], confidence=0.5, retention_tier=working, schema_version=3', () => {
    seedMemory('decision', { content: 'body', createdAt: '2026-01-10T12:00:00.000Z' })
    const rec = migrateMemoryRow(tmpVault, getDb(), classifyMemoriesForMigration(getDb())[0]!)
    const page = parseCuratedPage(readFileSync(join(tmpVault, rec.vault_path), 'utf-8'))
    expect(page.sources).toEqual([])
    expect(page.sources_via).toEqual([])
    expect(page.confidence).toBe(0.5)
    expect(page.retention_tier).toBe('working')
    expect(page.schema).toBe('fulcrum.memory/v3')
    expect(page.access_count).toBe(0)
    expect(page.supersedes).toEqual([])
    expect(page.superseded_by).toBeNull()
    expect(page.entities).toEqual([])
    expect(page.first_seen).toBe('2026-01-10T12:00:00.000Z')
    expect(page.last_confirmed).toBe('2026-01-10T12:00:00.000Z')
  })

  it('body preserves the original memories.content and prepends an H1 from title/kind', () => {
    seedMemory('decision', { content: 'raw body', title: 'Adopt feature flag' })
    const rec = migrateMemoryRow(tmpVault, getDb(), classifyMemoriesForMigration(getDb())[0]!)
    const page = parseCuratedPage(readFileSync(join(tmpVault, rec.vault_path), 'utf-8'))
    expect(page.body).toContain('# Adopt feature flag')
    expect(page.body).toContain('raw body')
  })

  it('when title is empty, body falls back to the kind as H1', () => {
    seedMemory('fact', { content: 'raw', title: '' })
    const rec = migrateMemoryRow(tmpVault, getDb(), classifyMemoriesForMigration(getDb())[0]!)
    const page = parseCuratedPage(readFileSync(join(tmpVault, rec.vault_path), 'utf-8'))
    expect(page.body.split('\n')[0]).toMatch(/^# /)
  })

  it('re-run is idempotent: second call returns result=skipped without overwriting', () => {
    seedMemory('concept', { content: 'original body' })
    const row = classifyMemoriesForMigration(getDb())[0]!
    const first = migrateMemoryRow(tmpVault, getDb(), row)
    expect(first.result).toBe('written')
    const before = readFileSync(join(tmpVault, first.vault_path), 'utf-8')
    const second = migrateMemoryRow(tmpVault, getDb(), row)
    expect(second.result).toBe('skipped')
    expect(readFileSync(join(tmpVault, first.vault_path), 'utf-8')).toBe(before)
  })
})

describe('migrateMemoryRow — unknown', () => {
  it('returns result=skipped with classification=unknown and writes nothing', () => {
    seedMemory('entity', { content: 'x' }) // v2b kind — unknown class
    const row = classifyMemoriesForMigration(getDb())[0]!
    const rec = migrateMemoryRow(tmpVault, getDb(), row)
    expect(rec.result).toBe('skipped')
    expect(rec.classification).toBe('unknown')
    // Nothing under vault.
    expect(existsSync(join(tmpVault, 'raw'))).toBe(false)
    expect(existsSync(join(tmpVault, 'curated'))).toBe(false)
  })
})

describe('migrateMemoryRow — dry_run', () => {
  it('dry_run=true returns the would-be vault_path but writes nothing to disk', () => {
    const id = seedMemory('bash_trace', { content: 'echo dry' })
    const row = classifyMemoriesForMigration(getDb())[0]!
    const rec = migrateMemoryRow(tmpVault, getDb(), row, { dry_run: true })
    expect(rec.result).toBe('planned')
    expect(rec.vault_path).toContain(`${id}.md`)
    expect(existsSync(join(tmpVault, rec.vault_path))).toBe(false)
  })
})

describe('migrateAllMemories', () => {
  it('walks classifier rows and returns a manifest grouped by class', () => {
    seedMemory('bash_trace', { content: 'a' })
    seedMemory('file_patch', { content: 'b' })
    seedMemory('decision', { content: 'c' })
    seedMemory('fact', { content: 'd' })
    seedMemory('entity', { content: 'e' }) // unknown

    const batch = migrateAllMemories(tmpVault, getDb())
    expect(batch.l0.count).toBe(2)
    expect(batch.l1.count).toBe(2)
    expect(batch.unknown.count).toBe(1)
    expect(batch.errors).toEqual([])
    expect(batch.manifest.filter(r => r.classification === 'l0_raw')).toHaveLength(2)
    expect(batch.manifest.filter(r => r.classification === 'l1_curated_stub')).toHaveLength(2)
    expect(batch.manifest.filter(r => r.classification === 'unknown')).toHaveLength(1)
  })

  it('dry_run writes nothing but returns the full manifest', () => {
    seedMemory('bash_trace', { content: 'a' })
    seedMemory('decision', { content: 'b' })

    const batch = migrateAllMemories(tmpVault, getDb(), { dry_run: true })
    expect(batch.l0.count).toBe(1)
    expect(batch.l1.count).toBe(1)
    expect(existsSync(join(tmpVault, 'raw'))).toBe(false)
    expect(existsSync(join(tmpVault, 'curated'))).toBe(false)
    for (const rec of batch.manifest) {
      expect(rec.result).toBe('planned')
    }
  })

  it('honours workspace_id scoping (inherits classifier filter)', () => {
    seedMemory('bash_trace', { content: 'a', workspaceId: 'ws_mig' })
    // Seed a second workspace + row via the helper.
    seedWorkspaceAndProject(getDb(), 'ws_other', 'proj_other')
    seedMemory('bash_trace', { content: 'b', workspaceId: 'ws_other', projectId: 'proj_other' })

    const batch = migrateAllMemories(tmpVault, getDb(), { workspaceId: 'ws_mig' })
    expect(batch.l0.count).toBe(1)
    expect(batch.manifest.every(r => r.workspace_id === 'ws_mig')).toBe(true)
  })

  it('collects per-row errors without aborting the batch', () => {
    seedMemory('bash_trace', { content: 'a' })
    // Pre-populate a garbage file at the would-be vault_path to trigger
    // the content_hash mismatch error for the second run.
    const id = seedMemory('bash_trace', { content: 'b', createdAt: '2026-03-15T10:30:00.000Z' })
    const expected = `raw/bash_trace/2026/03/15/${id}.md`
    mkdirSync(dirname(join(tmpVault, expected)), { recursive: true })
    writeFileSync(join(tmpVault, expected), 'garbage', 'utf-8')

    const batch = migrateAllMemories(tmpVault, getDb())
    expect(batch.l0.count).toBe(1) // only the clean row wrote
    expect(batch.errors).toHaveLength(1)
    expect(batch.errors[0]!.memory_id).toBe(id)
    expect(batch.errors[0]!.message).toMatch(/content_hash mismatch/)
  })
})

describe('migration record shape', () => {
  it('exposes the full MigrationRecord fields for downstream 6.3 consumption', () => {
    const id = seedMemory('bash_trace', { content: 'payload' })
    const rec: MigrationRecord = migrateMemoryRow(tmpVault, getDb(), classifyMemoriesForMigration(getDb())[0]!)
    expect(rec.memory_id).toBe(id)
    expect(rec.classification).toBe('l0_raw')
    expect(rec.kind).toBe('bash_trace')
    expect(rec.workspace_id).toBe('ws_mig')
    expect(rec.project_id).toBe('proj_mig')
    expect(typeof rec.vault_path).toBe('string')
    expect(rec.content_hash).toBe(createHash('sha256').update('payload').digest('hex'))
    expect(rec.size_bytes).toBe('payload'.length)
  })
})
