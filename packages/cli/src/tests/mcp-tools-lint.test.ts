// packages/cli/src/tests/mcp-tools-lint.test.ts
// CI lint: enforce naming conventions on MCP tool schemas.
// Read-named tools MUST have readOnlyHint: true. This test fails if a
// new read tool is added without the annotation, catching the omission
// before it reaches production where MCP hosts rely on the hint for
// caching, batching, and confirmation-prompt suppression.

import { describe, it, expect } from 'vitest'
import { TOOL_SCHEMAS } from '../mcp-tools.js'

const READ_PREFIXES = ['list_', 'get_', 'recall_', 'build_']

describe('mcp-tools schema lint', () => {
  it('every read-named tool has readOnlyHint: true', () => {
    const violations: string[] = []

    for (const tool of TOOL_SCHEMAS) {
      const isReadNamed = READ_PREFIXES.some(p => tool.name.startsWith(p))
      if (!isReadNamed) continue

      if (tool.annotations?.readOnlyHint !== true) {
        violations.push(
          `'${tool.name}' starts with a read prefix but is missing readOnlyHint: true`
        )
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `readOnlyHint annotation missing on ${violations.length} tool(s):\n` +
        violations.map(v => `  - ${v}`).join('\n') +
        '\n\nAdd annotations: { readOnlyHint: true } to each tool listed above.'
      )
    }
  })

  it('no tool with a write prefix has readOnlyHint: true', () => {
    const WRITE_PREFIXES = ['create_', 'update_', 'delete_', 'write_', 'start_', 'complete_', 'block_', 'invoke_']
    const violations: string[] = []

    for (const tool of TOOL_SCHEMAS) {
      const isWriteNamed = WRITE_PREFIXES.some(p => tool.name.startsWith(p))
      if (!isWriteNamed) continue

      if (tool.annotations?.readOnlyHint === true) {
        violations.push(
          `'${tool.name}' starts with a write prefix but has readOnlyHint: true — this is misleading`
        )
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Suspicious readOnlyHint on ${violations.length} write-named tool(s):\n` +
        violations.map(v => `  - ${v}`).join('\n')
      )
    }
  })

  it('all tool names are unique', () => {
    const names = TOOL_SCHEMAS.map(t => t.name)
    const seen = new Set<string>()
    const dupes: string[] = []

    for (const name of names) {
      if (seen.has(name)) dupes.push(name)
      seen.add(name)
    }

    expect(dupes, `Duplicate tool names: ${dupes.join(', ')}`).toHaveLength(0)
  })

  it('all tool names use snake_case', () => {
    const violations = TOOL_SCHEMAS
      .filter(t => !/^[a-z][a-z0-9_]*$/.test(t.name))
      .map(t => t.name)

    expect(violations, `Non-snake_case tool names: ${violations.join(', ')}`).toHaveLength(0)
  })
})
