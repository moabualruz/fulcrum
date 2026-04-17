// packages/memory/src/tests/pipeline.test.ts
// Verifies that runExtractionPipeline upserts a Memory node into Kuzu when the client is ready.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { KuzuClient, setKuzuClient, getKuzuClient } from '../kuzu/client.js'
import { runExtractionPipeline, enqueueForL2 } from '../extractors/pipeline.js'
import type { FullMemory } from '../types.js'

let kuzuPath: string
let vaultPath: string
let client: KuzuClient

const testMemory: FullMemory = {
  memory_id: 'mem_pipeline_test_001',
  scope: 'project',
  kind: 'decision',
  workspace_id: 'ws_pipe',
  project_id: 'proj_pipe',
  file_path: null,
  symbol_path: null,
  title: 'Pipeline test memory',
  summary: 'Tests that runExtractionPipeline upserts the Memory node',
  canonical_text: 'A decision was made about [[technology/typescript]] usage.',
    content: typeof 'A decision was made about [[technology/typescript]] usage.' === 'string' ? 'A decision was made about [[technology/typescript]] usage.' : '',
  tags: ['pipeline'],
  entities: [],
  confidence: 0.9,
  freshness: 1.0,
  importance: 0.7,
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

beforeEach(async () => {
  kuzuPath = mkdtempSync(join(tmpdir(), 'fulcrum-pipeline-test-'))
  vaultPath = mkdtempSync(join(tmpdir(), 'fulcrum-vault-test-'))
  mkdirSync(join(vaultPath, '.queue'), { recursive: true })
  client = await KuzuClient.create({ dbPath: kuzuPath })
  setKuzuClient(client)
})

afterEach(async () => {
  setKuzuClient(null)
  await client.close()
  rmSync(kuzuPath, { recursive: true, force: true })
  rmSync(vaultPath, { recursive: true, force: true })
})

describe('runExtractionPipeline', () => {
  it('upserts Memory node into Kuzu when client is ready', async () => {
    await runExtractionPipeline(vaultPath, testMemory)

    const rows = await client.query<{ m: { id: string } }>(
      `MATCH (m:Memory {id: $id}) RETURN m`,
      { id: testMemory.memory_id }
    )
    expect(rows).toHaveLength(1)
  })

  it('sets correct fields on the Memory node', async () => {
    await runExtractionPipeline(vaultPath, testMemory)

    type MemRow = { 'm.id': string; 'm.kind': string; 'm.scope': string; 'm.workspace_id': string }
    const rows = await client.query<MemRow>(
      `MATCH (m:Memory {id: $id}) RETURN m.id, m.kind, m.scope, m.workspace_id`,
      { id: testMemory.memory_id }
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.['m.id']).toBe(testMemory.memory_id)
    expect(rows[0]?.['m.kind']).toBe('decision')
    expect(rows[0]?.['m.scope']).toBe('project')
    expect(rows[0]?.['m.workspace_id']).toBe('ws_pipe')
  })

  it('is a no-op when KuzuClient is not set', async () => {
    setKuzuClient(null)
    // Should not throw
    await expect(runExtractionPipeline(vaultPath, testMemory)).resolves.toBeUndefined()
  })

  it('is idempotent — re-running does not error', async () => {
    await runExtractionPipeline(vaultPath, testMemory)
    await expect(runExtractionPipeline(vaultPath, testMemory)).resolves.toBeUndefined()

    const rows = await client.query<{ m: { id: string } }>(
      `MATCH (m:Memory {id: $id}) RETURN m`,
      { id: testMemory.memory_id }
    )
    // Still exactly one node after second run
    expect(rows).toHaveLength(1)
  })
})

describe('enqueueForL2', () => {
  it('writes a JSONL line to .queue/l2-pending.jsonl', () => {
    enqueueForL2(vaultPath, 'mem_q_001', 'ws_q')
    const content = readFileSync(join(vaultPath, '.queue', 'l2-pending.jsonl'), 'utf-8')
    const parsed = JSON.parse(content.trim()) as { memory_id: string; workspace_id: string }
    expect(parsed.memory_id).toBe('mem_q_001')
    expect(parsed.workspace_id).toBe('ws_q')
  })
})
