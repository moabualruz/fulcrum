// packages/memory/src/tests/kuzu-upsert.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { KuzuClient } from '../kuzu/client.js'
import { upsertMemoryToKuzu, removeMemoryFromKuzu } from '../kuzu/upsert.js'
import type { FullMemory } from '../types.js'

let kuzuPath: string
let client: KuzuClient

const baseMemory: FullMemory = {
  memory_id: '01JBXKUZU0000000000000TEST1',
  scope: 'project',
  kind: 'decision',
  workspace_id: 'ws_test',
  project_id: 'proj_test',
  file_path: null,
  symbol_path: null,
  title: 'Use [[technology/rust]] for performance',
  summary: 'Rust chosen for safety',
  canonical_text: 'We decided to use [[technology/rust]]. See src/lib.ts for details. tsk_test123',
    content: typeof 'We decided to use [[technology/rust]]. See src/lib.ts for details. tsk_test123' === 'string' ? 'We decided to use [[technology/rust]]. See src/lib.ts for details. tsk_test123' : '',
  tags: ['architecture'],
  entities: [],
  confidence: 0.9,
  freshness: 1.0,
  importance: 0.8,
  access_count: 0,
  event_time: null,
  content_hash: null,
  task_id: 'tsk_test123',
  issue_id: null,
  artifact_id: null,
  provenance_refs: [],
  created_at: '2026-04-14T10:00:00Z',
  updated_at: '2026-04-14T10:00:00Z',
  last_accessed_at: '2026-04-14T10:00:00Z',
}

beforeEach(async () => {
  kuzuPath = mkdtempSync(join(tmpdir(), 'fulcrum-kuzu-test-'))
  client = await KuzuClient.create({ dbPath: kuzuPath })
})

afterEach(async () => {
  await client.close()
  rmSync(kuzuPath, { recursive: true, force: true })
})

describe('upsertMemoryToKuzu', () => {
  it('creates a Memory node', async () => {
    await upsertMemoryToKuzu(client, baseMemory, null)
    const rows = await client.query<{ m: { id: string } }>(
      `MATCH (m:Memory {id: $id}) RETURN m`,
      { id: baseMemory.memory_id }
    )
    expect(rows).toHaveLength(1)
  })

  it('creates Entity nodes for wikilinks in content', async () => {
    await upsertMemoryToKuzu(client, baseMemory, null)
    const rows = await client.query<{ e: { canonical_name: string } }>(
      `MATCH (e:Entity {canonical_name: 'rust'}) RETURN e`
    )
    expect(rows).toHaveLength(1)
  })

  it('creates MENTIONS edges', async () => {
    await upsertMemoryToKuzu(client, baseMemory, null)
    const rows = await client.query(
      `MATCH (m:Memory {id: $id})-[r:MENTIONS]->(e:Entity) RETURN r, e`,
      { id: baseMemory.memory_id }
    )
    expect(rows.length).toBeGreaterThan(0)
  })

  it('creates PRODUCED_IN edge for task_id', async () => {
    await upsertMemoryToKuzu(client, baseMemory, null)
    const rows = await client.query(
      `MATCH (m:Memory {id: $id})-[r:PRODUCED_IN]->(e:Entity) RETURN r, e`,
      { id: baseMemory.memory_id }
    )
    expect(rows.length).toBeGreaterThan(0)
  })

  it('is idempotent — second upsert replaces first', async () => {
    await upsertMemoryToKuzu(client, baseMemory, null)
    await upsertMemoryToKuzu(client, baseMemory, null)
    const rows = await client.query<{ m: { id: string } }>(
      `MATCH (m:Memory {id: $id}) RETURN m`,
      { id: baseMemory.memory_id }
    )
    expect(rows).toHaveLength(1)
  })
})

describe('removeMemoryFromKuzu', () => {
  it('removes Memory node and all edges', async () => {
    await upsertMemoryToKuzu(client, baseMemory, null)
    await removeMemoryFromKuzu(client, baseMemory.memory_id)
    const rows = await client.query(
      `MATCH (m:Memory {id: $id}) RETURN m`,
      { id: baseMemory.memory_id }
    )
    expect(rows).toHaveLength(0)
  })
})
