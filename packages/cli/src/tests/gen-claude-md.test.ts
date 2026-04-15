// packages/cli/src/tests/gen-claude-md.test.ts
//
// Unit tests for the pure splice helpers in scripts/gen-claude-md.ts.
// These test the string transformation logic in isolation — no file I/O,
// no TOOL_SCHEMAS import (the isMain guard keeps those side effects out).

import { describe, it, expect } from 'vitest'
import {
  spliceSection,
  spliceToolCount,
  START_MARKER,
  END_MARKER,
  COUNT_START,
  COUNT_END,
} from '../../../../scripts/gen-claude-md.js'

// ── spliceSection ─────────────────────────────────────────────────────────────

describe('spliceSection', () => {
  it('replaces content between markers', () => {
    const original = `# Intro\n\n${START_MARKER}\n\nOLD CONTENT\n\n${END_MARKER}\n\n# After`
    const result = spliceSection(original, 'NEW CONTENT')
    expect(result).toContain('NEW CONTENT')
    expect(result).not.toContain('OLD CONTENT')
    expect(result).toContain(START_MARKER)
    expect(result).toContain(END_MARKER)
    expect(result).toContain('# After')
  })

  it('appends markers and generated content when markers are absent', () => {
    const original = '# No markers here\n\nSome content.'
    const result = spliceSection(original, 'GENERATED')
    expect(result).toContain(START_MARKER)
    expect(result).toContain(END_MARKER)
    expect(result).toContain('GENERATED')
    expect(result).toContain('# No markers here')
  })

  it('is idempotent — applying twice with same content produces same result', () => {
    const original = `${START_MARKER}\n\nOLD\n\n${END_MARKER}\n`
    const first = spliceSection(original, 'NEW')
    const second = spliceSection(first, 'NEW')
    expect(first).toBe(second)
  })

  it('preserves content before the start marker', () => {
    const before = '# Fulcrum\n\nStatic intro text.\n\n'
    const original = before + START_MARKER + '\n\nOLD\n\n' + END_MARKER + '\n'
    const result = spliceSection(original, 'GEN')
    expect(result.startsWith(before)).toBe(true)
  })

  it('preserves content after the end marker', () => {
    const after = '\n\n## Lifecycle\n\nSome static section.'
    const original = START_MARKER + '\n\nOLD\n\n' + END_MARKER + after
    const result = spliceSection(original, 'GEN')
    expect(result.endsWith(after)).toBe(true)
  })
})

// ── spliceToolCount ───────────────────────────────────────────────────────────

describe('spliceToolCount', () => {
  it('replaces the count line between markers', () => {
    const original = `${COUNT_START}\nThe \`fulcrum\` MCP server exposes 13 tools for task management, memory, agent runs, and workspace context.\n${COUNT_END}`
    const result = spliceToolCount(original, 27)
    expect(result).toContain('exposes 27 tools')
    expect(result).not.toContain('exposes 13 tools')
  })

  it('returns original unchanged when count markers are absent', () => {
    const original = 'No count markers here.'
    expect(spliceToolCount(original, 5)).toBe(original)
  })

  it('is idempotent — applying twice with same count produces same result', () => {
    const original = `${COUNT_START}\nexposes 10 tools.\n${COUNT_END}`
    const first = spliceToolCount(original, 10)
    const second = spliceToolCount(first, 10)
    expect(first).toBe(second)
  })

  it('preserves surrounding content', () => {
    const original = `Intro line.\n\n${COUNT_START}\nexposes 1 tool.\n${COUNT_END}\n\nMore text.`
    const result = spliceToolCount(original, 42)
    expect(result).toContain('Intro line.')
    expect(result).toContain('More text.')
    expect(result).toContain('exposes 42 tools')
  })
})
