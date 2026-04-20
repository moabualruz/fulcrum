// PR 7.7 — verify agent-integration/gemini/commands/fulcrum/<name>.toml
// files are emitted from the canonical skill fanout. Hand-authored top-level
// commands (/cos, /fulcrum-memory, …) coexist and remain untouched by fanout;
// these namespaced entries are the canonical-source-linked entry points.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

const REPO_ROOT = join(import.meta.dirname ?? __dirname, '..', '..', '..', '..')
const commandsDir = join(REPO_ROOT, 'agent-integration', 'gemini', 'commands')
const fulcrumCommandsDir = join(commandsDir, 'fulcrum')

describe('PR 7.7 Gemini TOML commands — fanout-emitted entries', () => {
  it('commands/fulcrum/ subdir exists with ≥ 6 fanout-emitted .toml files', () => {
    expect(existsSync(fulcrumCommandsDir)).toBe(true)
    const files = readdirSync(fulcrumCommandsDir).filter(f => f.endsWith('.toml'))
    expect(files.length).toBeGreaterThanOrEqual(6)
  })

  it('every fanout-emitted .toml has prompt field with canonical-skill body text', () => {
    const files = readdirSync(fulcrumCommandsDir).filter(f => f.endsWith('.toml'))
    for (const file of files) {
      const body = readFileSync(join(fulcrumCommandsDir, file), 'utf8')
      expect(body, `${file} missing prompt field`).toMatch(/^prompt\s*=\s*"""/m)
      expect(body, `${file} missing description`).toMatch(/^description\s*=/m)
    }
  })

  it('total TOML command count ≥ 6 (checklist minimum)', () => {
    const topLevel = readdirSync(commandsDir).filter(f => f.endsWith('.toml'))
    const subdir = existsSync(fulcrumCommandsDir)
      ? readdirSync(fulcrumCommandsDir).filter(f => f.endsWith('.toml'))
      : []
    expect(topLevel.length + subdir.length).toBeGreaterThanOrEqual(6)
  })

  it('fulcrum/cos.toml is present and references chief_of_staff content', () => {
    const file = join(fulcrumCommandsDir, 'cos.toml')
    expect(existsSync(file), `${file} missing`).toBe(true)
    const body = readFileSync(file, 'utf8')
    expect(body.toLowerCase()).toContain('chief')
  })
})
