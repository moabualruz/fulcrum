// packages/cli/src/tests/memory-lint.test.ts
//
// Memory v3 PR 6 unit 6.5 — `fulcrum memory lint` CLI + MCP shim.
//
// Thin tests: the underlying lint engine is covered in fulcrum-memory's
// migration-lint.test.ts. These tests prove the CLI shim and MCP tool
// wire through to the engine and surface the full LintReport shape.

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
import { lintMemory } from '../commands/memory-lint.js'
import { TOOL_REGISTRY } from '../tool-registry.js'

let db: Database.Database

function insertL1(id: string, opts: { sources?: string[] } = {}): void {
  getDb().prepare(`
    INSERT INTO memories(
      memory_id, workspace_id, project_id, scope, kind, title, summary, content,
      schema_version, retention_tier, confidence_decay_at, provenance, vault_path
    ) VALUES (?, 'ws_l', 'proj_l', 'project', 'decision', '', '', 'body',
              3, 'working', datetime('now'), ?, ?)
  `).run(id, JSON.stringify({ sources: opts.sources ?? [] }), `curated/pages/${id}.md`)
}

beforeEach(() => {
  db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  runMigration101MemoryV3Lifecycle(db)
  db.prepare("INSERT INTO workspaces(workspace_id, name) VALUES ('ws_l', 'ws_l')").run()
  db.prepare("INSERT INTO projects(project_id, workspace_id, name) VALUES ('proj_l', 'ws_l', 'proj_l')").run()
})

afterEach(() => {
  closeDb()
})

describe('lintMemory (CLI shim)', () => {
  it('returns ok=true on a clean vault', () => {
    const report = lintMemory()
    expect(report.ok).toBe(true)
    expect(report.counts.pages_checked).toBe(0)
    expect(report.issues).toEqual([])
  })

  it('ok=false when a sources[] entry does not resolve to l0_sources', () => {
    insertL1('mem_01ABC', { sources: ['mem_missing'] })
    const report = lintMemory()
    expect(report.ok).toBe(false)
    expect(report.counts.missing_sources).toBe(1)
    expect(report.issues.some(i => i.code === 'MISSING_SOURCE')).toBe(true)
  })

  it('counts migration_stubs separately from orphans', () => {
    insertL1('mem_stub')
    const report = lintMemory()
    expect(report.counts.migration_stubs).toBe(1)
    expect(report.counts.orphans).toBe(0)
    expect(report.ok).toBe(true)
  })
})

describe('lint_memory (MCP tool)', () => {
  it('is registered in TOOL_REGISTRY', () => {
    expect(TOOL_REGISTRY.has('lint_memory')).toBe(true)
  })

  it('handler returns the same LintReport shape', async () => {
    insertL1('mem_good')
    const entry = TOOL_REGISTRY.get('lint_memory')!
    const result = await entry.handler({}, { workspace_id: 'ws_l', project_id: 'proj_l' }) as any
    expect(result).toMatchObject({
      ok: expect.any(Boolean),
      counts: expect.objectContaining({ pages_checked: 1 }),
      issues: expect.any(Array),
    })
  })

  it('is read-only', () => {
    const entry = TOOL_REGISTRY.get('lint_memory')!
    expect(entry.capabilities.readOnly).toBe(true)
    expect(entry.capabilities.destructive).toBe(false)
  })
})
