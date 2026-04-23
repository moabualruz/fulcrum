import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { getDb } from 'fulcrum-agent-core'
import { contentHash } from '../dedup.js'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { runMigration101MemoryV3Lifecycle } from '../schema.js'
import { writeVectorMetadata } from '../l2/vector-metadata.js'
import { buildRagRepairPlan } from '../setup/rag-repair.js'

let tmpVault: string
let prevVaultPath: string | undefined

beforeEach(() => {
  const db = createTestDb()
  runMigration101MemoryV3Lifecycle(db)
  seedWorkspaceAndProject(db)
  tmpVault = join(tmpdir(), `fulcrum-rag-repair-${Date.now()}-${Math.random().toString(16).slice(2)}`)
  mkdirSync(tmpVault, { recursive: true })
  prevVaultPath = process.env['FULCRUM_VAULT_PATH']
  process.env['FULCRUM_VAULT_PATH'] = tmpVault
})

afterEach(() => {
  if (prevVaultPath === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultPath
  rmSync(tmpVault, { recursive: true, force: true })
  resetTestDb()
})

function writeScopedPage(relPath: string, body: string): void {
  const fullPath = join(tmpVault, relPath)
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, `---\nworkspace_id: ws_1\nproject_id: proj_1\n---\n${body}\n`, 'utf-8')
}

function seedCanonicalAndCodeState(): void {
  writeScopedPage('curated/pages/mem_repair.md', 'repair page')
  getDb().prepare(`
    INSERT INTO memories (
      memory_id, workspace_id, project_id, kind, scope, content, content_hash,
      schema_version, vault_path, title, summary, entities, provenance
    ) VALUES (
      'mem_repair', 'ws_1', 'proj_1', 'fact', 'project',
      'repair page', ?, 3, 'curated/pages/mem_repair.md',
      'repair', 'repair', '[]', '{}'
    )
  `).run(contentHash('repair page'))
  getDb().prepare(`
    INSERT INTO code_files (
      file_id, workspace_id, project_id, rel_path, language, sha256,
      mtime_ns, size_bytes, chunks_count, indexed_at
    ) VALUES ('file_1', 'ws_1', 'proj_1', 'src/a.ts', 'typescript', 'sha-a', 0, 10, 1, 0)
  `).run()
  getDb().prepare(`
    INSERT INTO code_chunks (
      chunk_id, workspace_id, project_id, file_path, file_id,
      chunk_strategy, source_type, content, content_hash
    ) VALUES (
      'chunk_1', 'ws_1', 'proj_1', 'src/a.ts', 'file_1', 'syntax', 'code', 'export const value = 1', 'chunk-hash'
    )
  `).run()
}

