// packages/memory/src/tests/vault-watcher.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { initVault } from '../vault/client.js'
import { startVaultWatcher } from '../vault/watcher.js'

let vaultPath: string
let stopWatcher: (() => void) | null = null

beforeEach(async () => {
  vaultPath = mkdtempSync(join(tmpdir(), 'fulcrum-watcher-test-'))
  await initVault(vaultPath)
})

afterEach(() => {
  if (stopWatcher) {
    stopWatcher()
    stopWatcher = null
  }
  rmSync(vaultPath, { recursive: true, force: true })
})

describe('startVaultWatcher — schema validation', () => {
  it('logs ERROR and does NOT call onHumanEdit when required field is missing', async () => {
    const onHumanEdit = vi.fn().mockResolvedValue(undefined)
    const onHumanDelete = vi.fn().mockResolvedValue(undefined)

    stopWatcher = startVaultWatcher({ vaultPath, onHumanEdit, onHumanDelete })

    // Give chokidar time to set up its file system watchers before writing
    await new Promise(resolve => setTimeout(resolve, 500))

    // Write an invalid memory file — missing `kind` field
    const invalidContent = `---
id: "01JBXWATCHTEST000000000001"
schema: "fulcrum.memory/v1"
scope: "global"
workspace_id: "ws_test"
title: "Invalid Memory — no kind"
---

This memory is missing the required "kind" field.
`
    const filePath = join(vaultPath, 'memories', 'curated', 'invalid-memory.md')
    writeFileSync(filePath, invalidContent, 'utf-8')

    // Wait for chokidar to pick up the file (awaitWriteFinish stabilityThreshold is 300ms)
    await new Promise(resolve => setTimeout(resolve, 700))

    // Assert log.md contains an ERROR entry
    const log = readFileSync(join(vaultPath, 'log.md'), 'utf-8')
    expect(log).toContain('ERROR')
    expect(log).toContain('schema validation failed')
    expect(log).toContain('kind')

    // Assert onHumanEdit was NOT called
    expect(onHumanEdit).not.toHaveBeenCalled()
  })

  it('logs ERROR for a file missing multiple required fields', async () => {
    const onHumanEdit = vi.fn().mockResolvedValue(undefined)
    const onHumanDelete = vi.fn().mockResolvedValue(undefined)

    stopWatcher = startVaultWatcher({ vaultPath, onHumanEdit, onHumanDelete })

    // Give chokidar time to set up its file system watchers before writing
    await new Promise(resolve => setTimeout(resolve, 500))

    // Write a file that is missing id, kind, and workspace_id
    const invalidContent = `---
schema: "fulcrum.memory/v1"
scope: "global"
title: "Incomplete Memory"
---

Missing id, kind, and workspace_id.
`
    const filePath = join(vaultPath, 'memories', 'curated', 'incomplete-memory.md')
    writeFileSync(filePath, invalidContent, 'utf-8')

    await new Promise(resolve => setTimeout(resolve, 700))

    const log = readFileSync(join(vaultPath, 'log.md'), 'utf-8')
    expect(log).toContain('ERROR')
    expect(log).toContain('schema validation failed')
    // All three missing fields should appear in the log
    expect(log).toContain('id')
    expect(log).toContain('kind')
    expect(log).toContain('workspace_id')

    expect(onHumanEdit).not.toHaveBeenCalled()
  })
})
