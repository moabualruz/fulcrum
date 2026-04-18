// packages/cli/src/tests/memory-inspection.test.ts
//
// Memory v3 PR 5 unit 5.4 — agent-facing inspection + correction surface.
//
// Five primitives: sources, inspect, readRaw, trace, markWrong. Each
// primitive is the single handler shared between the CLI dispatch and
// the MCP tool shim. This file pins the behaviour that downstream
// curator re-run (mark_wrong → correction L0 → supersede) depends on.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { _configureDb, setDb, closeDb, runMigrations, getDb } from 'fulcrum-agent-core'
import {
  runMigration101MemoryV3Lifecycle,
  ingestRawSource,
  createCuratedPage,
  type CuratedPage,
} from 'fulcrum-memory'
import {
  sources,
  inspect,
  readRaw,
  trace,
  markWrong,
} from '../commands/memory-inspection.js'

let tmpVault: string
let prevVaultEnv: string | undefined

beforeEach(() => {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  runMigration101MemoryV3Lifecycle(db)
  db.prepare("INSERT OR IGNORE INTO workspaces(workspace_id, name) VALUES ('ws_ins', 'ws_ins')").run()
  db.prepare("INSERT OR IGNORE INTO projects(project_id, workspace_id, name) VALUES ('proj_ins', 'ws_ins', 'proj_ins')").run()
  setDb(db)
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-inspection-'))
  prevVaultEnv = process.env['FULCRUM_VAULT_PATH']
  process.env['FULCRUM_VAULT_PATH'] = tmpVault
})

afterEach(() => {
  closeDb()
  rmSync(tmpVault, { recursive: true, force: true })
  if (prevVaultEnv === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultEnv
})

function seedL0(body: string): string {
  const f = ingestRawSource({
    source_type: 'bash_trace',
    body,
    meta: { workspace_id: 'ws_ins', project_id: 'proj_ins', cwd: '/home/mkh' },
  })
  return f.frontmatter.id
}

function seedPage(id: string, body: string, sources_arr: string[]): CuratedPage {
  const now = '2026-04-18T10:00:00Z'
  const page: CuratedPage = {
    id, schema: 'fulcrum.memory/v3', type: 'page',
    title: `Page ${id}`, confidence: 0.7,
    first_seen: now, last_confirmed: now, retention_tier: 'working', access_count: 0,
    sources: sources_arr, sources_via: [], supersedes: [], superseded_by: null, entities: [],
    workspace_id: 'ws_ins', project_id: 'proj_ins',
    body,
  }
  return createCuratedPage(page)
}

describe('sources (PR 5.4)', () => {
  it('returns L0 hits for every frontmatter source + inline wikilink', () => {
    const l0a = seedL0('pnpm build\nok\n')
    const l0b = seedL0('pnpm test\nfail\n')
    // Page's frontmatter sources lists l0a; body wikilinks both l0a and l0b.
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '/')
    const body = `# Auth\n\nSee [[raw/bash_trace/${date}/${l0a}]] and [[raw/bash_trace/${date}/${l0b}]].\n`
    seedPage('01INS_P', body, [l0a])
    const out = sources('01INS_P')
    expect(out.page_id).toBe('01INS_P')
    const ids = out.sources.map((s) => s.l0_id).sort()
    expect(ids).toEqual([l0a, l0b].sort())
    for (const hit of out.sources) {
      expect(hit.source_type).toBe('bash_trace')
      expect(hit.snippet.length).toBeGreaterThan(0)
      expect(hit.vault_path).toContain('raw/bash_trace/')
    }
  })

  it('marks missing L0 ids as source_type=missing', () => {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '/')
    seedPage('01INS_PM', `# Auth\n\n[[raw/bash_trace/${date}/01GHOST]]\n`, ['01GHOST'])
    const out = sources('01INS_PM')
    expect(out.sources[0]?.l0_id).toBe('01GHOST')
    expect(out.sources[0]?.source_type).toBe('missing')
  })

  it('throws for unknown page_id', () => {
    expect(() => sources('01NOPE')).toThrow(/not found/)
  })
})

describe('inspect (PR 5.4)', () => {
  it('returns frontmatter + body + serialized + resolved wikilinks', () => {
    const l0 = seedL0('pnpm build\nok\n')
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '/')
    seedPage('01INS_I', `# Auth\n\n[[raw/bash_trace/${date}/${l0}]]\n`, [l0])
    const out = inspect('01INS_I')
    expect(out.page_id).toBe('01INS_I')
    expect(out.frontmatter.id).toBe('01INS_I')
    expect(out.body).toContain('Auth')
    expect(out.serialized).toContain('---')
    expect(out.resolved_wikilinks[0]?.exists).toBe(true)
  })

  it('throws for unknown page_id', () => {
    expect(() => inspect('01NOPE')).toThrow(/not found/)
  })
})

describe('readRaw (PR 5.4)', () => {
  it('returns L0 body without frontmatter', () => {
    const l0 = seedL0('pnpm build\nok\n')
    const out = readRaw(l0)
    expect(out.l0_id).toBe(l0)
    expect(out.body).toBe('pnpm build\nok\n')
    expect(out.source_type).toBe('bash_trace')
  })

  it('throws for unknown l0_id', () => {
    expect(() => readRaw('01NOPE')).toThrow(/not found/)
  })
})

describe('trace (PR 5.4)', () => {
  it('finds pages containing the claim substring with match counts', () => {
    seedPage('01INS_T1', '# Page one\n\nAuth uses basic. [[raw/bash_trace/2026/04/18/01SRC_A]]\n', ['01SRC_A'])
    seedPage('01INS_T2', '# Page two\n\nAuth uses OAuth and AUTH is twice. [[raw/bash_trace/2026/04/18/01SRC_A]]\n', ['01SRC_A'])
    const out = trace('auth', { workspace_id: 'ws_ins', project_id: 'proj_ins' })
    const ids = out.hits.map((h) => h.page_id).sort()
    expect(ids).toEqual(['01INS_T1', '01INS_T2'])
    const two = out.hits.find((h) => h.page_id === '01INS_T2')!
    expect(two.matches).toBeGreaterThan(1)
  })

  it('returns empty hits when no pages contain the substring', () => {
    const out = trace('nonexistent-foo', { workspace_id: 'ws_ins' })
    expect(out.hits).toEqual([])
  })
})

describe('markWrong (PR 5.4)', () => {
  it('writes a correction L0 entry + returns its id', () => {
    seedPage('01INS_W', '# Wrong\n\n[[raw/bash_trace/2026/04/18/01SRC_A]]\n', ['01SRC_A'])
    const out = markWrong({ page_id: '01INS_W', reason: 'auth is actually OAuth', workspace_id: 'ws_ins', project_id: 'proj_ins' })
    expect(out.page_id).toBe('01INS_W')
    expect(out.correction_l0_id).toMatch(/^l0src_/)
    expect(out.correction_vault_path).toContain('raw/correction/')
    // Row landed in l0_sources.
    const row = getDb()
      .prepare('SELECT source_type FROM l0_sources WHERE source_id = ?')
      .get(out.correction_l0_id) as { source_type: string } | undefined
    expect(row?.source_type).toBe('correction')
  })

  it('throws when page_id is unknown', () => {
    expect(() => markWrong({ page_id: '01NOPE', reason: 'x', workspace_id: 'ws_ins' })).toThrow(/not found/)
  })
})
