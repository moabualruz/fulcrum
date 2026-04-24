import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getDb, resolveRuntimeDataProfile } from 'fulcrum-agent-core'
import { contentHash } from '../dedup.js'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { runMigration101MemoryV3Lifecycle } from '../schema.js'
import { writeVectorMetadata } from '../l2/vector-metadata.js'
import { buildRagHealthReport } from '../setup/rag-health.js'

let tmpVault: string
let prevVaultPath: string | undefined

beforeEach(() => {
  const db = createTestDb()
  runMigration101MemoryV3Lifecycle(db)
  seedWorkspaceAndProject(db)
  tmpVault = join(tmpdir(), `fulcrum-rag-health-${Date.now()}-${Math.random().toString(16).slice(2)}`)
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

function scopedMarkdown(body: string, workspaceId = 'ws_1', projectId = 'proj_1'): string {
  return `---
workspace_id: ${workspaceId}
project_id: ${projectId}
---
${body}`
}

function seedRawMismatch(): void {
  const rawDir = join(tmpVault, 'raw', 'bash_trace', '2026', '04', '23')
  mkdirSync(rawDir, { recursive: true })
  writeFileSync(join(rawDir, 'src_present.md'), scopedMarkdown('present raw\n'), 'utf-8')
  writeFileSync(join(rawDir, 'src_orphan.md'), scopedMarkdown('orphan raw\n'), 'utf-8')

  getDb().prepare(`
    INSERT INTO l0_sources (
      source_id, source_type, workspace_id, project_id, vault_path, content_hash, size_bytes
    ) VALUES
      ('src_present', 'bash_trace', 'ws_1', 'proj_1', 'raw/bash_trace/2026/04/23/src_present.md', 'h1', 12),
      ('src_missing', 'bash_trace', 'ws_1', 'proj_1', 'raw/bash_trace/2026/04/23/src_missing.md', 'h2', 12)
  `).run()
}

function seedL1MissingFile(): void {
  getDb().prepare(`
    INSERT INTO memories (
      memory_id, workspace_id, project_id, kind, scope, content, content_hash,
      schema_version, vault_path, title, summary, entities, provenance
    ) VALUES (
      'mem_health', 'ws_1', 'proj_1', 'fact', 'project', 'health body', ?,
      3, 'curated/pages/mem_health.md', 'health', 'health', '[]', '{}'
    )
  `).run(contentHash('health body'))
}

function seedCodeDrift(): void {
  getDb().prepare(`
    INSERT INTO code_files (
      file_id, workspace_id, project_id, rel_path, language, sha256,
      mtime_ns, size_bytes, chunks_count, indexed_at
    ) VALUES ('file_1', 'ws_1', 'proj_1', 'src/a.ts', 'typescript', 'sha-a', 0, 10, 2, 0)
  `).run()
  getDb().prepare(`
    INSERT INTO code_chunks (
      chunk_id, workspace_id, project_id, file_path, file_id,
      chunk_strategy, source_type, content, content_hash
    ) VALUES
      ('chunk_1', 'ws_1', 'proj_1', 'src/a.ts', 'file_1', 'syntax', 'code', 'body one', 'ch1'),
      ('chunk_orphan', 'ws_1', 'proj_1', 'src/missing.ts', 'file_missing', 'syntax', 'code', 'body two', 'ch2')
  `).run()
}

function seedFtsRows(): { memoryRowid: number; codeChunkRowid: number } {
  getDb().prepare(`
    INSERT INTO memories (
      memory_id, workspace_id, project_id, kind, scope, content, content_hash,
      schema_version, vault_path, title, summary, entities, provenance
    ) VALUES (
      'mem_fts', 'ws_1', 'proj_1', 'fact', 'project', 'uniquehealthtoken memory', ?,
      3, 'curated/pages/mem_fts.md', 'healthtoken title', 'healthtoken summary', '[]', '{}'
    )
  `).run(contentHash('uniquehealthtoken memory'))
  getDb().prepare(`
    INSERT INTO code_files (
      file_id, workspace_id, project_id, rel_path, language, sha256,
      mtime_ns, size_bytes, chunks_count, indexed_at
    ) VALUES ('file_fts', 'ws_1', 'proj_1', 'src/fts.ts', 'typescript', 'sha-fts', 0, 10, 1, 0)
  `).run()
  getDb().prepare(`
    INSERT INTO code_chunks (
      chunk_id, workspace_id, project_id, file_path, file_id,
      chunk_strategy, source_type, content, content_hash, symbol_path
    ) VALUES (
      'chunk_fts', 'ws_1', 'proj_1', 'src/fts.ts', 'file_fts',
      'syntax', 'code', 'uniquecodehealthtoken code', 'code-hash', 'health.symbol'
    )
  `).run()
  const memory = getDb().prepare("SELECT rowid FROM memories WHERE memory_id = 'mem_fts'").get() as { rowid: number }
  const code = getDb().prepare("SELECT rowid FROM code_chunks WHERE chunk_id = 'chunk_fts'").get() as { rowid: number }
  return { memoryRowid: memory.rowid, codeChunkRowid: code.rowid }
}

function seedVectorAndJobFailures(): void {
  writeVectorMetadata({
    workspace_id: 'ws_1',
    source_domain: 'memory',
    source_id: 'mem_health',
    content_hash: 'old-hash',
    provider: 'local',
    model: 'old-model',
    requested_device: 'auto',
    actual_device: 'cpu',
    dimensions: 1024,
    vector_table: 'vec_memories',
    status: 'stale',
  })
  writeVectorMetadata({
    workspace_id: 'ws_1',
    source_domain: 'code_chunk',
    source_id: 'chunk_1',
    content_hash: 'ch1',
    provider: 'local',
    model: 'test-model',
    requested_device: 'cuda',
    actual_device: 'cpu',
    dimensions: 1024,
    vector_table: 'vec_chunks',
    status: 'failed',
    error_type: 'DeviceMismatch',
    error_message: 'requested device unavailable',
  })
  getDb().prepare(`
    INSERT INTO embedding_jobs (
      job_id, workspace_id, project_id, source_domain, status,
      requested_provider, requested_model, requested_device, dimensions
    ) VALUES ('job_health', 'ws_1', 'proj_1', 'memories', 'degraded', 'local', 'test-model', 'auto', 1024)
  `).run()
  getDb().prepare(`
    INSERT INTO embedding_job_items (
      job_item_id, job_id, workspace_id, source_domain, source_id,
      source_content_hash, requested_provider, requested_model, requested_device,
      dimensions, status, attempts, error_type, error_message
    ) VALUES (
      'jobitem_health', 'job_health', 'ws_1', 'memories', 'mem_health',
      ?, 'local', 'test-model', 'auto', 1024, 'failed', 2, 'TimeoutError', 'timed out'
    )
  `).run(contentHash('health body'))
  getDb().prepare(`
    INSERT INTO rag_job_events (
      event_id, job_id, workspace_id, event_type, source_id, message, details
    ) VALUES (
      'ragevent_health', 'job_health', 'ws_1', 'split', 'mem_health',
      'embedding batch failed; reducing batch size', '{"from":2,"to":[1,1]}'
    )
  `).run()
}

describe('RAG health report', () => {
  it('reports healthy empty workspaces with all expected domains', () => {
    const report = buildRagHealthReport({ workspace_id: 'ws_1', project_id: 'proj_1' })

    expect(report.status).toBe('healthy')
    expect(report.domains).toHaveProperty('l0')
    expect(report.domains).toHaveProperty('l1')
    expect(report.domains).toHaveProperty('fts')
    expect(report.domains).toHaveProperty('code')
    expect(report.domains).toHaveProperty('vectors')
    expect(report.domains).toHaveProperty('graph')
    expect(report.recommended_actions).toEqual([])
  })

  it('uses the selected runtime profile vault when profile is explicit', () => {
    const dataDir = join(tmpdir(), `fulcrum-rag-health-profile-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    const manifest = resolveRuntimeDataProfile({ profile: 'test', data_dir: dataDir })
    const rawDir = join(manifest.paths.vault, 'raw', 'bash_trace', '2026', '04', '23')
    mkdirSync(rawDir, { recursive: true })
    writeFileSync(join(rawDir, 'src_orphan.md'), scopedMarkdown('orphan raw\n'), 'utf-8')

    try {
      const report = buildRagHealthReport({
        workspace_id: 'ws_1',
        project_id: 'proj_1',
        runtime_profile: 'test',
        data_dir: dataDir,
      })

      expect(report.profile_manifest).not.toHaveProperty('paths')
      expect(report.profile_manifest.path_fingerprints.vault).toBe(manifest.path_fingerprints.vault)
      expect(JSON.stringify(report)).not.toContain(manifest.paths.vault)
      expect(report.domains['l0']).toMatchObject({ files: 1, orphan_files: 1 })
    } finally {
      rmSync(dataDir, { recursive: true, force: true })
    }
  })

  it('identifies raw, L1, FTS, code, vector, embedding, and graph failures', () => {
    seedRawMismatch()
    seedL1MissingFile()
    seedCodeDrift()
    seedVectorAndJobFailures()
    getDb().exec('DROP TABLE code_chunks_fts')

    const report = buildRagHealthReport({ workspace_id: 'ws_1', project_id: 'proj_1' })
    const domains = report.domains as Record<string, Record<string, unknown>>

    expect(report.status).toBe('failed')
    expect(domains['l0']).toMatchObject({ status: 'degraded', rows: 2, missing_files: 1, orphan_files: 1 })
    expect(domains['l1']).toMatchObject({ status: 'degraded', rows: 1, missing_files: 1 })
    expect(domains['fts']).toMatchObject({ status: 'failed', checked: 2, failed: 1 })
    expect(domains['code']).toMatchObject({ status: 'degraded', files: 1, chunks: 2, orphan_chunks: 1, chunk_count_mismatches: 1 })
    expect(domains['vectors']).toMatchObject({
      status: 'degraded',
      stale: 1,
      failed: 1,
      failed_job_items: 1,
      recovery_events: 1,
    })
    expect(domains['graph']?.['status']).toBe('degraded')
    expect(domains['graph']?.['coverage_gaps']).toEqual(expect.arrayContaining(['memories', 'code']))
    expect(report.recommended_actions.join('\n')).toContain('raw-source')
    expect(report.recommended_actions.join('\n')).toContain('--profile dev')
    expect(report.recommended_actions.join('\n')).toContain('code index')
    expect(report.recommended_actions.join('\n')).toContain('jobs retry')
    expect(report.recommended_actions.join('\n')).toContain('graph')
  })

  it('does not count recovered embedding job failures as unresolved', () => {
    const body = 'recovered embedding body'
    const hash = contentHash(body)
    getDb().prepare(`
      INSERT INTO memories (memory_id, workspace_id, project_id, content, content_hash, schema_version)
      VALUES ('mem_recovered', 'ws_1', 'proj_1', ?, ?, 3)
    `).run(body, hash)
    getDb().prepare('INSERT INTO vec_memories(memory_id, embedding) VALUES (?, ?)').run('mem_recovered', Buffer.alloc(1024 * 4))
    writeVectorMetadata({
      workspace_id: 'ws_1',
      source_domain: 'memory',
      source_id: 'mem_recovered',
      content_hash: hash,
      provider: 'local',
      model: 'test-model',
      requested_device: 'auto',
      actual_device: 'cuda',
      dimensions: 1024,
      vector_table: 'vec_memories',
      status: 'current',
    })
    getDb().prepare(`
      INSERT INTO embedding_jobs (
        job_id, workspace_id, project_id, source_domain, status,
        requested_provider, requested_model, requested_device, dimensions
      ) VALUES ('job_recovered', 'ws_1', 'proj_1', 'l1_pages', 'degraded', 'local', 'unknown', 'auto', 1024)
    `).run()
    getDb().prepare(`
      INSERT INTO embedding_job_items (
        job_item_id, job_id, workspace_id, source_domain, source_id,
        source_content_hash, requested_provider, requested_model, requested_device,
        dimensions, status, attempts, error_type, error_message
      ) VALUES (
        'jobitem_recovered', 'job_recovered', 'ws_1', 'l1_pages', 'mem_recovered',
        ?, 'local', 'unknown', 'auto', 1024, 'failed', 1, 'Error', 'old failure'
      )
    `).run(hash)

    const report = buildRagHealthReport({ workspace_id: 'ws_1', project_id: 'proj_1' })
    const vectors = report.domains['vectors'] as Record<string, unknown>

    expect(vectors['failed']).toBe(0)
    expect(vectors['failed_job_items']).toBe(0)
    expect(vectors['failures_by_reason']).toEqual([])
  })

  it('marks orphan raw and curated vault files as degraded coverage mismatches', () => {
    const rawDir = join(tmpVault, 'raw', 'bash_trace', '2026', '04', '23')
    const curatedDir = join(tmpVault, 'curated', 'pages')
    mkdirSync(rawDir, { recursive: true })
    mkdirSync(curatedDir, { recursive: true })
    writeFileSync(join(rawDir, 'orphan.md'), scopedMarkdown('orphan raw\n'), 'utf-8')
    writeFileSync(join(curatedDir, 'orphan.md'), scopedMarkdown('orphan curated\n'), 'utf-8')

    const report = buildRagHealthReport({ workspace_id: 'ws_1', project_id: 'proj_1' })
    const domains = report.domains as Record<string, Record<string, unknown>>

    expect(domains['l0']).toMatchObject({ status: 'degraded', rows: 0, orphan_files: 1 })
    expect(domains['l1']).toMatchObject({ status: 'degraded', rows: 0, orphan_files: 1 })
    expect(report.recommended_actions.join('\n')).toContain('raw-source')
    expect(report.recommended_actions.join('\n')).toContain('curated L1')
  })

  it('ignores vault files outside the requested workspace and project scope', () => {
    const rawDir = join(tmpVault, 'raw', 'bash_trace', '2026', '04', '23')
    const curatedDir = join(tmpVault, 'curated', 'pages')
    mkdirSync(rawDir, { recursive: true })
    mkdirSync(curatedDir, { recursive: true })
    writeFileSync(join(rawDir, 'other-workspace.md'), scopedMarkdown('foreign raw\n', 'ws_other', 'proj_1'), 'utf-8')
    writeFileSync(join(curatedDir, 'other-project.md'), scopedMarkdown('foreign curated\n', 'ws_1', 'proj_other'), 'utf-8')

    const report = buildRagHealthReport({ workspace_id: 'ws_1', project_id: 'proj_1' })
    const domains = report.domains as Record<string, Record<string, unknown>>

    expect(domains['l0']).toMatchObject({ status: 'healthy', files: 0, orphan_files: 0 })
    expect(domains['l1']).toMatchObject({ status: 'healthy', files: 0, orphan_files: 0 })
  })

  it('reports FTS parity drift when backing rows are no longer searchable', () => {
    const { memoryRowid, codeChunkRowid } = seedFtsRows()
    getDb().prepare('DELETE FROM memories_fts WHERE rowid = ?').run(memoryRowid)
    getDb().prepare('DELETE FROM code_chunks_fts WHERE rowid = ?').run(codeChunkRowid)

    const report = buildRagHealthReport({ workspace_id: 'ws_1', project_id: 'proj_1' })
    const fts = report.domains['fts'] as Record<string, unknown>

    expect(fts).toMatchObject({
      status: 'failed',
      missing_index_rows: 2,
      memory_rows: 1,
      code_chunk_rows: 1,
    })
    expect(report.recommended_actions.join('\n')).toContain('text-search indexes')
  })

  it('scopes vector status and grouping to the requested project', () => {
    getDb().prepare("INSERT INTO projects(project_id, workspace_id, name) VALUES ('proj_2', 'ws_1', 'proj_2')").run()
    getDb().prepare(`
      INSERT INTO memories (
        memory_id, workspace_id, project_id, kind, scope, content, content_hash,
        schema_version, vault_path, title, summary, entities, provenance
      ) VALUES (
        'mem_other_project', 'ws_1', 'proj_2', 'fact', 'project', 'other project body', ?,
        3, 'curated/pages/mem_other_project.md', 'other', 'other', '[]', '{}'
      )
    `).run(contentHash('other project body'))
    writeVectorMetadata({
      workspace_id: 'ws_1',
      source_domain: 'memory',
      source_id: 'mem_other_project',
      content_hash: 'old-other-hash',
      provider: 'local',
      model: 'other-model',
      requested_device: 'cuda',
      actual_device: 'cpu',
      dimensions: 1024,
      vector_table: 'vec_memories',
      status: 'stale',
    })

    const report = buildRagHealthReport({ workspace_id: 'ws_1', project_id: 'proj_1' })
    const vectors = report.domains['vectors'] as Record<string, unknown>

    expect(vectors).toMatchObject({ status: 'healthy', stale: 0 })
    expect(vectors['groups']).toEqual([])
    expect(report.recommended_actions.join('\n')).not.toContain('vector coverage')
  })

  it('does not require vectors for legacy pre-v3 memory rows', () => {
    getDb().prepare(`
      INSERT INTO memories (
        memory_id, workspace_id, project_id, kind, scope, content, content_hash,
        schema_version, vault_path, title, summary, entities, provenance
      ) VALUES (
        'mem_legacy_health', 'ws_1', 'proj_1', 'fact', 'project', 'legacy body', NULL,
        2, 'memories/curated/mem_legacy_health.md', 'legacy', 'legacy', '[]', '{}'
      )
    `).run()

    const report = buildRagHealthReport({ workspace_id: 'ws_1', project_id: 'proj_1' })
    const vectors = report.domains['vectors'] as Record<string, unknown>

    expect(vectors).toMatchObject({ status: 'healthy', missing_memory_metadata: 0 })
  })

  it('does not mask current-project orphan chunks with same file id in another project', () => {
    getDb().prepare("INSERT INTO projects(project_id, workspace_id, name) VALUES ('proj_2', 'ws_1', 'proj_2')").run()
    getDb().prepare(`
      INSERT INTO code_files (
        file_id, workspace_id, project_id, rel_path, language, sha256,
        mtime_ns, size_bytes, chunks_count, indexed_at
      ) VALUES ('shared_file_id', 'ws_1', 'proj_2', 'src/shared.ts', 'typescript', 'sha-shared', 0, 10, 1, 0)
    `).run()
    getDb().prepare(`
      INSERT INTO code_chunks (
        chunk_id, workspace_id, project_id, file_path, file_id,
        chunk_strategy, source_type, content, content_hash
      ) VALUES (
        'chunk_cross_project_orphan', 'ws_1', 'proj_1', 'src/shared.ts', 'shared_file_id',
        'syntax', 'code', 'cross project orphan', 'cross-project-orphan'
      )
    `).run()

    const report = buildRagHealthReport({ workspace_id: 'ws_1', project_id: 'proj_1' })
    const code = report.domains['code'] as Record<string, unknown>

    expect(code).toMatchObject({ status: 'degraded', orphan_chunks: 1 })
  })

  it('does not persist health reports unless explicitly requested', () => {
    seedL1MissingFile()
    const before = getDb().prepare('SELECT COUNT(*) AS n FROM rag_health_reports').get() as { n: number }

    buildRagHealthReport({ workspace_id: 'ws_1', project_id: 'proj_1' })

    const after = getDb().prepare('SELECT COUNT(*) AS n FROM rag_health_reports').get() as { n: number }
    expect(after.n).toBe(before.n)
  })
})
