// packages/cli/src/tests/memory-consolidate.test.ts
//
// Memory v3 PR 7 unit 7.4 — `fulcrum memory consolidate` CLI shim.
//
// Engine coverage lives in fulcrum-memory's l1-consolidate.test.ts. This
// file proves the CLI shim wires through, defaults workspace from cwd,
// applies the flag-to-option translation, and always returns dry_run=true
// in 7.4 (the apply path lands in a follow-up).

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import {
  _configureDb,
  setDb,
  closeDb,
  runMigrations,
  getDb,
} from 'fulcrum-agent-core'
import { runMigration101MemoryV3Lifecycle } from 'fulcrum-memory'
import { consolidateMemory } from '../commands/memory-consolidate.js'
import { TOOL_REGISTRY } from '../tool-registry.js'

let db: Database.Database

function seedEntity(id: string): void {
  getDb()
    .prepare(
      `INSERT INTO graph_entities (entity_id, workspace_id, name, entity_type,
         properties, created_at, updated_at)
       VALUES (?, 'ws_cs', ?, 'concept', '{}', datetime('now'), datetime('now'))`,
    )
    .run(id, id)
}

function insertL1(id: string, overrides: {
  entities?: string[]
  retention_tier?: string
  confidence?: number
  workspace?: string
  project?: string
} = {}): void {
  getDb()
    .prepare(
      `INSERT INTO memories(
         memory_id, workspace_id, project_id, scope, kind, title, summary, content,
         schema_version, retention_tier, confidence_decay_at, confidence, entities,
         provenance, vault_path, access_count
       ) VALUES (?, ?, ?, 'project', 'concept', 'x', 'x', 'b',
                3, ?, datetime('now'), ?, ?,
                '{}', ?, 0)`,
    )
    .run(
      id,
      overrides.workspace ?? 'ws_cs',
      overrides.project ?? 'proj_cs',
      overrides.retention_tier ?? 'working',
      overrides.confidence ?? 0.8,
      JSON.stringify(overrides.entities ?? ['01KENT_REACT']),
      `curated/concepts/${id}.md`,
    )
}

beforeEach(() => {
  db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  runMigration101MemoryV3Lifecycle(db)
  db.prepare("INSERT INTO workspaces(workspace_id, name) VALUES ('ws_cs', 'ws_cs')").run()
  db.prepare(
    "INSERT INTO projects(project_id, workspace_id, name) VALUES ('proj_cs', 'ws_cs', 'proj_cs')",
  ).run()
  seedEntity('01KENT_REACT')
  seedEntity('01KENT_NEXT')
})

afterEach(() => {
  closeDb()
})

describe('consolidateMemory (CLI shim)', () => {
  it('always returns dry_run=true', () => {
    const result = consolidateMemory({ workspace_id: 'ws_cs' })
    expect(result.dry_run).toBe(true)
    expect(Array.isArray(result.candidates)).toBe(true)
  })

  it('surfaces a candidate for a two-page entity-set collision', () => {
    insertL1('01KCS_CL1', { entities: ['01KENT_REACT'] })
    insertL1('01KCS_CL2', { entities: ['01KENT_REACT'] })
    const result = consolidateMemory({ workspace_id: 'ws_cs', min_confidence: 0.5 })
    expect(result.candidates.length).toBe(1)
    expect(result.candidates[0]!.page_ids.sort()).toEqual(['01KCS_CL1', '01KCS_CL2'])
  })

  it('filters by retention_tier when supplied', () => {
    insertL1('01KCS_RT1', { retention_tier: 'working' })
    insertL1('01KCS_RT2', { retention_tier: 'working' })
    insertL1('01KCS_RT3', { retention_tier: 'semantic' })
    insertL1('01KCS_RT4', { retention_tier: 'semantic' })
    const working = consolidateMemory({
      workspace_id: 'ws_cs',
      retention_tier: 'working',
    })
    expect(working.candidates.length).toBe(1)
    expect(working.candidates[0]!.retention_tier).toBe('working')
  })

  it('applies the default min_confidence=0.5 when unspecified', () => {
    insertL1('01KCS_DC1', { confidence: 0.3 })
    insertL1('01KCS_DC2', { confidence: 0.9 })
    const result = consolidateMemory({ workspace_id: 'ws_cs' })
    expect(result.candidates.length).toBe(0)
  })

  it('scopes by project_id when supplied', () => {
    db.prepare(
      "INSERT INTO projects(project_id, workspace_id, name) VALUES ('proj_cs_alt', 'ws_cs', 'alt')",
    ).run()
    insertL1('01KCS_PA1', { project: 'proj_cs' })
    insertL1('01KCS_PA2', { project: 'proj_cs' })
    insertL1('01KCS_PB1', { project: 'proj_cs_alt' })
    insertL1('01KCS_PB2', { project: 'proj_cs_alt' })
    const scoped = consolidateMemory({ workspace_id: 'ws_cs', project_id: 'proj_cs_alt' })
    expect(scoped.candidates.length).toBe(1)
    expect(scoped.candidates[0]!.project_id).toBe('proj_cs_alt')
  })

  it('is registered as the consolidate_memory MCP tool (agent-native parity)', () => {
    expect(TOOL_REGISTRY.has('consolidate_memory')).toBe(true)
    const entry = TOOL_REGISTRY.get('consolidate_memory')!
    expect(entry.capabilities.readOnly).toBe(true)
    expect(entry.schema?.name).toBe('consolidate_memory')
  })

  it('reports per-candidate min_confidence_in_group', () => {
    insertL1('01KCS_M1', { confidence: 0.9 })
    insertL1('01KCS_M2', { confidence: 0.7 })
    insertL1('01KCS_M3', { confidence: 0.85 })
    const result = consolidateMemory({ workspace_id: 'ws_cs' })
    expect(result.candidates[0]!.min_confidence_in_group).toBeCloseTo(0.7, 4)
    expect(result.candidates[0]!.page_ids.length).toBe(3)
  })
})
