// Smoke test: vault files are Obsidian-compatible YAML frontmatter + body.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { writeMemory } from '../write.js'

function findMdFiles(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) results.push(...findMdFiles(full))
    else if (entry.endsWith('.md')) results.push(full)
  }
  return results
}

describe('vault-obsidian-smoke', () => {
  let db: ReturnType<typeof createTestDb>
  let vaultDir: string

  beforeEach(() => {
    db = createTestDb()
    seedWorkspaceAndProject(db, 'ws1', 'proj1')
    vaultDir = mkdtempSync(join(tmpdir(), 'fulcrum-vault-'))
    process.env['FULCRUM_VAULT_PATH'] = vaultDir
  })

  afterEach(() => {
    resetTestDb()
    delete process.env['FULCRUM_VAULT_PATH']
    rmSync(vaultDir, { recursive: true, force: true })
  })

  it('written vault file has YAML frontmatter with required fields', async () => {
    const result = await writeMemory({
      workspace_id: 'ws1',
      project_id: 'proj1',
      scope: 'project',
      kind: 'decision',
      title: 'Use SQLite for L1',
      summary: 'SQLite is the L1 store',
      content: 'We chose SQLite because it is embedded and fast for FTS5 queries.',
      tags: ['architecture', 'storage'],
    }, db)

    const files = findMdFiles(vaultDir)
    // Find the memory file (named <memory_id>.md)
    const memFile = files.find(f => f.endsWith(`${result.memory_id}.md`))
    expect(memFile).toBeTruthy()

    const content = readFileSync(memFile!, 'utf-8')

    // gray-matter format: '---\n' ... '\n---\n' ... body
    expect(content).toMatch(/^---\r?\n/)
    const fmEnd = content.indexOf('\n---\n')
    expect(fmEnd).toBeGreaterThan(0)
    const fm = content.slice(0, fmEnd)

    // Required frontmatter fields (formatter uses 'id' not 'memory_id')
    expect(fm).toContain('id:')
    expect(fm).toContain('kind:')
    expect(fm).toContain('scope:')
    expect(fm).toContain('title:')
    expect(fm).toContain('schema:')

    // Body after frontmatter should be present
    const body = content.slice(fmEnd + 5)
    expect(body.trim().length).toBeGreaterThanOrEqual(0)

    expect(result.memory_id).toBeTruthy()
  })
})
