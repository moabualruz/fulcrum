import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseCanonicalSource } from '../parse.js'
import { emitPi } from '../emit/pi.js'

const here = dirname(fileURLToPath(import.meta.url))
const agentIntegrationRoot = join(here, '..', '..', '..', '..', 'agent-integration')

describe('emitPi', () => {
  const source = parseCanonicalSource({ agentIntegrationRoot })

  it('targets pi', () => {
    expect(emitPi(source).target).toBe('pi')
  })

  it('emits zero artifacts (PI consumes canonical via symlink; OQ #5)', () => {
    expect(emitPi(source).artifacts).toEqual([])
  })

  it('is a deliberate no-op even with non-empty source (regression guard)', () => {
    expect(emitPi({ skills: source.skills.slice(0, 5) }).artifacts).toEqual([])
  })

  it('returns empty artifacts for empty source', () => {
    expect(emitPi({ skills: [] })).toEqual({ target: 'pi', artifacts: [] })
  })
})
