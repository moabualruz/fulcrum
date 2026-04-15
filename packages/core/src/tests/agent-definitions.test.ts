// packages/core/src/tests/agent-definitions.test.ts
// Tests for agent_definitions CRUD (MIGRATION_031).

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getDb, closeDb, runMigrations } from '../index.js'
import {
  createAgentDefinition, getAgentDefinition, updateAgentDefinition, listAgentDefinitions,
} from '../agent-definitions.js'

let tmpDir: string | null = null

function setupDb(): void {
  closeDb()
  tmpDir = mkdtempSync(join(tmpdir(), 'fulcrum-adef-test-'))
  const db = getDb(tmpDir)
  runMigrations(db)
}

function teardownDb(): void {
  closeDb()
  if (tmpDir) {
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
    tmpDir = null
  }
}

describe('MIGRATION_031 — agent_definitions table', () => {
  beforeEach(() => setupDb())
  afterEach(() => teardownDb())

  it('creates the agent_definitions table', () => {
    const db = getDb()
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='agent_definitions'"
    ).get() as { name: string } | undefined
    expect(row?.name).toBe('agent_definitions')
  })

  it('records the migration in schema_migrations', () => {
    const db = getDb()
    const row = db.prepare(
      "SELECT name FROM schema_migrations WHERE name = '031_agent_definitions'"
    ).get() as { name: string } | undefined
    expect(row?.name).toBe('031_agent_definitions')
  })
})

describe('createAgentDefinition', () => {
  beforeEach(() => setupDb())
  afterEach(() => teardownDb())

  it('creates a new agent definition with defaults', () => {
    // Use a non-canonical role name to avoid conflict with seeded definitions
    const def = createAgentDefinition({
      role: 'test_custom_role_a',
      display_name: 'Test Custom Role A',
      description: 'Writes and reviews code',
    })
    expect(def.id).toMatch(/^adef_[0-9A-Z]+$/)
    expect(def.role).toBe('test_custom_role_a')
    expect(def.display_name).toBe('Test Custom Role A')
    expect(def.description).toBe('Writes and reviews code')
    expect(def.version).toBe('0.1.0')
    expect(def.stability).toBe('experimental')
    expect(def.provider).toBe('anthropic')
    expect(def.tools_allow).toBeNull()
    expect(def.tools_deny).toBeNull()
    expect(def.capabilities).toEqual([])
    expect(def.created_at).toBeGreaterThan(0)
  })

  it('creates a definition with all optional fields', () => {
    const def = createAgentDefinition({
      role: 'test_custom_role_b',
      display_name: 'Test Custom Role B',
      description: 'Reviews code for quality',
      version: '1.0.0',
      stability: 'stable',
      model: 'claude-opus-4-6',
      provider: 'anthropic',
      tools_allow: ['Read', 'Grep', 'Glob'],
      tools_deny: ['Bash'],
      capabilities: ['code', 'review'],
      executor_uri: 'claude-code://',
    })
    expect(def.stability).toBe('stable')
    expect(def.version).toBe('1.0.0')
    expect(def.model).toBe('claude-opus-4-6')
    expect(def.tools_allow).toEqual(['Read', 'Grep', 'Glob'])
    expect(def.tools_deny).toEqual(['Bash'])
    expect(def.capabilities).toEqual(['code', 'review'])
    expect(def.executor_uri).toBe('claude-code://')
  })

  it('throws conflict error when role already exists', () => {
    // The seeded roles already exist — creating one again throws conflict
    expect(() =>
      createAgentDefinition({
        role: 'software_engineer',
        display_name: 'Software Engineer dup',
        description: 'dup',
      })
    ).toThrow(/already exists/)
  })
})

describe('getAgentDefinition', () => {
  beforeEach(() => setupDb())
  afterEach(() => teardownDb())

  it('retrieves a seeded definition by role', () => {
    // research_worker is seeded by migration_032b
    const def = getAgentDefinition('research_worker')
    expect(def).not.toBeNull()
    expect(def!.role).toBe('research_worker')
  })

  it('returns null for non-existent role', () => {
    const def = getAgentDefinition('nonexistent_role')
    expect(def).toBeNull()
  })
})

