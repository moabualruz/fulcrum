// Regression guard: L0 (vault markdown) must store the ORIGINAL content —
// never the FTS5-tokenized canonical_text. Prior to the fix, writeMemoryFile
// wrote memory.canonical_text as the body, which mangled identifiers like
// `user_profile_service` → `user profile service` in the human-readable
// source-of-truth vault. That meant the vault was not actually canonical.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getDb, closeDb, runMigrations } from 'fulcrum-agent-core'
import { writeMemory } from '../write.js'
import { rebuildFromVault } from '../setup/rebuild.js'
import { initVault, readMemoryFile, listMemoryFiles } from '../vault/client.js'

let tempDataDir: string

beforeEach(() => {
  tempDataDir = mkdtempSync(join(tmpdir(), 'fulcrum-l0-test-'))
  process.env['FULCRUM_DATA_DIR'] = tempDataDir
  process.env['FULCRUM_VAULT_PATH'] = join(tempDataDir, 'vault')
  closeDb()
  runMigrations(getDb())
  initVault(join(tempDataDir, 'vault'))
  const db = getDb()
  db.prepare("INSERT OR IGNORE INTO workspaces (workspace_id, name, status, created_at) VALUES ('ws_test','test','active',datetime('now'))").run()
  db.prepare("INSERT OR IGNORE INTO projects (project_id, workspace_id, name, created_at) VALUES ('proj_test','ws_test','test',datetime('now'))").run()
})

afterEach(() => {
  closeDb()
  try { rmSync(tempDataDir, { recursive: true, force: true }) } catch { /* best-effort */ }
  delete process.env['FULCRUM_DATA_DIR']
  delete process.env['FULCRUM_VAULT_PATH']
})

describe('L0 vault body — identifier preservation', () => {
  it('code-kind memory: vault body keeps snake_case + camelCase unchanged', async () => {
    const original = 'function getUserById(user_profile_id: string) { return findUser(user_profile_id) }'
    await writeMemory({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      scope: 'project',
      kind: 'symbol',
      title: 'getUserById',
      summary: 'lookup by user_profile_id',
      content: original,
    })

    const vaultRoot = join(tempDataDir, 'vault')
    const files = await listMemoryFiles(vaultRoot, 'all')
    expect(files.length).toBeGreaterThan(0)

    const parsed = await readMemoryFile(files[0]!)
    // L0 body must be the ORIGINAL content, not tokenized.
    expect(parsed.body.trim()).toBe(original)
    expect(parsed.body).toContain('user_profile_id')          // underscores preserved
    expect(parsed.body).toContain('getUserById')              // camelCase preserved
    expect(parsed.body).not.toContain('user profile id')      // never tokenized in vault
    expect(parsed.body).not.toContain('get User By Id')
  })

  it('prose-kind memory: vault body is verbatim content', async () => {
    const original = 'Decision: use the user_profile_service for lookups.'
    await writeMemory({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      scope: 'project',
      kind: 'decision',
      title: 'choose service',
      summary: 'which service',
      content: original,
    })

    const files = await listMemoryFiles(join(tempDataDir, 'vault'), 'all')
    const parsed = await readMemoryFile(files[0]!)
    expect(parsed.body.trim()).toBe(original)
  })

  it('L1 still gets tokenized canonical_text despite verbatim L0 body', async () => {
    const original = 'class UserProfileService { get_user_by_id() {} }'
    const { memory_id } = await writeMemory({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      scope: 'project',
      kind: 'symbol',
      title: 'UserProfileService',
      summary: 'svc',
      content: original,
    })

    const row = getDb().prepare('SELECT content, canonical_text FROM memories WHERE memory_id = ?').get(memory_id) as { content: string; canonical_text: string }
    expect(row.content).toBe(original)
    // canonical_text splits identifiers for FTS5 tokenization.
    expect(row.canonical_text).toContain('User Profile Service')
    expect(row.canonical_text).toContain('get user by id')
  })

  it('rebuildFromVault round-trip: body=original, rebuilt canonical_text=tokenized', async () => {
    const original = 'function fetch_api_key(client_id) { return api.get(client_id) }'
    await writeMemory({
      workspace_id: 'ws_test',
      project_id: 'proj_test',
      scope: 'project',
      kind: 'code',
      title: 'fetch_api_key',
      summary: 'api',
      content: original,
    })

    // Wipe L1 rows — simulates a fresh rebuild from vault.
    getDb().prepare('DELETE FROM memories').run()

    await rebuildFromVault({ vaultPath: join(tempDataDir, 'vault'), target: 'l1' })

    const row = getDb().prepare('SELECT content, canonical_text FROM memories LIMIT 1').get() as { content: string; canonical_text: string } | undefined
    expect(row).toBeDefined()
    expect(row!.content).toBe(original)
    // Rebuild re-derived canonical_text from the original body — identifiers tokenized.
    expect(row!.canonical_text).toContain('fetch api key')
    expect(row!.canonical_text).toContain('client id')
  })
})
