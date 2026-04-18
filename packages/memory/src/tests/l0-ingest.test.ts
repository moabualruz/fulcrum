// packages/memory/src/tests/l0-ingest.test.ts
//
// Memory v3 PR 1 unit 1.1 — ingestRawSource.
// Writes verbatim body to vault/raw/<type>/yyyy/mm/dd/<ULID>.md, inserts
// l0_sources row, emits l0_ingested event via the existing FulcrumEventBus.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { statSync, existsSync, readFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createHash } from 'crypto'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb, getEventBus, resetEventBus, type EmitEventInput } from 'fulcrum-agent-core'
import { runMigration101MemoryV3Lifecycle } from '../schema.js'
import { ingestRawSource } from '../l0/ingest.js'

let tmpVault: string
let prevVaultEnv: string | undefined

beforeEach(() => {
  createTestDb()
  runMigration101MemoryV3Lifecycle(getDb())
  seedWorkspaceAndProject(getDb(), 'ws_l0', 'proj_l0')
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-l0-ingest-'))
  prevVaultEnv = process.env['FULCRUM_VAULT_PATH']
  process.env['FULCRUM_VAULT_PATH'] = tmpVault
  resetEventBus()
})

afterEach(() => {
  resetTestDb()
  rmSync(tmpVault, { recursive: true, force: true })
  if (prevVaultEnv === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultEnv
  resetEventBus()
})

describe('ingestRawSource — vault file writes', () => {
  it('writes to raw/<source_type>/<yyyy>/<mm>/<dd>/<ULID>.md', () => {
    const result = ingestRawSource({
      source_type: 'bash_trace',
      body: 'echo hello\n',
      meta: { workspace_id: 'ws_l0', project_id: 'proj_l0' },
    })
    expect(result.vault_path).toMatch(/^raw\/bash_trace\/\d{4}\/\d{2}\/\d{2}\/l0src_[0-9A-HJKMNP-TV-Z]{26}\.md$/)
    expect(existsSync(join(tmpVault, result.vault_path))).toBe(true)
  })

  it('serializes frontmatter + verbatim body to disk', () => {
    const body = 'echo hello\n# with $SECRET\nline 3\n'
    const result = ingestRawSource({
      source_type: 'bash_trace',
      body,
      meta: { workspace_id: 'ws_l0', session_id: 'run_1' },
    })
    const fileContent = readFileSync(join(tmpVault, result.vault_path), 'utf-8')
    expect(fileContent).toContain('schema: fulcrum.source/v3')
    expect(fileContent).toContain('source_type: bash_trace')
    // Verbatim body is preserved (full bytes, no rewrite).
    expect(fileContent.endsWith(body)).toBe(true)
  })

  it('uses 0600 file permissions (POSIX only)', () => {
    if (process.platform === 'win32') return
    const result = ingestRawSource({
      source_type: 'tool_trace',
      body: 'x',
      meta: { workspace_id: 'ws_l0' },
    })
    const mode = statSync(join(tmpVault, result.vault_path)).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it('preserves non-printable + binary-ish bytes verbatim', () => {
    const body = '\x00\x01\x02NUL\nCR\r\nTAB\tEND'
    const result = ingestRawSource({
      source_type: 'bash_trace',
      body,
      meta: { workspace_id: 'ws_l0' },
    })
    const onDisk = readFileSync(join(tmpVault, result.vault_path), 'utf-8')
    expect(onDisk.endsWith(body)).toBe(true)
  })
})

describe('ingestRawSource — l0_sources row', () => {
  it('inserts a row matching vault_path + content_hash + size_bytes', () => {
    const body = 'sample body'
    const result = ingestRawSource({
      source_type: 'file_patch',
      body,
      meta: { workspace_id: 'ws_l0', project_id: 'proj_l0', cwd: '/tmp/proj' },
    })
    const row = getDb().prepare(`SELECT * FROM l0_sources WHERE source_id = ?`).get(result.frontmatter.id) as {
      source_id: string; source_type: string; session_id: string | null; workspace_id: string
      project_id: string | null; cwd: string | null; vault_path: string; content_hash: string
      size_bytes: number; created_at: string
    } | undefined
    expect(row).toBeDefined()
    expect(row!.source_type).toBe('file_patch')
    expect(row!.workspace_id).toBe('ws_l0')
    expect(row!.project_id).toBe('proj_l0')
    expect(row!.cwd).toBe('/tmp/proj')
    expect(row!.vault_path).toBe(result.vault_path)
    expect(row!.content_hash).toBe(result.frontmatter.content_hash)
    expect(row!.size_bytes).toBe(Buffer.byteLength(body, 'utf-8'))
    expect(row!.created_at).toBe(result.frontmatter.created_at)
  })

  it('content_hash equals sha256(body) hex', () => {
    const body = 'the quick brown fox'
    const expected = createHash('sha256').update(body).digest('hex')
    const result = ingestRawSource({
      source_type: 'bash_trace',
      body,
      meta: { workspace_id: 'ws_l0' },
    })
    expect(result.frontmatter.content_hash).toBe(expected)
  })

  it('size_bytes counts UTF-8 bytes, not UTF-16 code units', () => {
    const body = '😀' // 4 bytes UTF-8
    const result = ingestRawSource({
      source_type: 'bash_trace',
      body,
      meta: { workspace_id: 'ws_l0' },
    })
    expect(result.frontmatter.size_bytes).toBe(4)
  })

  it('FK to workspaces — delete cascades', () => {
    const result = ingestRawSource({
      source_type: 'bash_trace',
      body: 'x',
      meta: { workspace_id: 'ws_l0' },
    })
    getDb().prepare(`DELETE FROM workspaces WHERE workspace_id = 'ws_l0'`).run()
    const after = getDb().prepare(`SELECT COUNT(*) AS n FROM l0_sources WHERE source_id = ?`).get(result.frontmatter.id) as { n: number }
    expect(after.n).toBe(0)
  })
})

describe('ingestRawSource — event emission', () => {
  it('emits l0_ingested via the existing FulcrumEventBus', () => {
    const captured: EmitEventInput[] = []
    getEventBus().on('l0_ingested', (e) => { captured.push(e) })
    const result = ingestRawSource({
      source_type: 'bash_trace',
      body: 'x',
      meta: { workspace_id: 'ws_l0', project_id: 'proj_l0', session_id: 'run_42' },
    })
    expect(captured).toHaveLength(1)
    const e = captured[0]!
    expect(e.evt_type).toBe('l0_ingested')
    expect(e.workspace_id).toBe('ws_l0')
    expect(e.project_id).toBe('proj_l0')
    expect(e.object_type).toBe('l0_source')
    expect(e.object_id).toBe(result.frontmatter.id)
    expect(e.actor_type).toBe('agent_run')
    expect(e.actor_id).toBe('run_42')
  })

  it('actor defaults to system when no session_id provided', () => {
    const captured: EmitEventInput[] = []
    getEventBus().on('l0_ingested', (e) => { captured.push(e) })
    ingestRawSource({ source_type: 'bash_trace', body: 'x', meta: { workspace_id: 'ws_l0' } })
    expect(captured[0]!.actor_type).toBe('system')
  })
})

describe('ingestRawSource — validation + safety', () => {
  it('rejects unknown source_type with a clear error', () => {
    expect(() => ingestRawSource({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      source_type: 'bogus_kind' as any,
      body: 'x',
      meta: { workspace_id: 'ws_l0' },
    })).toThrow(/source_type/)
  })

  it('requires meta.workspace_id', () => {
    expect(() => ingestRawSource({
      source_type: 'bash_trace',
      body: 'x',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      meta: {} as any,
    })).toThrow(/workspace_id/)
  })

  it('generates unique ULIDs across many calls', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 50; i++) {
      const r = ingestRawSource({
        source_type: 'bash_trace',
        body: `body-${i}`,
        meta: { workspace_id: 'ws_l0' },
      })
      ids.add(r.frontmatter.id)
    }
    expect(ids.size).toBe(50)
  })
})
