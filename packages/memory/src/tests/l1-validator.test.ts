// packages/memory/src/tests/l1-validator.test.ts
//
// Memory v3 PR 2 unit 2.3 — exhaustive validator rule coverage.
//
// Every one of the 7 rules in §Guided templates + L0 traceability gets at
// least one positive (passes) + one negative (fails with the right error
// code) test. Error codes are a public surface — a code change here is a
// breaking change for the curator output path (PR 3), the retrospective
// lint pass (PR 7.3), and any external tooling that parses the violation
// list.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from 'fulcrum-agent-core'
import { runMigration101MemoryV3Lifecycle } from '../schema.js'
import {
  validateL1Page,
  L1TemplateViolationError,
  type L1ValidationContext,
} from '../l1/validator.js'
import { upsertEntity } from '../l1/entities.js'
import type { CuratedPage } from '../l1/frontmatter.js'

function basePage(overrides: Partial<CuratedPage> = {}): CuratedPage {
  return {
    id: '01KPAGE_OK',
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
    workspace_id: 'ws_val',
    project_id: 'proj_val',
    body: '# React\n\nLibrary.\n\n- Grounded by [[raw/bash_trace/2026/04/18/01KL0SRC_1]]\n',
    ...overrides,
  }
}

beforeEach(() => {
  createTestDb()
  runMigration101MemoryV3Lifecycle(getDb())
  seedWorkspaceAndProject(getDb(), 'ws_val', 'proj_val')
})

afterEach(() => {
  resetTestDb()
})

describe('validateL1Page — rule 1: required frontmatter', () => {
  it('passes for a well-formed entity page', () => {
    const result = validateL1Page(basePage())
    expect(result.valid).toBe(true)
    expect(result.violations).toEqual([])
  })

  it('reports MISSING_REQUIRED_FIELD for id=""', () => {
    const page = basePage({ id: '' })
    const result = validateL1Page(page)
    expect(result.valid).toBe(false)
    expect(result.violations.map((v) => v.code)).toContain('MISSING_REQUIRED_FIELD')
  })
})