describe('RAG repair orchestrator', () => {
  it('builds targeted repair with ordered dependencies and verification steps', () => {
    seedCanonicalAndCodeState()
    getDb().prepare(`
      UPDATE code_files
         SET status = 'failed'
       WHERE file_id = 'file_1'
    `).run()
    writeVectorMetadata({
      workspace_id: 'ws_1',
      source_domain: 'memory',
      source_id: 'mem_repair',
      content_hash: contentHash('repair page'),
      provider: 'local',
      model: 'test-model',
      requested_device: 'auto',
      actual_device: 'cpu',
      dimensions: 1024,
      vector_table: 'vec_memories',
      status: 'failed',
      error_type: 'TimeoutError',
      error_message: 'timed out',
    })

    const plan = buildRagRepairPlan({ workspace_id: 'ws_1', project_id: 'proj_1' })

    expect(plan.strategy).toBe('targeted_repair')
    expect(plan.clean_slate_required).toBe(false)
    expect(plan.targeted_domains).toEqual(expect.arrayContaining(['code', 'vectors', 'graph']))
    expect(plan.execution_order.indexOf('code')).toBeLessThan(plan.execution_order.indexOf('vectors'))
    expect(plan.required_actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'repair_code_index', domain: 'code', phase: 'repair' }),
      expect.objectContaining({ action: 'embed_code_vectors', domain: 'vectors', phase: 'repair' }),
      expect.objectContaining({ action: 'repair_graph', domain: 'graph', phase: 'repair' }),
    ]))
    expect(plan.required_actions.find(action => action.action === 'embed_code_vectors')).toMatchObject({
      depends_on: expect.arrayContaining(['repair_code_index']),
    })
    expect(plan.required_actions.find(action => action.action === 'repair_graph')).toMatchObject({
      depends_on: expect.arrayContaining(['repair_code_index']),
    })
    expect(plan.verification_steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ step: 'verify_rag_health', blocking: true }),
      expect.objectContaining({ domain: 'code' }),
      expect.objectContaining({ domain: 'vectors' }),
      expect.objectContaining({ domain: 'graph' }),
    ]))
    expect(plan.verification_steps.find(step => step.step === 'verify_rag_health')).toMatchObject({
      depends_on: expect.arrayContaining(['repair_code_index', 'embed_vectors', 'embed_code_vectors', 'repair_graph']),
    })
    expect(plan.blocking_conditions).toEqual([])
    expect(plan.next_action).toBe('targeted_repair')
  })

  it('distinguishes clean-slate rebuild when derived state drift is irreconcilable', () => {
    seedCanonicalAndCodeState()
    getDb().prepare(`
      INSERT INTO code_chunks (
        chunk_id, workspace_id, project_id, file_path, file_id,
        chunk_strategy, source_type, content, content_hash
      ) VALUES (
        'chunk_orphan', 'ws_1', 'proj_1', 'src/orphan.ts', 'missing_file', 'syntax', 'code', 'export const orphan = true', 'orphan-hash'
      )
    `).run()
    writeVectorMetadata({
      workspace_id: 'ws_1',
      source_domain: 'memory',
      source_id: 'missing_memory',
      content_hash: 'missing-hash',
      provider: 'local',
      model: 'test-model',
      requested_device: 'auto',
      actual_device: 'cpu',
      dimensions: 1024,
      vector_table: 'vec_memories',
      status: 'stale',
    })

    const plan = buildRagRepairPlan({ workspace_id: 'ws_1', project_id: 'proj_1' })

    expect(plan.strategy).toBe('clean_slate_rebuild')
    expect(plan.clean_slate_required).toBe(true)
    expect(plan.clean_slate_domains).toEqual(expect.arrayContaining(['code', 'vectors']))
    expect(plan.next_action).toBe('clean_slate_rebuild')
    expect(plan.required_actions
      .filter(action => action.domain === 'code' || action.domain === 'vectors')
      .every(action => action.clean_slate === true)).toBe(true)
  })

  it('returns blocking conditions instead of mutating canonical sources', () => {
    getDb().prepare(`
      INSERT INTO memories (
        memory_id, workspace_id, project_id, kind, scope, content, content_hash,
        schema_version, vault_path, title, summary, entities, provenance
      ) VALUES (
        'mem_missing', 'ws_1', 'proj_1', 'fact', 'project',
        'missing page', ?, 3, 'curated/pages/mem_missing.md',
        'missing', 'missing', '[]', '{}'
      )
    `).run(contentHash('missing page'))

    const plan = buildRagRepairPlan({ workspace_id: 'ws_1', project_id: 'proj_1' })

    expect(plan.strategy).toBe('blocked')
    expect(plan.blocking_conditions).toEqual(expect.arrayContaining([
      expect.objectContaining({ domain: 'l1', reason: expect.stringContaining('canonical') }),
    ]))
    expect(plan.mutation_scope).toMatchObject({ canonical_sources_mutated: false, derived_state_only: true })
    expect(plan.required_actions).toEqual([])
    expect(plan.next_action).toBe('review_blockers')
  })
})
