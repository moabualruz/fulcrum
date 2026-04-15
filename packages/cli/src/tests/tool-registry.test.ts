// packages/cli/src/tests/tool-registry.test.ts
// Phase 2 + Phase 4: verify registry structure, capability completeness, and
// that all 23 public tool schemas have corresponding registry entries.

import { describe, it, expect } from 'vitest'
import { TOOL_REGISTRY } from '../tool-registry.js'
import { TOOL_SCHEMAS } from '../mcp-tools.js'

describe('TOOL_REGISTRY', () => {
  it('every public tool schema has a registry entry', () => {
    const missing = TOOL_SCHEMAS.filter(t => !TOOL_REGISTRY.has(t.name)).map(t => t.name)
    expect(missing, `Missing registry entries: ${missing.join(', ')}`).toHaveLength(0)
  })

  it('every registry entry has a complete capabilities object', () => {
    const violations: string[] = []
    for (const [name, entry] of TOOL_REGISTRY) {
      const caps = entry.capabilities
      if (typeof caps.readOnly !== 'boolean') violations.push(`${name}: readOnly missing`)
      if (typeof caps.destructive !== 'boolean') violations.push(`${name}: destructive missing`)
      if (typeof caps.hookEquivalent !== 'boolean') violations.push(`${name}: hookEquivalent missing`)
    }
    expect(violations, violations.join('\n')).toHaveLength(0)
  })

  it('readOnly capability matches readOnlyHint in tool schema', () => {
    const mismatches: string[] = []
    for (const [name, entry] of TOOL_REGISTRY) {
      if (!entry.schema) continue  // internal tools (e.g. get_task) skip schema check
      const hint = entry.schema.annotations?.readOnlyHint ?? false
      if (hint !== entry.capabilities.readOnly) {
        mismatches.push(`${name}: schema readOnlyHint=${hint} but capabilities.readOnly=${entry.capabilities.readOnly}`)
      }
    }
    expect(mismatches, mismatches.join('\n')).toHaveLength(0)
  })

  it('hookEquivalent is true only for the 3 expected tools', () => {
    const hookTools = Array.from(TOOL_REGISTRY.entries())
      .filter(([, e]) => e.capabilities.hookEquivalent)
      .map(([name]) => name)
      .sort()
    expect(hookTools).toEqual(['get_current_context', 'recall_memory', 'write_memory'])
  })

  it('minRole is set only for invoke_team', () => {
    const withMinRole = Array.from(TOOL_REGISTRY.entries())
      .filter(([, e]) => e.capabilities.minRole !== undefined)
      .map(([name]) => name)
    expect(withMinRole).toEqual(['invoke_team'])
    expect(TOOL_REGISTRY.get('invoke_team')?.capabilities.minRole).toBe('chief_of_staff')
  })

  it('every entry has a handler function', () => {
    const missing = Array.from(TOOL_REGISTRY.entries())
      .filter(([, e]) => typeof e.handler !== 'function')
      .map(([name]) => name)
    expect(missing, `Missing handler functions: ${missing.join(', ')}`).toHaveLength(0)
  })

  it('get_task is internal (no schema) but has capabilities', () => {
    const entry = TOOL_REGISTRY.get('get_task')
    expect(entry).toBeDefined()
    expect(entry!.schema).toBeUndefined()
    expect(entry!.capabilities.readOnly).toBe(true)
    expect(entry!.capabilities.hookEquivalent).toBe(false)
  })

  it('TOOL_REGISTRY contains more entries than TOOL_SCHEMAS (includes internal tools)', () => {
    expect(TOOL_REGISTRY.size).toBeGreaterThan(TOOL_SCHEMAS.length)
    // Specifically: 23 public tools + get_task internal = 24
    expect(TOOL_REGISTRY.size).toBe(TOOL_SCHEMAS.length + 1)
  })
})
