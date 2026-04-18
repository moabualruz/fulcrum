// packages/memory/src/tests/l1-page.test.ts
//
// Memory v3 PR 2 unit 2.2 — CuratedPage primitives.
//
// The write path: validate → serialize → writeCuratedFile → INSERT INTO
// memories with schema_version=3. The read path: SELECT via the l1_pages
// view → parse the vault file → return a CuratedPage. Supersession sets
// superseded_by on the old row and emits a new page with supersedes=[old].

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from 'fulcrum-agent-core'
import { runMigration101MemoryV3Lifecycle } from '../schema.js'
import {
  createCuratedPage,
  readCuratedPage,
  updateCuratedPage,
  supersedeCuratedPage,
} from '../l1/page.js'
import { L1TemplateViolationError } from '../l1/validator.js'
import type { CuratedPage } from '../l1/frontmatter.js'

let tmpVault: string
let prevVaultEnv: string | undefined

function makePage(overrides: Partial<CuratedPage> = {}): CuratedPage {
  return {
    id: '01KPAGE_ENT_A',
    schema: 'fulcrum.memory/v3',
    type: 'entity',
    name: 'React',
    confidence: 0.9,
    first_seen: '2026-04-18T12:00:00Z',
    last_confirmed: '2026-04-18T12:00:00Z',
    retention_tier: 'working',
    access_count: 0,
    sources: ['01KL0SRC_1'],
    sources_via: [],
    supersedes: [],
    superseded_by: null,
    entities: [],
    workspace_id: 'ws_pg',
    project_id: 'proj_pg',
    body: '# React\n\nLibrary.\n\n- [[raw/bash_trace/2026/04/18/01KL0SRC_1]]\n',
    ...overrides,
  }
}

beforeEach(() => {
  createTestDb()
  runMigration101MemoryV3Lifecycle(getDb())
  seedWorkspaceAndProject(getDb(), 'ws_pg', 'proj_pg')
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-l1-page-'))
  prevVaultEnv = process.env['FULCRUM_VAULT_PATH']
  process.env['FULCRUM_VAULT_PATH'] = tmpVault
})

