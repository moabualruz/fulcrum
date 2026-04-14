// packages/memory/src/tests/vault-client.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  initVault, getMemoryFilePath, writeMemoryFile, readMemoryFile, listMemoryFiles, vaultExists,
} from '../vault/client.js'
import type { FullMemory } from '../types.js'

const baseMemory: FullMemory = {
  memory_id: '01JBXK7Z9T8QH0F3VRDE5W2NPM',
  scope: 'project',
  kind: 'decision',
  workspace_id: 'ws_test',
  project_id: 'proj_test',
  file_path: null,
  symbol_path: null,
  title: 'Use Kuzu for L2',
  summary: 'Chose Kuzu for embeddability',
  canonical_text: 'Full body content here.',
  tags: ['architecture'],
  entities: [],
  confidence: 0.9,
  freshness: 1.0,
  importance: 0.8,
  access_count: 0,
  event_time: null,
  content_hash: null,
  task_id: null,
  issue_id: null,
  artifact_id: null,
  provenance_refs: [],
  created_at: '2026-04-14T10:00:00Z',
  updated_at: '2026-04-14T10:00:00Z',
  last_accessed_at: '2026-04-14T10:00:00Z',
}

let vaultPath: string

beforeEach(async () => {
  vaultPath = mkdtempSync(join(tmpdir(), 'fulcrum-vault-test-'))
  await initVault(vaultPath)
})

afterEach(() => {
  rmSync(vaultPath, { recursive: true, force: true })
})

describe('initVault', () => {
  it('creates required directories and files', () => {
    expect(existsSync(join(vaultPath, 'memories', 'curated'))).toBe(true)
    expect(existsSync(join(vaultPath, 'memories', 'operational'))).toBe(true)
    expect(existsSync(join(vaultPath, '.gitignore'))).toBe(true)
    expect(existsSync(join(vaultPath, 'schema.yaml'))).toBe(true)
    expect(existsSync(join(vaultPath, 'index.md'))).toBe(true)
    expect(existsSync(join(vaultPath, 'log.md'))).toBe(true)
    expect(existsSync(join(vaultPath, '.obsidian', 'app.json'))).toBe(true)
    expect(existsSync(join(vaultPath, 'queries.md'))).toBe(true)
  })

  it('is idempotent — second call does not overwrite existing files', async () => {
    const indexContent = readFileSync(join(vaultPath, 'index.md'), 'utf-8')
    await initVault(vaultPath)
    expect(readFileSync(join(vaultPath, 'index.md'), 'utf-8')).toBe(indexContent)
  })
})

describe('getMemoryFilePath', () => {
  it('routes curated kind to memories/curated/workspaces path', () => {
    const p = getMemoryFilePath(vaultPath, baseMemory)
    expect(p).toContain(join('memories', 'curated', 'workspaces', 'ws_test', 'project', 'proj_test'))
    expect(p).toContain('01JBXK7Z9T8QH0F3VRDE5W2NPM.md')
  })

  it('routes operational kind to memories/operational/workspaces path', () => {
    const opMemory: FullMemory = { ...baseMemory, kind: 'diff', task_id: 'tsk_abc' }
    const p = getMemoryFilePath(vaultPath, opMemory)
    expect(p).toContain(join('memories', 'operational', 'workspaces', 'ws_test', 'runs', 'tsk_abc'))
  })

  it('uses memory_id as run segment when task_id is null for operational', () => {
    const opMemory: FullMemory = { ...baseMemory, kind: 'code', task_id: null }
    const p = getMemoryFilePath(vaultPath, opMemory)
    expect(p).toContain('01JBXK7Z9T8QH0F3VRDE5W2NPM')
  })

  it('includes encoded file_path segment for file-scoped curated memories', () => {
    const fileMemory: FullMemory = {
      ...baseMemory,
      scope: 'file',
      file_path: 'src/db/client.ts',
    }
    const p = getMemoryFilePath(vaultPath, fileMemory)
    expect(p).toContain(join('file', 'proj_test', 'src--db--client.ts'))
    expect(p).toContain('01JBXK7Z9T8QH0F3VRDE5W2NPM.md')
  })

  it('falls back to _unknown segment when file_path is null for file-scoped memories', () => {
    const fileMemory: FullMemory = {
      ...baseMemory,
      scope: 'file',
      file_path: null,
    }
    const p = getMemoryFilePath(vaultPath, fileMemory)
    expect(p).toContain(join('file', 'proj_test', '_unknown'))
  })
})

describe('writeMemoryFile + readMemoryFile', () => {
  it('writes a file and reads back the frontmatter correctly', async () => {
    const filePath = await writeMemoryFile(vaultPath, baseMemory)
    expect(existsSync(filePath)).toBe(true)

    const { frontmatter, body } = await readMemoryFile(filePath)
    expect(frontmatter.id).toBe('01JBXK7Z9T8QH0F3VRDE5W2NPM')
    expect(frontmatter.kind).toBe('decision')
    expect(frontmatter.workspace_id).toBe('ws_test')
    expect(body).toBe('Full body content here.')
  })
})

describe('listMemoryFiles', () => {
  it('returns empty array when no files present', async () => {
    const files = await listMemoryFiles(vaultPath, 'all')
    expect(files).toHaveLength(0)
  })

  it('lists written curated files', async () => {
    await writeMemoryFile(vaultPath, baseMemory)
    const files = await listMemoryFiles(vaultPath, 'curated')
    expect(files).toHaveLength(1)
    expect(files[0]).toContain('01JBXK7Z9T8QH0F3VRDE5W2NPM.md')
  })

  it('does not list curated files when target is operational', async () => {
    await writeMemoryFile(vaultPath, baseMemory)
    const files = await listMemoryFiles(vaultPath, 'operational')
    expect(files).toHaveLength(0)
  })
})

describe('vaultExists', () => {
  it('returns true for initialized vault', () => {
    expect(vaultExists(vaultPath)).toBe(true)
  })
  it('returns false for nonexistent path', () => {
    expect(vaultExists('/nonexistent/path/xyz')).toBe(false)
  })
})
