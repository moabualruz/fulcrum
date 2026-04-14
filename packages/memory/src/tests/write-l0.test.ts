// packages/memory/src/tests/write-l0.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { initVault, listMemoryFiles } from '../vault/client.js'
import { readState } from '../vault/state.js'
import { writeMemory } from '../write.js'

let vaultPath: string

beforeEach(async () => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
  vaultPath = mkdtempSync(join(tmpdir(), 'fulcrum-write-l0-'))
  await initVault(vaultPath)
  process.env['FULCRUM_VAULT_PATH'] = vaultPath
})

afterEach(() => {
  resetTestDb()
  rmSync(vaultPath, { recursive: true, force: true })
  delete process.env['FULCRUM_VAULT_PATH']
})

describe('writeMemory with L0', () => {
  it('writes a markdown file to the vault on write', async () => {
    await writeMemory({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      scope: 'project',
      kind: 'decision',
      title: 'Use pnpm workspaces',
      summary: 'pnpm for monorepo',
      content: 'We decided to use pnpm workspaces for this project.',
    })

    const files = await listMemoryFiles(vaultPath, 'curated')
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/\.md$/)
  })

  it('updates .state.json after write', async () => {
    const memory = await writeMemory({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      scope: 'project',
      kind: 'fact',
      title: 'State test',
      summary: 'Testing state tracking',
      content: 'State should be updated.',
    })

    const state = readState(vaultPath)
    expect(state[memory.memory_id]).toBeDefined()
    expect(state[memory.memory_id]!.id).toBe(memory.memory_id)
  })

  it('appends to log.md after write', async () => {
    const { readFileSync } = await import('fs')
    await writeMemory({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      scope: 'project',
      kind: 'fact',
      title: 'Log test',
      summary: 'Testing log append',
      content: 'Log should contain WRITE entry.',
    })

    const log = readFileSync(join(vaultPath, 'log.md'), 'utf-8')
    expect(log).toContain('WRITE')
    expect(log).toContain('kind=fact')
  })

  it('skips L0 write when vault does not exist', async () => {
    process.env['FULCRUM_VAULT_PATH'] = '/nonexistent/vault/path'
    // Should not throw even though vault does not exist
    const memory = await writeMemory({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      scope: 'project',
      kind: 'fact',
      title: 'No vault test',
      summary: 'No vault',
      content: 'Should not fail when no vault.',
    })
    expect(memory.memory_id).toBeDefined()
    process.env['FULCRUM_VAULT_PATH'] = vaultPath
  })

  it('skipVaultWrite flag bypasses L0 write', async () => {
    await writeMemory({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      scope: 'project',
      kind: 'fact',
      title: 'Skip vault test',
      summary: 'Skip vault',
      content: 'Vault should have no files.',
      skipVaultWrite: true,
    })

    const files = await listMemoryFiles(vaultPath, 'all')
    expect(files).toHaveLength(0)
  })
})