describe('validateL1Page — rule 2: confidence range', () => {
  it.each([-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects confidence=%s with CONFIDENCE_OUT_OF_RANGE',
    (bad) => {
      const result = validateL1Page(basePage({ confidence: bad }))
      expect(result.valid).toBe(false)
      expect(result.violations.map((v) => v.code)).toContain('CONFIDENCE_OUT_OF_RANGE')
    },
  )

  it('accepts confidence at exactly 0.0 and 1.0', () => {
    expect(validateL1Page(basePage({ confidence: 0.0 })).valid).toBe(true)
    expect(validateL1Page(basePage({ confidence: 1.0 })).valid).toBe(true)
  })
})

describe('validateL1Page — rule 3: sources required for entity/page/synthesis', () => {
  it('rejects entity with empty sources (no sources_via fallback)', () => {
    const result = validateL1Page(basePage({ sources: [] }))
    expect(result.violations.map((v) => v.code)).toContain('SOURCES_REQUIRED')
  })

  it('allows synthesis with empty sources[] when sources_via is populated', () => {
    const synth = basePage({
      type: 'synthesis',
      title: 'X',
      name: undefined,
      sources: [],
      sources_via: ['01KPAGE_A'],
      body: '# X\n\n- [[page/01KPAGE_A]] and [[raw/decision/2026/04/18/01KANY]]\n',
    })
    expect(validateL1Page(synth).valid).toBe(true)
  })

  it('rejects synthesis with empty sources AND empty sources_via', () => {
    const synth = basePage({
      type: 'synthesis',
      title: 'X',
      name: undefined,
      sources: [],
      sources_via: [],
    })
    const result = validateL1Page(synth)
    expect(result.violations.map((v) => v.code)).toContain('SOURCES_REQUIRED')
  })

  it('allows concept with empty sources when sources_via is populated', () => {
    const concept = basePage({
      type: 'concept',
      sources: [],
      sources_via: ['01KPAGE_A'],
      body: '# X\n\n- [[page/01KPAGE_A]] and [[raw/decision/2026/04/18/01KANY]]\n',
    })
    expect(validateL1Page(concept).valid).toBe(true)
  })
})

describe('validateL1Page — rule 4: body cites a wikilink matching a source', () => {
  it('passes when body [[raw/.../<ULID>]] matches frontmatter sources[]', () => {
    expect(validateL1Page(basePage()).valid).toBe(true)
  })

  it('reports WIKILINK_SOURCE_MISMATCH when no inline wikilink matches sources[]', () => {
    const page = basePage({
      body: '# React\n\nLibrary. No grounding link in this body.\n',
    })
    const result = validateL1Page(page)
    expect(result.violations.map((v) => v.code)).toContain('WIKILINK_SOURCE_MISMATCH')
  })

  it('reports WIKILINK_SOURCE_MISMATCH when inline link ULID is not in sources[]', () => {
    const page = basePage({
      sources: ['01KL0SRC_1'],
      body: '# X\n\n[[raw/bash_trace/2026/04/18/01KL0SRC_OTHER]]\n',
    })
    const result = validateL1Page(page)
    expect(result.violations.map((v) => v.code)).toContain('WIKILINK_SOURCE_MISMATCH')
  })
})

describe('validateL1Page — rule 5: no unfilled placeholders', () => {
  it.each(['TODO', 'FIXME', '{{UNFILLED}}'])(
    'reports UNFILLED_PLACEHOLDER for %s token in body',
    (token) => {
      const result = validateL1Page(
        basePage({ body: `# React\n\n${token} body.\n[[raw/bash_trace/2026/04/18/01KL0SRC_1]]\n` }),
      )
      expect(result.violations.map((v) => v.code)).toContain('UNFILLED_PLACEHOLDER')
    },
  )

  it('reports UNFILLED_PLACEHOLDER when a frontmatter value still has {{...}}', () => {
    const result = validateL1Page(basePage({ name: '{{NAME}}' }))
    expect(result.violations.map((v) => v.code)).toContain('UNFILLED_PLACEHOLDER')
  })
})

describe('validateL1Page — rule 6: entities[] must exist in graph_entities', () => {
  it('passes when every entity id resolves', () => {
    const ent = upsertEntity({ workspace_id: 'ws_val', entity_type: 'library', name: 'React' })
    const result = validateL1Page(basePage({ entities: [ent] }))
    expect(result.valid).toBe(true)
  })

  it('reports UNKNOWN_ENTITY for any id not in graph_entities', () => {
    const result = validateL1Page(basePage({ entities: ['ent_nope'] }))
    expect(result.violations.map((v) => v.code)).toContain('UNKNOWN_ENTITY')
  })
})

describe('validateL1Page — rule 7: supersedes must resolve (with phase waiver)', () => {
  it('waived when phase=migration — supersedes chain can point anywhere', () => {
    const ctx: L1ValidationContext = { phase: 'migration' }
    const result = validateL1Page(basePage({ supersedes: ['mem_nope'] }), ctx)
    expect(result.violations.map((v) => v.code)).not.toContain('SUPERSEDES_UNRESOLVED')
  })

  it('reports SUPERSEDES_UNRESOLVED when phase=live and target missing', () => {
    const ctx: L1ValidationContext = { phase: 'live' }
    const result = validateL1Page(basePage({ supersedes: ['mem_nope'] }), ctx)
    expect(result.violations.map((v) => v.code)).toContain('SUPERSEDES_UNRESOLVED')
  })
})

describe('validateL1Page — constraint #15: curator source allowlist', () => {
  it('passes when every sources[] entry is in curator_input_sources', () => {
    const ctx: L1ValidationContext = { curator_input_sources: ['01KL0SRC_1'] }
    expect(validateL1Page(basePage(), ctx).valid).toBe(true)
  })

  it('reports CURATOR_SOURCE_NOT_IN_BATCH when sources[] cites an unfed ULID', () => {
    const ctx: L1ValidationContext = { curator_input_sources: ['01KL0SRC_OTHER'] }
    const result = validateL1Page(basePage(), ctx)
    expect(result.violations.map((v) => v.code)).toContain('CURATOR_SOURCE_NOT_IN_BATCH')
  })

  it('is skipped when curator_input_sources is undefined (non-curator writes)', () => {
    expect(validateL1Page(basePage()).valid).toBe(true)
  })
})

describe('L1TemplateViolationError', () => {
  it('surfaces the failing codes on the thrown error', () => {
    const bad = basePage({ confidence: 2, sources: [] })
    try {
      const result = validateL1Page(bad)
      if (!result.valid) throw new L1TemplateViolationError(result.violations)
      expect.fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(L1TemplateViolationError)
      const violations = (err as L1TemplateViolationError).violations
      const codes = violations.map((v) => v.code)
      expect(codes).toContain('CONFIDENCE_OUT_OF_RANGE')
      expect(codes).toContain('SOURCES_REQUIRED')
    }
  })
})