describe('updateAgentDefinition', () => {
  beforeEach(() => setupDb())
  afterEach(() => teardownDb())

  it('updates fields on a seeded definition', () => {
    // devops_engineer is seeded — update it directly
    const updated = updateAgentDefinition({
      role: 'devops_engineer',
      model: 'claude-haiku-4-5-20251001',
      stability: 'beta',
      version: '0.2.0',
    })
    expect(updated.model).toBe('claude-haiku-4-5-20251001')
    expect(updated.stability).toBe('beta')
    expect(updated.version).toBe('0.2.0')
    // description from seed row is preserved
    expect(typeof updated.description).toBe('string')
    expect(updated.description.length).toBeGreaterThan(0)
  })

  it('throws not_found for missing role', () => {
    expect(() =>
      updateAgentDefinition({ role: 'nonexistent_role' as never, description: 'x' })
    ).toThrow(/not found/i)
  })
})

describe('listAgentDefinitions', () => {
  beforeEach(() => setupDb())
  afterEach(() => teardownDb())

  it('returns all 24 seeded definitions when no filter given', () => {
    const all = listAgentDefinitions()
    // Migration 032b seeds exactly 24 canonical roles
    expect(all.length).toBe(24)
    expect(all.map(d => d.role)).toContain('software_engineer')
    expect(all.map(d => d.role)).toContain('chief_of_staff')
  })

  it('includes additional created definitions', () => {
    createAgentDefinition({ role: 'test_extra_role', display_name: 'Extra', description: 'Extra role' })
    const all = listAgentDefinitions()
    expect(all.length).toBe(25)
    expect(all.map(d => d.role)).toContain('test_extra_role')
  })

  it('filters by stability — seeded roles are stable', () => {
    const stable = listAgentDefinitions('stable')
    // All 24 seeded roles use stability 'stable'
    expect(stable.length).toBe(24)
    expect(stable.map(d => d.role)).toContain('software_engineer')
  })

  it('filters by stability — experimental returns only user-created ones', () => {
    createAgentDefinition({ role: 'test_exp_role', display_name: 'Exp', description: 'Experimental', stability: 'experimental' })
    const exp = listAgentDefinitions('experimental')
    expect(exp.length).toBe(1)
    expect(exp[0].role).toBe('test_exp_role')
  })
})

describe('tool name validation', () => {
  beforeEach(() => setupDb())
  afterEach(() => teardownDb())

  it('accepts valid tool names in tools_allow', () => {
    expect(() =>
      createAgentDefinition({
        role: 'test_tool_valid',
        display_name: 'Test',
        description: 'Test',
        tools_allow: ['read_file', 'write_memory', 'list-tasks', '_internal'],
      })
    ).not.toThrow()
  })

  it('rejects tools_allow with invalid names', () => {
    expect(() =>
      createAgentDefinition({
        role: 'test_tool_invalid_allow',
        display_name: 'Test',
        description: 'Test',
        tools_allow: ['read file', '123bad'],
      })
    ).toThrow(expect.objectContaining({ code: 'invalid_input' }))
  })

  it('rejects tools_deny with invalid names', () => {
    expect(() =>
      createAgentDefinition({
        role: 'test_tool_invalid_deny',
        display_name: 'Test',
        description: 'Test',
        tools_deny: ['bad name!'],
      })
    ).toThrow(expect.objectContaining({ code: 'invalid_input' }))
  })

  it('rejects tools_allow with invalid name on update', () => {
    createAgentDefinition({ role: 'test_update_tool', display_name: 'T', description: 'T' })
    expect(() =>
      updateAgentDefinition({ role: 'test_update_tool', tools_allow: ['bad name!'] })
    ).toThrow(expect.objectContaining({ code: 'invalid_input' }))
  })
})
