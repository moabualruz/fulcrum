import { describe, it, expect } from 'vitest'
import { detectIntent } from '../retrieval/intent.js'
import { DEFAULT_IGNORE_PATTERNS } from '../pci/ignore-patterns.js'

describe('intent classifier — v2a Task 7 (Tier A algorithm)', () => {
  it('classifies definition queries', () => {
    expect(detectIntent('where is the parser').type).toBe('DEFINITION')
    expect(detectIntent('what is FullMemory').type).toBe('DEFINITION')
    expect(detectIntent('define agent_runs').filters?.definitionsOnly).toBe(true)
  })

  it('classifies flow / implementation queries', () => {
    expect(detectIntent('how does runStagedSearch work').type).toBe('FLOW')
    expect(detectIntent('implementation of dedup').mode).toBe('orchestration_first')
  })

  it('classifies usage queries', () => {
    expect(detectIntent('example of writeMemory').type).toBe('USAGE')
    expect(detectIntent('how to use the recall API').mode).toBe('show_examples')
  })

  it('classifies architecture queries', () => {
    expect(detectIntent('overview of the memory architecture').type).toBe('ARCHITECTURE')
    expect(detectIntent('system design overview').mode).toBe('group_by_role')
  })

  it('falls back to GENERAL', () => {
    expect(detectIntent('what colors does it support').type).toBe('GENERAL')
  })
})

describe('ignore-patterns — v2a Task 7 (Tier A algorithm)', () => {
  it('keeps the security-sensitive set', () => {
    for (const p of ['.env', '*.key', '*.pem', '**/.ssh/**', 'secrets.*']) {
      expect(DEFAULT_IGNORE_PATTERNS, `missing security pattern: ${p}`).toContain(p)
    }
  })

  it('keeps the lockfile set', () => {
    for (const p of ['package-lock.json', 'pnpm-lock.yaml', 'Cargo.lock']) {
      expect(DEFAULT_IGNORE_PATTERNS).toContain(p)
    }
  })

  it('does not include package.json (kept as code)', () => {
    expect(DEFAULT_IGNORE_PATTERNS).not.toContain('package.json')
    expect(DEFAULT_IGNORE_PATTERNS).not.toContain('tsconfig.json')
  })
})
