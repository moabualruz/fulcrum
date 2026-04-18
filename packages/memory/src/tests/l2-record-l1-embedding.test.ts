// packages/memory/src/tests/l2-record-l1-embedding.test.ts
//
// PR 4 unit 4.2 — `recordL1Embedding(db, page_id)` and curator-apply hook.
//
// Invariants pinned:
//   * recordL1Embedding is non-blocking — returns void synchronously, work
//     settles via flushPendingMemoryWrites.
//   * applyCuratorOutput triggers embedding for new_pages, updates, and the
//     new_id of each supersession; never for the superseded old_id; never
//     when ctx.dry_run.
//   * An update genuinely replaces the prior vec_memories row (supersession
//     is audit — the old row stays untouched).

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  createTestDb,
  resetTestDb,
  registerStubEmbedder,
  unregisterStubEmbedder,
  seedWorkspaceAndProject,
} from './helpers.js'
import { getDb } from 'fulcrum-agent-core'
import { runMigration101MemoryV3Lifecycle } from '../schema.js'
import { flushPendingMemoryWrites } from '../l2/queue.js'
import { recordL1Embedding } from '../l2/embed.js'
import { createCuratedPage } from '../l1/page.js'
import { applyCuratorOutput } from '../l1/apply.js'
import type { CuratedPage } from '../l1/frontmatter.js'
import type { CuratorNewPage, CuratorOutput } from '../l1/curator.js'

let tmpVault: string
let prevVaultEnv: string | undefined

beforeEach(async () => {
  createTestDb()
  runMigration101MemoryV3Lifecycle(getDb())
  seedWorkspaceAndProject(getDb(), 'ws_embed', 'proj_embed')
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-l2-embed-'))
  prevVaultEnv = process.env['FULCRUM_VAULT_PATH']
  process.env['FULCRUM_VAULT_PATH'] = tmpVault
  await registerStubEmbedder()
})

