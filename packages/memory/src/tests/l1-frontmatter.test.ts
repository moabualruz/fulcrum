// packages/memory/src/tests/l1-frontmatter.test.ts
//
// Memory v3 PR 2 unit 2.6 — L1 page frontmatter serializer.
//
// Thin layer over gray-matter that round-trips the v3 CuratedPage shape.
// List fields (sources, supersedes, entities, sources_via) must serialize as
// proper YAML sequences (or empty arrays when empty, NOT undefined/null) so
// the validator and the curator can read them with predictable types.

import { describe, it, expect } from 'vitest'
import {
  serializeCuratedPage,
  parseCuratedPage,
  type CuratedPage,
} from '../l1/frontmatter.js'

function makeEntity(overrides: Partial<CuratedPage> = {}): CuratedPage {
  return {
    id: '01KPAGE_ENTITY',
    schema: 'fulcrum.memory/v3',
    type: 'entity',
    name: 'React',
    confidence: 0.9,
    first_seen: '2026-04-18T12:00:00Z',
    last_confirmed: '2026-04-18T12:00:00Z',
    retention_tier: 'working',
    access_count: 0,
    sources: ['01KL0SRC_1'],
    sources_via: [],
    supersedes: [],
    superseded_by: null,
    entities: [],
    workspace_id: 'ws_demo',
    project_id: 'proj_demo',
    body: '# React\n\nLibrary.\n\n- [[raw/bash_trace/2026/04/18/01KL0SRC_1]]\n',
    ...overrides,
  }
}

describe('serializeCuratedPage', () => {
  it('round-trips a minimal entity page byte-stable', () => {
    const page = makeEntity()
    const content = serializeCuratedPage(page)
    const parsed = parseCuratedPage(content)
    expect(parsed).toEqual(page)
  })

  it('preserves list-field order for sources/supersedes/entities', () => {
    const page = makeEntity({
      sources: ['01KA', '01KB', '01KC'],
      supersedes: ['01KOLD1', '01KOLD2'],
      entities: ['01KE1', '01KE2'],
    })
    const parsed = parseCuratedPage(serializeCuratedPage(page))
    expect(parsed.sources).toEqual(['01KA', '01KB', '01KC'])
    expect(parsed.supersedes).toEqual(['01KOLD1', '01KOLD2'])
    expect(parsed.entities).toEqual(['01KE1', '01KE2'])
  })

  it('emits empty arrays as `[]` (not null) so callers can always iterate', () => {
    const page = makeEntity({ sources: [], sources_via: [], supersedes: [], entities: [] })
    const content = serializeCuratedPage(page)
    // gray-matter writes `sources: []` for an empty array; regex is loose to
    // tolerate either flow-style [] or block-style newline-indent.
    expect(content).toMatch(/^sources:\s*(\[\]|$)/m)
    const parsed = parseCuratedPage(content)
    expect(parsed.sources).toEqual([])
    expect(parsed.supersedes).toEqual([])
    expect(parsed.entities).toEqual([])
  })

  it('round-trips a synthesis page with sources_via and episodic tier', () => {
    const page = makeEntity({
      id: '01KSYN',
      type: 'synthesis',
      name: undefined,
      title: 'Cross-source: auth flow evolution',
      sources: [],
      sources_via: ['01KPAGE_A', '01KPAGE_B'],
      retention_tier: 'episodic',
      body: '# Cross-source: auth flow evolution\n\nIntro.\n\n- [[raw/session_transcript/2026/04/18/01KL0SRC_1]]\n',
    })
    const parsed = parseCuratedPage(serializeCuratedPage(page))
    expect(parsed.type).toBe('synthesis')
    expect(parsed.sources_via).toEqual(['01KPAGE_A', '01KPAGE_B'])
    expect(parsed.retention_tier).toBe('episodic')
  })

  it('preserves supersession scalar via superseded_by', () => {
    const page = makeEntity({ superseded_by: '01KNEW' })
    const parsed = parseCuratedPage(serializeCuratedPage(page))
    expect(parsed.superseded_by).toBe('01KNEW')
  })
})

describe('parseCuratedPage — input validation', () => {
  it('throws when required fields missing', () => {
    const content = '---\nschema: fulcrum.memory/v3\ntype: entity\n---\n# x\n'
    expect(() => parseCuratedPage(content)).toThrow(/id/)
  })

  it('throws on unknown type', () => {
    const page = makeEntity()
    const content = serializeCuratedPage(page).replace('type: entity', 'type: fiction')
    expect(() => parseCuratedPage(content)).toThrow(/type/)
  })

  it('defaults missing optional list fields to []', () => {
    const content = [
      '---',
      'id: 01KMIN',
      'schema: fulcrum.memory/v3',
      'type: entity',
      'name: Minimal',
      'confidence: 1.0',
      'first_seen: 2026-04-18T00:00:00Z',
      'last_confirmed: 2026-04-18T00:00:00Z',
      'retention_tier: working',
      'access_count: 0',
      'workspace_id: ws',
      'project_id: pr',
      '---',
      '# Minimal',
      '',
      '- [[raw/bash_trace/2026/04/18/01KSRC]]',
      '',
    ].join('\n')
    const parsed = parseCuratedPage(content)
    expect(parsed.sources).toEqual([])
    expect(parsed.sources_via).toEqual([])
    expect(parsed.supersedes).toEqual([])
    expect(parsed.entities).toEqual([])
    expect(parsed.superseded_by).toBeNull()
  })
})
