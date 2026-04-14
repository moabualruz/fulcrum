// packages/core/src/tests/a2a-card.test.ts
// Tests for buildA2ACard() — A2A AgentCard builder.

import { describe, it, expect } from 'vitest'
import { buildA2ACard } from '../a2a-card.js'
import type { AgentDefinition } from '../types.js'

function makeDefinition(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id: 'adef_test_01',
    role: 'software_engineer',
    display_name: 'Software Engineer',
    description: 'Writes and reviews code.',
    version: '1.0.0',
    stability: 'stable',
    system_prompt: null,
    model: null,
    provider: 'anthropic',
    tools_allow: null,
    tools_deny: null,
    capabilities: [],
    output_schema: null,
    executor_uri: null,
    a2a_card: null,
    eval_suites: [],
    created_at: 1000000,
    updated_at: 1000000,
    ...overrides,
  }
}

describe('buildA2ACard', () => {
  it('builds a valid card with required fields', () => {
    const card = buildA2ACard(makeDefinition())
    expect(card.name).toBe('Software Engineer')
    expect(card.description).toBe('Writes and reviews code.')
    expect(card.version).toBe('1.0.0')
    expect(card.defaultInputModes).toContain('text/plain')
    expect(card.defaultOutputModes).toContain('application/json')
  })

  it('uses executor_uri from definition when no override', () => {
    const card = buildA2ACard(makeDefinition({ executor_uri: 'https://agents.example.com/se' }))
    expect(card.url).toBe('https://agents.example.com/se')
  })

  it('override takes precedence over executor_uri', () => {
    const card = buildA2ACard(
      makeDefinition({ executor_uri: 'https://agents.example.com/se' }),
      'https://override.example.com/se',
    )
    expect(card.url).toBe('https://override.example.com/se')
  })

  it('falls back to default URL when executor_uri is null', () => {
    const card = buildA2ACard(makeDefinition())
    expect(card.url).toContain('software_engineer')
  })

  it('maps code_generation capability to a skill', () => {
    const card = buildA2ACard(makeDefinition({ capabilities: ['code_generation'] }))
    expect(card.skills).toHaveLength(1)
    expect(card.skills[0].id).toBe('code_generation')
    expect(card.skills[0].name).toBe('Code Generation')
  })

  it('maps multiple capabilities to multiple skills', () => {
    const card = buildA2ACard(makeDefinition({ capabilities: ['code_generation', 'code_review', 'planning'] }))
    expect(card.skills).toHaveLength(3)
    const ids = card.skills.map(s => s.id)
    expect(ids).toContain('code_generation')
    expect(ids).toContain('code_review')
    expect(ids).toContain('planning')
  })

  it('falls back to a generic skill when no known capabilities', () => {
    const card = buildA2ACard(makeDefinition({ capabilities: [] }))
    expect(card.skills).toHaveLength(1)
    expect(card.skills[0].id).toContain('software_engineer')
  })

  it('ignores unknown capabilities gracefully', () => {
    const card = buildA2ACard(makeDefinition({ capabilities: ['unknown_cap_xyz'] }))
    // Falls back to generic skill
    expect(card.skills).toHaveLength(1)
    expect(card.skills[0].id).toContain('software_engineer')
  })

  it('sets streaming capability when present', () => {
    const card = buildA2ACard(makeDefinition({ capabilities: ['streaming'] }))
    expect(card.capabilities.streaming).toBe(true)
  })

  it('omits false capability flags (streaming: undefined not false)', () => {
    const card = buildA2ACard(makeDefinition({ capabilities: [] }))
    expect(card.capabilities.streaming).toBeUndefined()
    expect(card.capabilities.pushNotifications).toBeUndefined()
  })

  it('sets pushNotifications when present', () => {
    const card = buildA2ACard(makeDefinition({ capabilities: ['push_notifications'] }))
    expect(card.capabilities.pushNotifications).toBe(true)
  })

  it('sets stateTransitionHistory when present', () => {
    const card = buildA2ACard(makeDefinition({ capabilities: ['state_transition_history'] }))
    expect(card.capabilities.stateTransitionHistory).toBe(true)
  })

  it('preserves version from definition', () => {
    const card = buildA2ACard(makeDefinition({ version: '2.3.1' }))
    expect(card.version).toBe('2.3.1')
  })

  it('includes documentationUrl', () => {
    const card = buildA2ACard(makeDefinition())
    expect(card.documentationUrl).toContain('software_engineer')
  })

  it('works for chief_of_staff role', () => {
    const card = buildA2ACard(makeDefinition({
      role: 'chief_of_staff',
      display_name: 'Chief of Staff',
      description: 'Orchestrates all agent workflows.',
      capabilities: ['orchestration', 'planning'],
    }))
    expect(card.name).toBe('Chief of Staff')
    expect(card.skills.map(s => s.id)).toContain('orchestration')
    expect(card.skills.map(s => s.id)).toContain('planning')
  })
})
