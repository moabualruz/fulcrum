// packages/memory/src/tests/ingest.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from '@fulcrum/core'
import { ingestFile, ingestProject } from '../ingest.js'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

beforeEach(() => { createTestDb() })
afterEach(() => resetTestDb())

const TS_SAMPLE = `
export function greet(name: string): string {
  return \`Hello, \${name}!\`
}

export class Greeter {
  private prefix: string

  constructor(prefix: string) {
    this.prefix = prefix
  }

  greet(name: string): string {
    return \`\${this.prefix} \${name}\`
  }
}

export async function fetchUser(id: string): Promise<{ id: string; name: string }> {
  return { id, name: 'Alice' }
}
`.trim()

const PROSE_SAMPLE = `
The architecture uses a local-first SQLite database.

All packages share a single database file through @fulcrum/core's getDb() accessor.

Migrations run idempotently at startup — each migration is wrapped in INSERT OR IGNORE
to the schema_migrations table so it only executes once.
`.trim()

describe('ingestFile — TypeScript syntax chunking', () => {
  it('returns chunks_created > 0 and memories_created > 0', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const result = await ingestFile({
      workspace_id: 'ws_1', project_id: 'proj_1',
      file_path: 'src/greeter.ts', content: TS_SAMPLE, language: 'typescript',
    })
    expect(result.chunks_created).toBeGreaterThan(0)
    expect(result.memories_created).toBeGreaterThan(0)
  })

  it('stores code_chunks rows with chunk_strategy=syntax', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    await ingestFile({
      workspace_id: 'ws_1', project_id: 'proj_1',
      file_path: 'src/greeter.ts', content: TS_SAMPLE, language: 'typescript',
    })
    const rows = db.prepare("SELECT * FROM code_chunks WHERE project_id = 'proj_1'").all() as { chunk_strategy: string; source_type: string; language: string }[]
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.chunk_strategy).toBe('syntax')
      expect(row.source_type).toBe('code')
      expect(row.language).toBe('typescript')
    }
  })

  it('stores memories with kind=symbol for TS chunks', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    await ingestFile({
      workspace_id: 'ws_1', project_id: 'proj_1',
      file_path: 'src/greeter.ts', content: TS_SAMPLE, language: 'typescript',
    })
    const rows = db.prepare("SELECT kind FROM memories WHERE project_id = 'proj_1'").all() as { kind: string }[]
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.kind).toBe('symbol')
    }
  })

  it('is idempotent — does not create duplicate chunks for same file+content', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    await ingestFile({ workspace_id: 'ws_1', project_id: 'proj_1', file_path: 'src/greeter.ts', content: TS_SAMPLE, language: 'typescript' })
    const first = await ingestFile({ workspace_id: 'ws_1', project_id: 'proj_1', file_path: 'src/greeter.ts', content: TS_SAMPLE, language: 'typescript' })
    const count = (db.prepare('SELECT COUNT(*) as c FROM code_chunks WHERE project_id = ?').get('proj_1') as { c: number }).c
    // Second run should not create new chunks — deduplicated by content_hash
    expect(first.chunks_created).toBe(0)
    expect(count).toBeGreaterThan(0) // original chunks still present
  })
})

describe('ingestFile — prose semantic chunking', () => {
  it('uses semantic strategy for files with no language', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    await ingestFile({
      workspace_id: 'ws_1', project_id: 'proj_1',
      file_path: 'docs/architecture.md', content: PROSE_SAMPLE,
    })
    const rows = db.prepare("SELECT chunk_strategy, source_type FROM code_chunks WHERE project_id = ?").all('proj_1') as { chunk_strategy: string; source_type: string }[]
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.chunk_strategy).toBe('semantic')
      expect(row.source_type).toBe('prose')
    }
  })

  it('stores memories with kind=doc for prose chunks', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    await ingestFile({
      workspace_id: 'ws_1', project_id: 'proj_1',
      file_path: 'docs/architecture.md', content: PROSE_SAMPLE,
    })
    const rows = db.prepare("SELECT kind FROM memories WHERE project_id = ?").all('proj_1') as { kind: string }[]
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.kind).toBe('doc')
    }
  })
})

describe('ingestProject', () => {
  it('reads .ts and .md files from project root and ingests them', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const root = join(tmpdir(), `ingest-test-${Date.now()}`)
    mkdirSync(join(root, 'src'), { recursive: true })
    mkdirSync(join(root, 'docs'), { recursive: true })
    writeFileSync(join(root, 'src', 'main.ts'), TS_SAMPLE, 'utf8')
    writeFileSync(join(root, 'docs', 'arch.md'), PROSE_SAMPLE, 'utf8')
    try {
      const result = await ingestProject({ workspace_id: 'ws_1', project_id: 'proj_1', root_path: root })
      expect(result.chunks_created).toBeGreaterThan(0)
      expect(result.memories_created).toBeGreaterThan(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('returns 0,0 for an empty directory', async () => {
    const db = getDb()
    seedWorkspaceAndProject(db)
    const root = join(tmpdir(), `ingest-empty-${Date.now()}`)
    mkdirSync(root, { recursive: true })
    try {
      const result = await ingestProject({ workspace_id: 'ws_1', project_id: 'proj_1', root_path: root })
      expect(result.chunks_created).toBe(0)
      expect(result.memories_created).toBe(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
