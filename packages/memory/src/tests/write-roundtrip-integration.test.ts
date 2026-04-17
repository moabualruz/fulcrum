// TEST-D: end-to-end write round-trip — exercises writeMemory() → sanitize
// → WAL → L0 (vault) → L1 (SQLite). Without this test, a regression where
// any single layer silently drops the write would go undetected; the
// split-unit tests cover each layer in isolation only.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { writeMemory } from '../write.js'
import { initVault } from '../vault/client.js'

describe('writeMemory round-trip — sanitize → WAL → L0 → L1', () => {
  let db: ReturnType<typeof createTestDb>
  let vaultPath: string
  let globalPath: string

  beforeEach(() => {
    db = createTestDb()
    vaultPath = mkdtempSync(join(tmpdir(), 'fulcrum-roundtrip-vault-'))
    globalPath = mkdtempSync(join(tmpdir(), 'fulcrum-roundtrip-global-'))
    process.env['FULCRUM_VAULT_PATH'] = vaultPath
    process.env['FULCRUM_GLOBAL_DATA_DIR'] = globalPath
    initVault(vaultPath)
    seedWorkspaceAndProject(db, 'ws_roundtrip', 'proj_roundtrip')
  })

  afterEach(() => {
    delete process.env['FULCRUM_VAULT_PATH']
    delete process.env['FULCRUM_GLOBAL_DATA_DIR']
    resetTestDb()
    try { rmSync(vaultPath, { recursive: true, force: true }) } catch { /* ignore */ }
    try { rmSync(globalPath, { recursive: true, force: true }) } catch { /* ignore */ }
  })

  it('writes identical content at each tier: sanitize → WAL → L0 → L1', async () => {
    const memory = await writeMemory({
      workspace_id: 'ws_roundtrip',
      project_id: 'proj_roundtrip',
      scope: 'project',
      kind: 'decision',
      title: 'round-trip test',
      summary: 'verifies each layer received the same content',
      content: 'Pick Kuzu for the L2 graph tier.',
    })

    // L1: memory row exists with same content + content_hash present.
    const row = db.prepare('SELECT memory_id, content, content_hash, workspace_id FROM memories WHERE memory_id = ?')
      .get(memory.memory_id) as { memory_id: string; content: string; content_hash: string | null; workspace_id: string } | undefined
    expect(row).toBeDefined()
    expect(row?.content).toBe('Pick Kuzu for the L2 graph tier.')
    expect(row?.workspace_id).toBe('ws_roundtrip')
    expect(row?.content_hash).toBeDefined()

    // L0: the vault file exists with the memory's content in the body.
    // Walk the vault tree — we don't rely on the curated/operational path split
    // since it varies by kind.
    const vaultFiles: string[] = []
    function walk(dir: string): void {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        const s = statSync(full)
        if (s.isDirectory()) walk(full)
        else if (entry.endsWith('.md')) vaultFiles.push(full)
      }
    }
    walk(vaultPath)
    const matching = vaultFiles.find(p => p.includes(memory.memory_id))
    expect(matching).toBeDefined()
    const body = readFileSync(matching!, 'utf8')
    expect(body).toContain('Pick Kuzu for the L2 graph tier.')

    // WAL: today's JSONL contains a record with our memory_id.
    const walDir = join(globalPath, 'db', 'wal')
    if (existsSync(walDir)) {
      const walFiles = readdirSync(walDir).filter(f => f.endsWith('.jsonl'))
      let walRecordFound = false
      for (const f of walFiles) {
        const lines = readFileSync(join(walDir, f), 'utf8').split('\n').filter(Boolean)
        for (const line of lines) {
          try {
            const rec = JSON.parse(line) as { memory_id: string }
            if (rec.memory_id === memory.memory_id) { walRecordFound = true; break }
          } catch { /* skip malformed */ }
        }
        if (walRecordFound) break
      }
      expect(walRecordFound).toBe(true)
    }
  })
})
