// packages/memory/src/tests/l1-templates.test.ts
//
// Memory v3 PR 2 unit 2.1 — L1 template .md files.
// These are the canonical page shapes the validator (unit 2.3) enforces and
// the curator (PR 3) emits. The test asserts each template file is present on
// disk and carries the required placeholder tokens + frontmatter keys from the
// plan's Template reference section. No runtime code under test here — this is
// a smoke gate that catches a missing/renamed template before downstream units
// try to consume it.

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { loadTemplate as packageLoadTemplate, resetTemplateCache } from '../l1/templates/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const templatesDir = join(here, '..', 'l1', 'templates')

type TemplateName = 'entity' | 'concept' | 'page' | 'synthesis'
const TEMPLATE_NAMES: readonly TemplateName[] = ['entity', 'concept', 'page', 'synthesis']

function loadTemplate(name: TemplateName): string {
  return readFileSync(join(templatesDir, `${name}.template.md`), 'utf8')
}

describe('L1 templates — file presence', () => {
  it.each(TEMPLATE_NAMES)('%s.template.md exists on disk', (name) => {
    expect(existsSync(join(templatesDir, `${name}.template.md`))).toBe(true)
  })
})

describe('L1 templates — frontmatter contract', () => {
  it.each(TEMPLATE_NAMES)('%s declares v3 schema + type + ULID', (name) => {
    const body = loadTemplate(name)
    expect(body).toMatch(/^---\n/)
    expect(body).toContain('id: {{ULID}}')
    expect(body).toContain('schema: fulcrum.memory/v3')
    expect(body).toContain(`type: ${name}`)
    expect(body).toContain('confidence:')
    expect(body).toContain('workspace_id: {{WORKSPACE_ID}}')
    expect(body).toContain('project_id: {{PROJECT_ID}}')
  })

  it('entity/page/synthesis carry sources frontmatter', () => {
    for (const name of ['entity', 'page'] as const) {
      expect(loadTemplate(name)).toMatch(/^sources:/m)
    }
    // synthesis uses sources_via (empty sources OK)
    const synthesis = loadTemplate('synthesis')
    expect(synthesis).toMatch(/^sources(_via)?:/m)
    expect(synthesis).toContain('sources_via:')
  })

  it('all templates carry retention_tier + access_count', () => {
    for (const name of TEMPLATE_NAMES) {
      const body = loadTemplate(name)
      expect(body).toMatch(/^retention_tier:/m)
      expect(body).toMatch(/^access_count:/m)
    }
  })

  it('entity/concept/synthesis declare supersession fields', () => {
    for (const name of ['entity', 'concept', 'synthesis'] as const) {
      const body = loadTemplate(name)
      expect(body).toMatch(/^supersedes:/m)
      expect(body).toMatch(/^superseded_by:/m)
    }
  })
})

describe('L1 templates — body contract', () => {
  it.each(TEMPLATE_NAMES)('%s body contains at least one [[raw/…]] wikilink', (name) => {
    const body = loadTemplate(name)
    expect(body).toMatch(/\[\[raw\/[^\]]+\]\]/)
  })

  it.each(TEMPLATE_NAMES)('%s body has an H1 heading', (name) => {
    const body = loadTemplate(name)
    expect(body).toMatch(/\n# /)
  })
})

describe('L1 templates — no accidental non-curly placeholders', () => {
  // Every placeholder is curly-braced. Accidental `TODO`/`FIXME`/`XXX` in the
  // template body would trip the validator on every curator emit in unit 2.3.
  it.each(TEMPLATE_NAMES)('%s has no TODO / FIXME / XXX markers', (name) => {
    const body = loadTemplate(name)
    expect(body).not.toMatch(/\b(TODO|FIXME|XXX)\b/)
  })
})

describe('packageLoadTemplate — runtime loader parity', () => {
  // The runtime loader resolves via `import.meta.url`; in vitest that's the
  // source directory. Parity asserts the loader returns the same bytes as
  // reading the .md directly, so a silent loader regression would fail.
  it.each(TEMPLATE_NAMES)('loadTemplate(%s) matches the raw file', (name) => {
    resetTemplateCache()
    expect(packageLoadTemplate(name)).toBe(loadTemplate(name))
  })

  it('caches subsequent reads', () => {
    resetTemplateCache()
    const first = packageLoadTemplate('entity')
    const second = packageLoadTemplate('entity')
    expect(first).toBe(second)
  })
})
