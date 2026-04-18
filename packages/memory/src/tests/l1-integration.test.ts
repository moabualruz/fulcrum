// packages/memory/src/tests/l1-integration.test.ts
//
// Memory v3 PR 2 unit 2.8 — end-to-end happy-path integration test.
//
// Exercises the full stack in one go: load a template → fill placeholders
// on a curator-shaped CuratedPage → upsert the backing graph entity →
// createCuratedPage (runs the validator + writes the file + inserts the
// memories row) → readCuratedPage round-trip → supersedeCuratedPage →
// getEntityGraph 2-hop traversal. Individual units cover the primitives in
// isolation; this test is the regression gate that proves they compose.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from 'fulcrum-agent-core'
import { runMigration101MemoryV3Lifecycle } from '../schema.js'
import { loadTemplate } from '../l1/templates/index.js'
import { upsertEntity, addEdge, getEntityGraph } from '../l1/entities.js'
import { validateL1Page } from '../l1/validator.js'
import { createCuratedPage, readCuratedPage, supersedeCuratedPage } from '../l1/page.js'
import { extractWikilinks, resolveWikilink } from '../l1/wikilinks.js'
import type { CuratedPage } from '../l1/frontmatter.js'

let tmpVault: string
let prevVaultEnv: string | undefined

beforeEach(() => {
  createTestDb()
  runMigration101MemoryV3Lifecycle(getDb())
  seedWorkspaceAndProject(getDb(), 'ws_int', 'proj_int')
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-l1-int-'))
  prevVaultEnv = process.env['FULCRUM_VAULT_PATH']
  process.env['FULCRUM_VAULT_PATH'] = tmpVault
})

