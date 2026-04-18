// packages/memory/src/tests/l2-pipeline.test.ts
//
// Memory v3 PR 4 unit 4.4 — end-to-end L2 pipeline integration test.
//
// Proves the full L0 → L1 → L2 chain under real infrastructure (DB,
// vault, stub curator backend, stub embedder):
//
//   ingestRawSource (L0 file + row)
//     → runCurator (stub backend returns a plan-shaped CuratorOutput)
//     → applyCuratorOutput (writes L1 pages, triggers recordL1Embedding)
//     → flushPendingMemoryWrites (drains the embed queue)
//     → COUNT(*) FROM vec_memories == COUNT(*) FROM memories
//        WHERE schema_version >= 3    ← PR 4 Verify gate
//
// Then walks the supersession path once more to confirm the old
// vec_memories row stays put (audit invariant) while the new page's row
// lands alongside it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  createTestDb,
  resetTestDb,
  seedWorkspaceAndProject,
  registerStubEmbedder,
  unregisterStubEmbedder,
} from './helpers.js'
import { getDb } from 'fulcrum-agent-core'
import { runMigration101MemoryV3Lifecycle } from '../schema.js'
import { ingestRawSource } from '../l0/ingest.js'
import { runCurator, registerBackend, clearBackendsForTest } from '../l1/curator.js'
import { applyCuratorOutput } from '../l1/apply.js'
import { flushPendingMemoryWrites } from '../l2/queue.js'
import type { CuratorBackend, CuratorBackendResult, CuratorOutput } from '../l1/curator.js'

let tmpVault: string
let prevVaultEnv: string | undefined

beforeEach(async () => {
  createTestDb()
  runMigration101MemoryV3Lifecycle(getDb())
  seedWorkspaceAndProject(getDb(), 'ws_l2', 'proj_l2')
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-l2-pipeline-'))
  prevVaultEnv = process.env['FULCRUM_VAULT_PATH']
  process.env['FULCRUM_VAULT_PATH'] = tmpVault
  await registerStubEmbedder()
  clearBackendsForTest()
})

