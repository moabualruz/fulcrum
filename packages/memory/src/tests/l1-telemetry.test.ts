// packages/memory/src/tests/l1-telemetry.test.ts
//
// Memory v3 PR 3 unit 3.7 — curator telemetry.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { appendCuratorLog, type CuratorLogEntry } from '../l1/telemetry.js'

let vault: string

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), 'fulcrum-curator-log-'))
})

afterEach(() => {
  rmSync(vault, { recursive: true, force: true })
})

function entry(overrides: Partial<CuratorLogEntry> = {}): CuratorLogEntry {
  return {
    ts: '2026-04-18T22:58:00Z',
    l0_id: '01KL0_A',
    task: 'extraction',
    backend: 'codex',
    model: 'gpt-5-mini',
    prompt_version: 'v3.0.0',
    duration_ms: 123,
    dry_run: false,
    affected_pages: { created: ['01KPAGE_A'], updated: [], superseded: [] },
    new_edges: [],
    confidence_deltas: { created: [0.9], updated: [], superseded: [] },
    ...overrides,
  }
}

describe('appendCuratorLog', () => {
  it('creates curated/log.md on first write with one JSONL record', () => {
    const path = appendCuratorLog(vault, entry())
    expect(path).toBe(join(vault, 'curated', 'log.md'))
    expect(existsSync(path)).toBe(true)
    const contents = readFileSync(path, 'utf-8')
    const lines = contents.trimEnd().split('\n')
    expect(lines).toHaveLength(1)
    const parsed = JSON.parse(lines[0]!) as CuratorLogEntry
    expect(parsed.l0_id).toBe('01KL0_A')
    expect(parsed.backend).toBe('codex')
    expect(parsed.prompt_version).toBe('v3.0.0')
  })

  it('appends subsequent records — does not truncate', () => {
    const path = appendCuratorLog(vault, entry({ l0_id: '01KL0_A' }))
    appendCuratorLog(vault, entry({ l0_id: '01KL0_B', backend: 'openai', model: 'gpt-5' }))
    appendCuratorLog(vault, entry({ l0_id: '01KL0_C', dry_run: true }))
    const lines = readFileSync(path, 'utf-8').trimEnd().split('\n')
    expect(lines).toHaveLength(3)
    const second = JSON.parse(lines[1]!) as CuratorLogEntry
    expect(second.l0_id).toBe('01KL0_B')
    expect(second.backend).toBe('openai')
    const third = JSON.parse(lines[2]!) as CuratorLogEntry
    expect(third.dry_run).toBe(true)
  })

  it('creates the curated/ directory when it does not exist', () => {
    // vault is tmpdir but curated/ under it does not exist yet.
    expect(existsSync(join(vault, 'curated'))).toBe(false)
    appendCuratorLog(vault, entry())
    expect(existsSync(join(vault, 'curated'))).toBe(true)
  })

  it('preserves the full schema — every declared field round-trips', () => {
    const full: CuratorLogEntry = {
      ts: '2026-04-18T23:00:00Z',
      l0_id: '01KL0_FULL',
      task: 'synthesis',
      backend: 'openai',
      model: 'gpt-5',
      prompt_version: 'v3.0.0',
      duration_ms: 4200,
      dry_run: false,
      affected_pages: {
        created: ['01KPAGE_C1', '01KPAGE_C2'],
        updated: ['01KPAGE_U1'],
        superseded: [{ old_id: '01KPAGE_OLD', new_id: '01KPAGE_NEW' }],
      },
      new_edges: ['01KEDGE_1'],
      confidence_deltas: {
        created: [0.8, 0.9],
        updated: [0.7],
        superseded: [0.95],
      },
      usage: { input_tokens: 100, cached_input_tokens: 40, output_tokens: 50 },
    }
    const path = appendCuratorLog(vault, full)
    const parsed = JSON.parse(readFileSync(path, 'utf-8').trim()) as CuratorLogEntry
    expect(parsed).toEqual(full)
  })
})
