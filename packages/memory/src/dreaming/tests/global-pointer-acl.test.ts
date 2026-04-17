// v2b PR 12 Task 3.2 — global pointer ACL test.

import { describe, it, expect } from 'vitest'
import { writeGlobalPointer, type DurableEntry } from '../global-pointer.js'
import { statSync, unlinkSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

describe('global pointer ACL — v2b PR 12 Task 3.2', () => {
  it('sets file permissions to 0o600 after write', async () => {
    const dir = join(tmpdir(), `fulcrum-test-gp-${Date.now()}`)
    mkdirSync(dir, { recursive: true })
    const outputPath = join(dir, 'global_index.md')
    const entries: DurableEntry[] = [{
      memory_id: 'm1', slug: 's1', topic: 't', entities: 'e',
      kind: 'decision', workspace_id: 'ws1', project_id: 'p1', score: 0.9,
    }]
    await writeGlobalPointer(entries, outputPath)
    const mode = statSync(outputPath).mode & 0o777
    expect(mode).toBe(0o600)
    unlinkSync(outputPath)
  })
})
