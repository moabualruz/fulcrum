import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { indexCodeFile } from '../l2/code.js'
import { searchCode, type SearchCodeInput } from '../retrieval/search-code.js'

type RoadmapSearchCodeInput = SearchCodeInput & {
  package?: string
  module?: string
  dependency?: string
  changed_files?: string[]
}

describe('searchCode roadmap ranking signals', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
    seedWorkspaceAndProject(db, 'ws_code_rank', 'proj_code_rank')
  })

  afterEach(() => resetTestDb())

  async function seed(rel_path: string, content: string, symbolPath: string, indexedAt: number): Promise<void> {
    await indexCodeFile({
      workspace_id: 'ws_code_rank',
      project_id: 'proj_code_rank',
      rel_path,
      content,
      language: 'typescript',
      indexed_at: indexedAt,
      chunker: () => [{
        text: content,
        strategy: 'syntax',
        sourceType: 'code',
        symbolPath,
        startLine: 10,
        endLine: 14,
      }],
    }, db)
  }

  it('weights path, package/module, changed-file, and recency hints as explainable stages', async () => {
    await seed(
      'packages/cli/src/index.ts',
      'export function adapterEntrypoint() { return "adapter ranking token" }',
      'cli.adapterEntrypoint',
      1,
    )
    await seed(
      'packages/memory/src/retrieval/search-code.ts',
      'export function adapterSearchCode() { return "adapter ranking token" }',
      'memory.retrieval.adapterSearchCode',
      2,
    )

    const out = await searchCode({
      workspace_id: 'ws_code_rank',
      project_id: 'proj_code_rank',
      text: 'adapter ranking token',
      path: 'retrieval/search-code.ts',
      package: 'packages/memory',
      module: 'retrieval',
      changed_files: ['packages/memory/src/retrieval/search-code.ts'],
      explain: true,
      limit: 5,
    } satisfies RoadmapSearchCodeInput, db)

    expect(out.results[0]?.rel_path).toBe('packages/memory/src/retrieval/search-code.ts')
    expect(out.results[0]?.stage_contributions.map(stage => stage.stage)).toEqual(expect.arrayContaining([
      'path',
      'package',
      'module',
      'changed_file',
      'recency',
    ]))
    expect(out.results[0]?.stage_scores['recency']).toBeGreaterThan(0)
    expect(out.results[0]?.freshness).toBe('current')
  })

  it('weights suffix symbol matches and dependency imports without requiring exact symbol equality', async () => {
    await seed(
      'packages/memory/src/l2/code.ts',
      'import Database from "better-sqlite3"\nexport function storeChunkEmbedding() { return "dependency ranking token" }',
      'l2.storeChunkEmbedding',
      1,
    )
    await seed(
      'packages/memory/src/l2/embed.ts',
      'export function storeTextEmbedding() { return "dependency ranking token" }',
      'l2.storeTextEmbedding',
      2,
    )

    const out = await searchCode({
      workspace_id: 'ws_code_rank',
      project_id: 'proj_code_rank',
      text: 'dependency ranking token',
      symbol: 'storeChunkEmbedding',
      dependency: 'better-sqlite3',
      explain: true,
      limit: 5,
    } satisfies RoadmapSearchCodeInput, db)

    expect(out.results[0]?.rel_path).toBe('packages/memory/src/l2/code.ts')
    expect(out.results[0]?.symbol_path).toBe('l2.storeChunkEmbedding')
    expect(out.results[0]?.stage_contributions.map(stage => stage.stage)).toEqual(expect.arrayContaining([
      'symbol',
      'dependency',
    ]))
  })

  it('finds dependency and changed-file candidates before recency limits are applied', async () => {
    for (let i = 0; i < 60; i += 1) {
      await seed(
        `packages/cli/src/noise-${i}.ts`,
        `export function recentNoise${i}() { return "noise" }`,
        `cli.recentNoise${i}`,
        1000 + i,
      )
    }
    await seed(
      'packages/memory/src/l2/old-dependency.ts',
      'import Database from "better-sqlite3"\nexport function oldDependencyHit() { return true }',
      'l2.oldDependencyHit',
      1,
    )

    const out = await searchCode({
      workspace_id: 'ws_code_rank',
      project_id: 'proj_code_rank',
      package: 'packages',
      dependency: 'better-sqlite3',
      changed_files: ['packages/memory/src/l2/old-dependency.ts'],
      explain: true,
      limit: 5,
    } satisfies RoadmapSearchCodeInput, db)

    expect(out.results[0]?.rel_path).toBe('packages/memory/src/l2/old-dependency.ts')
    expect(out.results[0]?.stage_contributions.map(stage => stage.stage)).toEqual(expect.arrayContaining([
      'package',
      'dependency',
      'changed_file',
    ]))
  })

  it('redacts secrets and absolute paths before writing search_code recall events', async () => {
    await seed(
      'packages/memory/src/retrieval/search-code.ts',
      'export function redactionHit() { return "redaction ranking token /home/mkh/private/source.ts token=sk-proj-secretsecretsecretsecretsecretsecretsecretsecret" }',
      'memory.retrieval.redactionHit',
      1,
    )

    await searchCode({
      workspace_id: 'ws_code_rank',
      project_id: 'proj_code_rank',
      text: 'redaction ranking token /home/mkh/private/source.ts token=sk-proj-secretsecretsecretsecretsecretsecretsecretsecret',
      explain: true,
      persist: true,
      limit: 1,
    }, db)

    const row = db.prepare(`
      SELECT query
        FROM memory_recall_events
       WHERE source = 'search_code'
       ORDER BY id DESC
       LIMIT 1
    `).get() as { query: string }
    expect(row.query).not.toContain('/home/')
    expect(row.query).not.toContain('sk-proj')
    expect(row.query).toContain('[REDACTED_PATH:')
  })

  it('clamps oversized limits before expanding candidate fetches', async () => {
    for (let i = 0; i < 80; i += 1) {
      await seed(
        `packages/memory/src/limit-${i}.ts`,
        `export function limitHit${i}() { return "limit clamp token" }`,
        `memory.limitHit${i}`,
        i,
      )
    }

    const out = await searchCode({
      workspace_id: 'ws_code_rank',
      project_id: 'proj_code_rank',
      text: 'limit clamp token',
      limit: 5000,
    }, db)

    expect(out.results).toHaveLength(50)
  })
})