afterEach(() => {
  resetTestDb()
  rmSync(tmpVault, { recursive: true, force: true })
  if (prevVaultEnv === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultEnv
})

describe('createCuratedPage', () => {
  it('writes curated/entities/<ULID>.md and returns the page', () => {
    const page = createCuratedPage(makePage())
    const filePath = join(tmpVault, 'curated', 'entities', '01KPAGE_ENT_A.md')
    expect(existsSync(filePath)).toBe(true)
    expect(readFileSync(filePath, 'utf8')).toContain('id: 01KPAGE_ENT_A')
    expect(page.id).toBe('01KPAGE_ENT_A')
  })

  it.each([
    ['entity', 'entities'],
    ['concept', 'concepts'],
    ['page', 'pages'],
    ['synthesis', 'synthesis'],
  ] as const)('shards type=%s under curated/%s/', (type, dir) => {
    const variants: Partial<CuratedPage>[] = [{ id: `01K_${type}`, type }]
    if (type === 'page') variants[0]!.title = 'Auth page'
    if (type === 'synthesis') {
      variants[0]!.title = 'Auth synth'
      variants[0]!.name = undefined
      variants[0]!.sources = []
      variants[0]!.sources_via = ['01KANY']
      variants[0]!.body =
        '# Auth synth\n\n- [[page/01KANY]]\n- [[raw/session_transcript/2026/04/18/01KL0SRC_1]]\n'
    }
    const created = createCuratedPage(makePage(variants[0]))
    expect(existsSync(join(tmpVault, 'curated', dir, `${created.id}.md`))).toBe(true)
  })

  it('inserts a memories row with schema_version=3 and kind=type', () => {
    const page = createCuratedPage(makePage())
    const row = getDb()
      .prepare(
        'SELECT schema_version, kind, title, content, retention_tier, confidence FROM memories WHERE memory_id = ?',
      )
      .get(page.id) as {
      schema_version: number
      kind: string
      title: string
      content: string
      retention_tier: string
      confidence: number
    }
    expect(row.schema_version).toBe(3)
    expect(row.kind).toBe('entity')
    expect(row.title).toBe('React')
    expect(row.content).toContain('Library.')
    expect(row.retention_tier).toBe('working')
    expect(row.confidence).toBe(0.9)
  })

  it('sets vault_path and provenance.sources', () => {
    const page = createCuratedPage(makePage())
    const row = getDb()
      .prepare('SELECT vault_path, provenance FROM memories WHERE memory_id = ?')
      .get(page.id) as { vault_path: string; provenance: string }
    expect(row.vault_path).toBe('curated/entities/01KPAGE_ENT_A.md')
    expect(JSON.parse(row.provenance)).toEqual({
      sources: ['01KL0SRC_1'],
      sources_via: [],
    })
  })

  it('rejects a page failing validation', () => {
    expect(() => createCuratedPage(makePage({ confidence: 2 }))).toThrow(L1TemplateViolationError)
  })

  it('rejects a duplicate page id', () => {
    createCuratedPage(makePage())
    expect(() => createCuratedPage(makePage())).toThrow(/already exists/i)
  })
})

describe('readCuratedPage', () => {
  it('returns null for unknown id', () => {
    expect(readCuratedPage('01KNOPE')).toBeNull()
  })

  it('round-trips a created page byte-stable', () => {
    const original = createCuratedPage(makePage())
    const readBack = readCuratedPage(original.id)
    expect(readBack).not.toBeNull()
    expect(readBack!.id).toBe(original.id)
    expect(readBack!.sources).toEqual(original.sources)
    expect(readBack!.body).toBe(original.body)
  })
})

describe('updateCuratedPage', () => {
  it('patches frontmatter + body and re-validates', () => {
    const original = createCuratedPage(makePage())
    const updated = updateCuratedPage(original.id, {
      confidence: 0.7,
      last_confirmed: '2026-04-19T00:00:00Z',
      access_count: 5,
    })
    expect(updated.confidence).toBe(0.7)
    expect(updated.access_count).toBe(5)
    const row = getDb()
      .prepare('SELECT confidence, access_count FROM memories WHERE memory_id = ?')
      .get(original.id) as { confidence: number; access_count: number }
    expect(row.confidence).toBe(0.7)
    expect(row.access_count).toBe(5)
  })

  it('rejects an update that breaks validation', () => {
    const original = createCuratedPage(makePage())
    expect(() =>
      updateCuratedPage(original.id, { sources: [], sources_via: [] }),
    ).toThrow(L1TemplateViolationError)
  })

  it('throws when page id does not exist', () => {
    expect(() => updateCuratedPage('01KNOPE', { confidence: 0.5 })).toThrow(/not found/i)
  })
})

describe('supersedeCuratedPage', () => {
  it('creates new page, sets supersedes=[old] and old.superseded_by=new', () => {
    const old = createCuratedPage(makePage())
    const successor: CuratedPage = makePage({
      id: '01KPAGE_ENT_B',
      confidence: 0.95,
      body: '# React\n\nCorrected.\n\n- [[raw/bash_trace/2026/04/18/01KL0SRC_1]]\n',
    })
    const { new_page } = supersedeCuratedPage(old.id, successor)
    expect(new_page.supersedes).toEqual([old.id])
    const oldRow = getDb()
      .prepare('SELECT superseded_by FROM memories WHERE memory_id = ?')
      .get(old.id) as { superseded_by: string }
    expect(oldRow.superseded_by).toBe(new_page.id)
  })

  it('throws when old page does not exist', () => {
    const successor: CuratedPage = makePage({ id: '01KPAGE_ENT_B' })
    expect(() => supersedeCuratedPage('01KNOPE', successor)).toThrow(/not found/i)
  })
})