afterEach(() => {
  resetTestDb()
  rmSync(tmpVault, { recursive: true, force: true })
  if (prevVaultEnv === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultEnv
})

describe('L1 PR 2 end-to-end happy path', () => {
  it('template → entity → page → supersede → graph traversal', () => {
    // 1. Template is loadable + plan-shaped.
    const entityTemplate = loadTemplate('entity')
    expect(entityTemplate).toContain('type: entity')
    expect(entityTemplate).toContain('{{ULID}}')

    // 2. Graph entity seeded so the page can reference it.
    const reactId = upsertEntity({
      workspace_id: 'ws_int',
      entity_type: 'library',
      name: 'React',
    })
    const hookId = upsertEntity({
      workspace_id: 'ws_int',
      entity_type: 'concept',
      name: 'Hooks',
    })
    addEdge({
      workspace_id: 'ws_int',
      source_id: reactId,
      target_id: hookId,
      relation: 'exposes',
    })

    // 3. Build the page the curator WOULD emit (placeholders filled).
    const pageV1: CuratedPage = {
      id: '01KE2E_PAGE_V1',
      schema: 'fulcrum.memory/v3',
      type: 'entity',
      name: 'React',
      entity_type: 'library',
      aliases: ['ReactJS'],
      confidence: 0.9,
      first_seen: '2026-04-18T12:00:00Z',
      last_confirmed: '2026-04-18T12:00:00Z',
      retention_tier: 'working',
      access_count: 0,
      sources: ['01KL0SRC_1'],
      sources_via: [],
      supersedes: [],
      superseded_by: null,
      entities: [reactId],
      workspace_id: 'ws_int',
      project_id: 'proj_int',
      body: [
        '# React',
        '',
        'Declarative UI library for JavaScript.',
        '',
        '## Observed usage',
        '',
        'Imported by the hook — grounding [[raw/bash_trace/2026/04/18/01KL0SRC_1]].',
        '',
        '## Related',
        '',
        `- [[entity/${hookId}]]`,
        '',
      ].join('\n'),
    }

    // 4. Pre-flight validation surfaces zero violations.
    expect(validateL1Page(pageV1).valid).toBe(true)

    // 5. Write lands file + row.
    const created = createCuratedPage(pageV1)
    expect(created.id).toBe(pageV1.id)
    const readBack = readCuratedPage(pageV1.id)
    expect(readBack).not.toBeNull()
    expect(readBack!.entities).toEqual([reactId])
    expect(readBack!.sources).toEqual(['01KL0SRC_1'])

    // 6. Inline wikilinks parse + resolve to legal paths.
    const links = extractWikilinks(readBack!.body)
    expect(links).toContain('raw/bash_trace/2026/04/18/01KL0SRC_1')
    expect(links).toContain(`entity/${hookId}`)
    expect(() => resolveWikilink(links[0]!, tmpVault)).not.toThrow()

    // 7. Supersession: a corrected v2 of the page replaces v1.
    const pageV2: CuratedPage = {
      ...pageV1,
      id: '01KE2E_PAGE_V2',
      confidence: 0.95,
      last_confirmed: '2026-04-19T00:00:00Z',
      body: pageV1.body.replace('Declarative UI library', 'Declarative component library'),
    }
    const { new_page } = supersedeCuratedPage(pageV1.id, pageV2)
    expect(new_page.supersedes).toEqual([pageV1.id])
    const oldRow = getDb()
      .prepare('SELECT superseded_by FROM memories WHERE memory_id = ?')
      .get(pageV1.id) as { superseded_by: string }
    expect(oldRow.superseded_by).toBe(pageV2.id)

    // 8. Graph traversal from React picks up Hooks one hop away.
    const graph = getEntityGraph(reactId, 1)
    expect(new Set(graph.nodes.map((n) => n.entity_id))).toEqual(
      new Set([reactId, hookId]),
    )
    expect(graph.edges).toHaveLength(1)
    expect(graph.edges[0]!.relation).toBe('exposes')
  })

  it('synthesis + source-summary pages link via wikilinks and satisfy validator', () => {
    // Seed two L1 source-summary pages.
    const pageA = createCuratedPage({
      id: '01K_PG_A',
      schema: 'fulcrum.memory/v3',
      type: 'page',
      title: 'Auth flow — day 1',
      source: '01KL0SRC_A',
      confidence: 1.0,
      first_seen: '2026-04-18T12:00:00Z',
      last_confirmed: '2026-04-18T12:00:00Z',
      retention_tier: 'working',
      access_count: 0,
      sources: ['01KL0SRC_A'],
      sources_via: [],
      supersedes: [],
      superseded_by: null,
      entities: [],
      workspace_id: 'ws_int',
      project_id: 'proj_int',
      body: '# Auth flow — day 1\n\nInitial capture. [[raw/session_transcript/2026/04/18/01KL0SRC_A]]\n',
    })

    const pageB = createCuratedPage({
      id: '01K_PG_B',
      schema: 'fulcrum.memory/v3',
      type: 'page',
      title: 'Auth flow — day 2',
      source: '01KL0SRC_B',
      confidence: 1.0,
      first_seen: '2026-04-18T18:00:00Z',
      last_confirmed: '2026-04-18T18:00:00Z',
      retention_tier: 'working',
      access_count: 0,
      sources: ['01KL0SRC_B'],
      sources_via: [],
      supersedes: [],
      superseded_by: null,
      entities: [],
      workspace_id: 'ws_int',
      project_id: 'proj_int',
      body: '# Auth flow — day 2\n\nFollow-up. [[raw/session_transcript/2026/04/18/01KL0SRC_B]]\n',
    })

    // Synthesis page references both via sources_via.
    const synth = createCuratedPage({
      id: '01K_SYN',
      schema: 'fulcrum.memory/v3',
      type: 'synthesis',
      title: 'Auth flow — cross-day',
      confidence: 0.8,
      first_seen: '2026-04-18T19:00:00Z',
      last_confirmed: '2026-04-18T19:00:00Z',
      retention_tier: 'episodic',
      access_count: 0,
      sources: [],
      sources_via: [pageA.id, pageB.id],
      supersedes: [],
      superseded_by: null,
      entities: [],
      workspace_id: 'ws_int',
      project_id: 'proj_int',
      body: `# Auth flow — cross-day\n\nIntro tying sources together.\n\n- [[page/${pageA.id}]] — day 1 capture\n- [[page/${pageB.id}]] — day 2 follow-up\n- [[raw/session_transcript/2026/04/18/01KL0SRC_A]]\n`,
    })

    // Read-back preserves everything.
    const read = readCuratedPage(synth.id)
    expect(read).not.toBeNull()
    expect(read!.sources_via).toEqual([pageA.id, pageB.id])

    // Resolve the page wikilinks to absolute vault paths — they SHOULD point
    // at the files we just wrote.
    const links = extractWikilinks(read!.body)
    expect(links).toContain(`page/${pageA.id}`)
    expect(links).toContain(`page/${pageB.id}`)
    const resolvedA = resolveWikilink(`page/${pageA.id}`, tmpVault)
    expect(resolvedA.endsWith(`curated/pages/${pageA.id}.md`)).toBe(true)
  })
})