afterEach(() => {
  unregisterStubEmbedder()
  resetTestDb()
  rmSync(tmpVault, { recursive: true, force: true })
  if (prevVaultEnv === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultEnv
})

function newPageDraft(overrides: Partial<CuratorNewPage> = {}): CuratorNewPage {
  return {
    type: 'page',
    name: null,
    title: 'From L0',
    entity_type: null,
    aliases: null,
    confidence: 0.9,
    retention_tier: 'working',
    sources: ['01KL0_ALPHA'],
    sources_via: [],
    entities: [],
    body: '# From L0\n\nSee [[raw/bash_trace/2026/04/18/01KL0_ALPHA]] for the source.\n',
    ...overrides,
  }
}

function baseOutput(overrides: Partial<CuratorOutput> = {}): CuratorOutput {
  return {
    new_pages: [],
    updates: [],
    supersessions: [],
    new_edges: [],
    ...overrides,
  }
}

function ctx(overrides: Partial<Parameters<typeof applyCuratorOutput>[1]> = {}) {
  return {
    workspace_id: 'ws_embed',
    project_id: 'proj_embed',
    curator_input_sources: ['01KL0_ALPHA', '01KL0_BETA'],
    ...overrides,
  }
}

function vecRow(memory_id: string): { memory_id: string; embedding: Buffer } | undefined {
  return getDb()
    .prepare('SELECT memory_id, embedding FROM vec_memories WHERE memory_id = ?')
    .get(memory_id) as { memory_id: string; embedding: Buffer } | undefined
}

function seedExistingPage(id: string, body = '# Original\n\n[[raw/bash_trace/2026/04/18/01KL0_ALPHA]]\n'): CuratedPage {
  const now = '2026-04-18T10:00:00Z'
  const page: CuratedPage = {
    id,
    schema: 'fulcrum.memory/v3',
    type: 'page',
    title: 'Original',
    confidence: 0.5,
    first_seen: now,
    last_confirmed: now,
    retention_tier: 'working',
    access_count: 0,
    sources: ['01KL0_ALPHA'],
    sources_via: [],
    supersedes: [],
    superseded_by: null,
    entities: [],
    workspace_id: 'ws_embed',
    project_id: 'proj_embed',
    body,
  }
  return createCuratedPage(page)
}

describe('recordL1Embedding (PR 4.2)', () => {
  it('returns synchronously and populates vec_memories after flush', async () => {
    const seeded = seedExistingPage('01KEMB_X')
    const before = vecRow(seeded.id)
    expect(before).toBeUndefined()

    const result = recordL1Embedding(getDb(), seeded.id)
    expect(result).toBeUndefined()

    await flushPendingMemoryWrites(5_000)
    const row = vecRow(seeded.id)
    expect(row?.memory_id).toBe(seeded.id)
    expect(row?.embedding.byteLength).toBe(1024 * 4)
  })

  it('is a no-op for unknown page_id (post-rollback safety)', async () => {
    recordL1Embedding(getDb(), 'unknown_page')
    await flushPendingMemoryWrites(5_000)
    expect(vecRow('unknown_page')).toBeUndefined()
  })
})

describe('applyCuratorOutput → recordL1Embedding (PR 4.2)', () => {
  it('embeds every new_pages entry', async () => {
    const res = applyCuratorOutput(baseOutput({ new_pages: [newPageDraft(), newPageDraft({ title: 'Page 2' })] }), ctx())
    await flushPendingMemoryWrites(5_000)
    expect(res.created_page_ids).toHaveLength(2)
    for (const id of res.created_page_ids) {
      expect(vecRow(id)?.memory_id).toBe(id)
    }
  })

  it('replaces the vec_memories row when an update changes the body', async () => {
    const seeded = seedExistingPage(
      '01KEMB_UPDATE',
      '# Original body\n\n[[raw/bash_trace/2026/04/18/01KL0_ALPHA]]\n',
    )
    recordL1Embedding(getDb(), seeded.id)
    await flushPendingMemoryWrites(5_000)
    const before = vecRow(seeded.id)!
    expect(before.embedding.byteLength).toBe(1024 * 4)

    applyCuratorOutput(
      baseOutput({
        updates: [{
          page_id: seeded.id,
          body: '# Different body entirely\n\n[[raw/bash_trace/2026/04/18/01KL0_ALPHA]]\n',
          confidence: null,
          retention_tier: null,
          add_sources: [],
          add_entities: [],
        }],
      }),
      ctx(),
    )
    await flushPendingMemoryWrites(5_000)
    const after = vecRow(seeded.id)!
    expect(after.memory_id).toBe(seeded.id)
    expect(Buffer.compare(after.embedding, before.embedding)).not.toBe(0)
  })

  it('supersession embeds the new page only; old vec_memories row is unchanged', async () => {
    const seeded = seedExistingPage('01KEMB_OLD')
    recordL1Embedding(getDb(), seeded.id)
    await flushPendingMemoryWrites(5_000)
    const oldVecBefore = vecRow(seeded.id)!

    const res = applyCuratorOutput(
      baseOutput({
        supersessions: [{
          old_page_id: seeded.id,
          new_page: newPageDraft({ title: 'Corrected', body: '# Corrected\n\n[[raw/bash_trace/2026/04/18/01KL0_ALPHA]]\n' }),
        }],
      }),
      ctx(),
    )
    await flushPendingMemoryWrites(5_000)

    const new_id = res.superseded_pairs[0]!.new_id
    expect(vecRow(new_id)?.memory_id).toBe(new_id)
    const oldVecAfter = vecRow(seeded.id)!
    // Old row stays: supersession is audit, not deletion.
    expect(Buffer.compare(oldVecAfter.embedding, oldVecBefore.embedding)).toBe(0)
  })

  it('dry-run writes no vec_memories rows', async () => {
    const res = applyCuratorOutput(
      baseOutput({ new_pages: [newPageDraft()] }),
      ctx({ dry_run: true }),
    )
    await flushPendingMemoryWrites(5_000)
    expect(res.dry_run).toBe(true)
    const count = getDb().prepare('SELECT COUNT(*) AS n FROM vec_memories').get() as { n: number }
    expect(count.n).toBe(0)
  })
})