afterEach(() => {
  clearBackendsForTest()
  unregisterStubEmbedder()
  resetTestDb()
  rmSync(tmpVault, { recursive: true, force: true })
  if (prevVaultEnv === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultEnv
})

function stubBackendReturning(output: CuratorOutput): CuratorBackend {
  const raw = JSON.stringify(output)
  return {
    name: 'codex',
    async isAvailable() { return true },
    async curate(input): Promise<CuratorBackendResult> {
      return { raw_text: raw, backend: 'codex', model: input.model, duration_ms: 1 }
    },
  }
}

describe('PR 4 unit 4.4 — L0 → L1 → L2 pipeline', () => {
  it('ingest → curate → apply populates vec_memories for every L1 page (Verify gate)', async () => {
    // 1. Ingest two L0 sources so the curator has a batch to cite.
    const alpha = ingestRawSource({
      source_type: 'bash_trace',
      body: 'pnpm build\nok\n',
      meta: { workspace_id: 'ws_l2', project_id: 'proj_l2', cwd: '/home/mkh' },
    })
    const beta = ingestRawSource({
      source_type: 'bash_trace',
      body: 'pnpm test\nok\n',
      meta: { workspace_id: 'ws_l2', project_id: 'proj_l2', cwd: '/home/mkh' },
    })

    // 2. Stub curator returns two new_pages citing the two L0 IDs.
    const output: CuratorOutput = {
      new_pages: [
        {
          type: 'page',
          name: null,
          title: 'Build pipeline',
          entity_type: null,
          aliases: null,
          confidence: 0.8,
          retention_tier: 'working',
          sources: [alpha.frontmatter.id],
          sources_via: [],
          entities: [],
          body: `# Build pipeline\n\nSee [[raw/bash_trace/${yyyyMmDd(alpha.frontmatter.created_at)}/${alpha.frontmatter.id}]].\n`,
        },
        {
          type: 'page',
          name: null,
          title: 'Test run',
          entity_type: null,
          aliases: null,
          confidence: 0.85,
          retention_tier: 'working',
          sources: [beta.frontmatter.id],
          sources_via: [],
          entities: [],
          body: `# Test run\n\nSee [[raw/bash_trace/${yyyyMmDd(beta.frontmatter.created_at)}/${beta.frontmatter.id}]].\n`,
        },
      ],
      updates: [],
      supersessions: [],
      new_edges: [],
    }
    registerBackend(stubBackendReturning(output))

    // 3. Run the curator, which returns the parsed output.
    const run = await runCurator({
      task: 'extraction',
      l0_sources: [
        { source_id: alpha.frontmatter.id, source_type: 'bash_trace', created_at: alpha.frontmatter.created_at, body: 'pnpm build\nok\n' },
        { source_id: beta.frontmatter.id, source_type: 'bash_trace', created_at: beta.frontmatter.created_at, body: 'pnpm test\nok\n' },
      ],
      workspace_id: 'ws_l2',
      project_id: 'proj_l2',
    })
    expect(run.output.new_pages).toHaveLength(2)

    // 4. Apply (triggers recordL1Embedding under the hood).
    const applied = applyCuratorOutput(run.output, {
      workspace_id: 'ws_l2',
      project_id: 'proj_l2',
      curator_input_sources: [alpha.frontmatter.id, beta.frontmatter.id],
    })
    expect(applied.created_page_ids).toHaveLength(2)

    // 5. Drain embeds.
    await flushPendingMemoryWrites(5_000)

    // 6. PR 4 Verify gate: vec_memories count equals L1 page count.
    const db = getDb()
    const pageCount = (db.prepare('SELECT COUNT(*) AS n FROM memories WHERE schema_version >= 3').get() as { n: number }).n
    const vecCount = (db.prepare('SELECT COUNT(*) AS n FROM vec_memories').get() as { n: number }).n
    expect(pageCount).toBe(2)
    expect(vecCount).toBe(pageCount)
    for (const id of applied.created_page_ids) {
      const row = db.prepare('SELECT memory_id FROM vec_memories WHERE memory_id = ?').get(id) as { memory_id: string } | undefined
      expect(row?.memory_id).toBe(id)
    }
  })

  it('supersession preserves the old vec_memories row while the new page lands', async () => {
    const l0 = ingestRawSource({
      source_type: 'bash_trace',
      body: 'pnpm lint\nfail\n',
      meta: { workspace_id: 'ws_l2', project_id: 'proj_l2', cwd: '/home/mkh' },
    })

    // First curator run creates the original page.
    const firstOutput: CuratorOutput = {
      new_pages: [{
        type: 'page', name: null, title: 'Lint status', entity_type: null, aliases: null,
        confidence: 0.5, retention_tier: 'working',
        sources: [l0.frontmatter.id], sources_via: [], entities: [],
        body: `# Lint status\n\nFails. See [[raw/bash_trace/${yyyyMmDd(l0.frontmatter.created_at)}/${l0.frontmatter.id}]].\n`,
      }],
      updates: [], supersessions: [], new_edges: [],
    }
    registerBackend(stubBackendReturning(firstOutput))
    const firstRun = await runCurator({
      task: 'extraction',
      l0_sources: [{ source_id: l0.frontmatter.id, source_type: 'bash_trace', created_at: l0.frontmatter.created_at, body: 'pnpm lint\nfail\n' }],
      workspace_id: 'ws_l2',
      project_id: 'proj_l2',
    })
    const firstApply = applyCuratorOutput(firstRun.output, {
      workspace_id: 'ws_l2', project_id: 'proj_l2',
      curator_input_sources: [l0.frontmatter.id],
    })
    const oldId = firstApply.created_page_ids[0]!
    await flushPendingMemoryWrites(5_000)

    const oldEmbedBefore = getDb()
      .prepare('SELECT embedding FROM vec_memories WHERE memory_id = ?')
      .get(oldId) as { embedding: Buffer }

    // Second run supersedes the first (contradicting claim — "lint passes").
    const secondOutput: CuratorOutput = {
      new_pages: [], updates: [],
      supersessions: [{
        old_page_id: oldId,
        reason: 'lint rerun now passes — prior claim was from the first failing run',
        new_page: {
          type: 'page', name: null, title: 'Lint status (corrected)', entity_type: null, aliases: null,
          confidence: 0.9, retention_tier: 'working',
          sources: [l0.frontmatter.id], sources_via: [], entities: [],
          body: `# Lint status\n\nPasses after rerun. See [[raw/bash_trace/${yyyyMmDd(l0.frontmatter.created_at)}/${l0.frontmatter.id}]].\n`,
        },
      }],
      new_edges: [],
    }
    clearBackendsForTest()
    registerBackend(stubBackendReturning(secondOutput))
    const secondRun = await runCurator({
      task: 'extraction',
      l0_sources: [{ source_id: l0.frontmatter.id, source_type: 'bash_trace', created_at: l0.frontmatter.created_at, body: 'pnpm lint\npass\n' }],
      workspace_id: 'ws_l2',
      project_id: 'proj_l2',
    })
    const secondApply = applyCuratorOutput(secondRun.output, {
      workspace_id: 'ws_l2', project_id: 'proj_l2',
      curator_input_sources: [l0.frontmatter.id],
    })
    await flushPendingMemoryWrites(5_000)

    const newId = secondApply.superseded_pairs[0]!.new_id

    // Old row still present (audit invariant).
    const oldEmbedAfter = getDb()
      .prepare('SELECT embedding FROM vec_memories WHERE memory_id = ?')
      .get(oldId) as { embedding: Buffer } | undefined
    expect(oldEmbedAfter).toBeDefined()
    expect(Buffer.compare(oldEmbedAfter!.embedding, oldEmbedBefore.embedding)).toBe(0)

    // New row landed.
    const newRow = getDb()
      .prepare('SELECT memory_id FROM vec_memories WHERE memory_id = ?')
      .get(newId) as { memory_id: string } | undefined
    expect(newRow?.memory_id).toBe(newId)

    // memories.superseded_by chain is intact (sanity — confirms the apply
    // layer wrote the audit link even while L2 ignored the old row).
    const old = getDb().prepare('SELECT superseded_by FROM memories WHERE memory_id = ?').get(oldId) as { superseded_by: string | null }
    expect(old.superseded_by).toBe(newId)
  })
})

function yyyyMmDd(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number): string => n.toString().padStart(2, '0')
  return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`
}
