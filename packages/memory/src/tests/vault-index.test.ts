// packages/memory/src/tests/vault-index.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { appendToLog, rebuildIndex } from '../vault/index-builder.js'
import { initVault, writeMemoryFile } from '../vault/client.js'
import type { FullMemory } from '../types.js'

let vaultPath: string

const baseMemory: FullMemory = {
  memory_id: '01JBXTEST000000000000000001',
  scope: 'global',
  kind: 'fact',
  workspace_id: 'ws_test',
  project_id: null,
  file_path: null,
  symbol_path: null,
  title: 'Test Memory',
  summary: 'A test memory',
  content: 'Test body content.',
  canonical_text: 'Test body content.',
  tags: ['test', 'vitest'],
  entities: ['[[concept/testing]]'],
  confidence: 1.0,
  freshness: 1.0,
  importance: 0.5,
  access_count: 0,
  event_time: null,
  content_hash: null,
  task_id: null,
  issue_id: null,
  artifact_id: null,
  provenance_refs: [],
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  last_accessed_at: new Date().toISOString(),
}

beforeEach(async () => {
  vaultPath = mkdtempSync(join(tmpdir(), 'fulcrum-index-test-'))
  await initVault(vaultPath)
})

afterEach(() => {
  rmSync(vaultPath, { recursive: true, force: true })
})

describe('appendToLog', () => {
  it('appends a WRITE entry to log.md', () => {
    appendToLog(vaultPath, { ts: '2026-04-14T10:00:00Z', op: 'WRITE', id: '01JBX001', meta: 'kind=fact' })
    const log = readFileSync(join(vaultPath, 'log.md'), 'utf-8')
    expect(log).toContain('2026-04-14T10:00:00Z')
    expect(log).toContain('WRITE')
    expect(log).toContain('01JBX001')
    expect(log).toContain('kind=fact')
  })

  it('pads op to 10 chars', () => {
    appendToLog(vaultPath, { ts: '2026-04-14T10:00:00Z', op: 'WRITE', id: 'id1' })
    const log = readFileSync(join(vaultPath, 'log.md'), 'utf-8')
    expect(log).toMatch(/WRITE\s{5}/)
  })
})

describe('rebuildIndex', () => {
  it('creates index.md with sections', async () => {
    await rebuildIndex(vaultPath)
    const idx = readFileSync(join(vaultPath, 'index.md'), 'utf-8')
    expect(idx).toContain('# Fulcrum Vault Index')
    expect(idx).toContain('## Recent (last 30 days)')
    expect(idx).toContain('## By Entity')
    expect(idx).toContain('## By Tag')
  })

  it('includes recently written memory in Recent section', async () => {
    await writeMemoryFile(vaultPath, baseMemory)
    await rebuildIndex(vaultPath)
    const idx = readFileSync(join(vaultPath, 'index.md'), 'utf-8')
    expect(idx).toContain('Test Memory')
    expect(idx).toContain('fact')
  })

  it('lists tags in By Tag section', async () => {
    await writeMemoryFile(vaultPath, baseMemory)
    await rebuildIndex(vaultPath)
    const idx = readFileSync(join(vaultPath, 'index.md'), 'utf-8')
    expect(idx).toContain('`test`')
    expect(idx).toContain('`vitest`')
  })
})
