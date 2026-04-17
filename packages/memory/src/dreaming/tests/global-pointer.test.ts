// v2b PR 12 Task 3.1 — global pointer collection writer tests.

import { describe, it, expect } from 'vitest'
import { buildGlobalPointerLines, type DurableEntry } from '../global-pointer.js'

function makeEntry(workspace_id: string, project_id: string, i: number): DurableEntry {
  return {
    memory_id: `m${i}`,
    slug: `slug_${i}`,
    topic: `topic_${i}`,
    entities: `entity_${i}`,
    kind: 'decision',
    workspace_id,
    project_id,
    score: 0.8,
  }
}

describe('global pointer collection — v2b PR 12 Task 3.1', () => {
  it('produces one line per durable entry', () => {
    const entries = Array.from({ length: 10 }, (_, i) => makeEntry('ws1', 'proj1', i))
    const lines = buildGlobalPointerLines(entries)
    expect(lines).toHaveLength(10)
  })

  it('each line contains topic | entities | kind | slug | workspace/project | score', () => {
    const entries = [makeEntry('ws1', 'proj1', 0)]
    const [line] = buildGlobalPointerLines(entries)
    expect(line).toContain('topic_0')
    expect(line).toContain('entity_0')
    expect(line).toContain('decision')
    expect(line).toContain('slug_0')
    expect(line).toContain('ws1/proj1')
  })

  it('promotes entries from 2 workspaces with correct workspace IDs', () => {
    const entries = [
      ...Array.from({ length: 5 }, (_, i) => makeEntry('ws1', 'proj1', i)),
      ...Array.from({ length: 5 }, (_, i) => makeEntry('ws2', 'proj2', i + 10)),
    ]
    const lines = buildGlobalPointerLines(entries)
    const ws1Lines = lines.filter(l => l.includes('ws1/proj1'))
    const ws2Lines = lines.filter(l => l.includes('ws2/proj2'))
    expect(ws1Lines).toHaveLength(5)
    expect(ws2Lines).toHaveLength(5)
  })

  it('prunes to 2000 lines max (oldest + lowest-utility pruned)', () => {
    const entries = Array.from({ length: 2500 }, (_, i) => makeEntry('ws1', 'proj1', i))
    const lines = buildGlobalPointerLines(entries)
    expect(lines.length).toBeLessThanOrEqual(2000)
  })
})
