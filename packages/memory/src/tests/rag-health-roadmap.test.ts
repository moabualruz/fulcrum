import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getDb } from 'fulcrum-agent-core'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { buildRagHealthReport } from '../setup/rag-health.js'

beforeEach(() => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
})

afterEach(() => {
  resetTestDb()
})

describe('RAG roadmap health status', () => {
  it('keeps required domains degraded unless explicitly marked out of scope', () => {
    getDb().prepare(`
      INSERT INTO memories (
        memory_id, workspace_id, project_id, kind, scope, content, content_hash,
        schema_version, vault_path, title, summary, entities, provenance
      ) VALUES (
        'mem_needs_graph', 'ws_1', 'proj_1', 'fact', 'project',
        'graph coverage source', 'hash-needs-graph',
        3, 'curated/pages/mem_needs_graph.md', 'graph', 'graph', '[]', '{}'
      )
    `).run()

    const required = buildRagHealthReport({ workspace_id: 'ws_1', project_id: 'proj_1' })
    expect(required.domains['graph']).toMatchObject({
      status: 'degraded',
      coverage_gaps: expect.arrayContaining(['memory']),
    })

    const excluded = buildRagHealthReport({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      out_of_scope_domains: ['graph', 'vectors'],
    })
    expect(excluded.domains['graph']).toMatchObject({
      status: 'out_of_scope',
      out_of_scope_reason: 'explicitly_excluded',
    })
    expect(excluded.domains['vectors']).toMatchObject({ status: 'out_of_scope' })
  })

  it('scopes recommended repair commands and keeps non-dev vector repair profile-safe', () => {
    getDb().prepare(`
      INSERT INTO memories (
        memory_id, workspace_id, project_id, kind, scope, content, content_hash,
        schema_version, vault_path, title, summary, entities, provenance
      ) VALUES (
        'mem_profile_repair', 'ws_1', 'proj_1', 'fact', 'project',
        'profile scoped repair source', 'hash-profile-repair',
        3, 'curated/pages/mem_profile_repair.md', 'profile repair', 'profile repair', '[]', '{}'
      )
    `).run()
    getDb().prepare(`
      INSERT INTO embedding_jobs (
        job_id, workspace_id, project_id, source_domain, status,
        requested_provider, requested_model, requested_device, dimensions
      ) VALUES ('job_profile_repair', 'ws_1', 'proj_1', 'memories', 'degraded', 'local', 'test-model', 'auto', 1024)
    `).run()
    getDb().prepare(`
      INSERT INTO embedding_job_items (
        job_item_id, job_id, workspace_id, source_domain, source_id,
        source_content_hash, requested_provider, requested_model, requested_device,
        dimensions, status, attempts, error_type, error_message
      ) VALUES (
        'jobitem_profile_repair', 'job_profile_repair', 'ws_1', 'memories', 'mem_profile_repair',
        'hash-profile-repair', 'local', 'test-model', 'auto', 1024, 'failed', 2, 'TimeoutError', 'timed out'
      )
    `).run()

    const installReport = buildRagHealthReport({ workspace_id: 'ws_1', project_id: 'proj_1', runtime_profile: 'install' })
    const installActions = installReport.recommended_actions.join('\n')

    expect(installActions).toContain('fulcrum memory rebuild --domain graph --workspace-id ws_1 --project-id proj_1 --execute --profile install --confirm-profile install --json')
    expect(installActions).toContain('Vector repair for runtime_profile install requires profile-aware embedding support')
    expect(installActions).toContain('Embedding job retry for runtime_profile install requires profile-aware job execution')
    expect(installActions).not.toContain('fulcrum memory embed --scope')
    expect(installActions).not.toContain('fulcrum jobs retry')

    const devReport = buildRagHealthReport({ workspace_id: 'ws_1', project_id: 'proj_1', runtime_profile: 'dev' })
    const devActions = devReport.recommended_actions.join('\n')

    expect(devActions).toContain('fulcrum memory embed --scope memories --workspace-id ws_1 --project-id proj_1 --json')
    expect(devActions).toContain('fulcrum memory embed --scope code --workspace-id ws_1 --project-id proj_1 --json')
    expect(devActions).toContain('fulcrum jobs retry <job_id> --failed --workspace-id ws_1 --project-id proj_1 --json')
  })
})
