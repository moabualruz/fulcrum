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
    const def = createAgentDefinition({
      role: 'software_engineer',
      display_name: 'Software Engineer',
      description: 'Writes and reviews code',
    })
    expect(def.id).toMatch(/^adef_[0-9A-Z]+$/)
    expect(def.role).toBe('software_engineer')
    expect(def.display_name).toBe('Software Engineer')
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
      role: 'code_reviewer',
      display_name: 'Code Reviewer',
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
    createAgentDefinition({
      role: 'qa_engineer',
      display_name: 'QA Engineer',
      description: 'Tests software',
    })
    expect(() =>
      createAgentDefinition({
        role: 'qa_engineer',
        display_name: 'QA Engineer dup',
        description: 'dup',
      })
    ).toThrow(/already exists/)
  })
})

describe('getAgentDefinition', () => {
  beforeEach(() => setupDb())
  afterEach(() => teardownDb())

  it('retrieves an existing definition by role', () => {
    createAgentDefinition({
      role: 'research_worker',
      display_name: 'Research Worker',
      description: 'Gathers information',
    })
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

  it('updates fields on an existing definition', () => {
    createAgentDefinition({
      role: 'devops_engineer',
      display_name: 'DevOps Engineer',
      description: 'Manages infrastructure',
    })
    const updated = updateAgentDefinition({
      role: 'devops_engineer',
      model: 'claude-haiku-4-5-20251001',
      stability: 'beta',
      version: '0.2.0',
    })
    expect(updated.model).toBe('claude-haiku-4-5-20251001')
    expect(updated.stability).toBe('beta')
    expect(updated.version).toBe('0.2.0')
    // unchanged fields stay
    expect(updated.description).toBe('Manages infrastructure')
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

  it('returns all definitions when no filter given', () => {
    createAgentDefinition({ role: 'analyst', display_name: 'Analyst', description: 'Analyzes data' })
    createAgentDefinition({ role: 'orchestrator', display_name: 'Orchestrator', description: 'Orchestrates agents', stability: 'stable' })
    const all = listAgentDefinitions()
    expect(all.length).toBe(2)
    expect(all.map(d => d.role).sort()).toEqual(['analyst', 'orchestrator'])
  })

  it('filters by stability', () => {
    createAgentDefinition({ role: 'tech_lead', display_name: 'Tech Lead', description: 'Leads technically', stability: 'stable' })
    createAgentDefinition({ role: 'ml_engineer', display_name: 'ML Engineer', description: 'ML work', stability: 'experimental' })
    const stable = listAgentDefinitions('stable')
    expect(stable.length).toBe(1)
    expect(stable[0].role).toBe('tech_lead')
  })

  it('returns empty array when no definitions exist', () => {
    expect(listAgentDefinitions()).toEqual([])
  })
})
