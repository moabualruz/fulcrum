// packages/cli/src/tests/memory-rollback-v2.test.ts
//
// Memory v3 PR 6 unit 6.6 — `fulcrum memory rollback --to v2`.
//
// Operator-only command. NOT registered in TOOL_REGISTRY — a compromised
// agent with action-exec access cannot call it.
//
// Mode 1 (snapshot restore): copy a pre-migration DB file over the current
// fulcrum.db and reopen. The only safe rollback path plan §6.6 calls out.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, existsSync, writeFileSync, statSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  _configureDb,
  setDb,
  closeDb,
  runMigrations,
  getDb,
} from 'fulcrum-agent-core'
import { runMigration101MemoryV3Lifecycle } from 'fulcrum-memory'
import { rollbackToV2Snapshot } from '../commands/memory-rollback.js'
import { TOOL_REGISTRY } from '../tool-registry.js'

let tmpData: string
let snapshotPath: string
let livePath: string

function buildPreV3Snapshot(dest: string): void {
  const db = new Database(dest)
  _configureDb(db)
  runMigrations(db)
  // Seed a workspace + memory but do NOT run 101 — this is pre-v3 state.
  db.prepare("INSERT INTO workspaces(workspace_id, name) VALUES ('ws_snap', 'ws_snap')").run()
  db.prepare("INSERT INTO projects(project_id, workspace_id, name) VALUES ('proj_snap', 'ws_snap', 'proj_snap')").run()
  db.prepare(`
    INSERT INTO memories(memory_id, workspace_id, project_id, scope, kind, title, summary, content)
    VALUES('mem_pre_v3_01', 'ws_snap', 'proj_snap', 'project', 'decision', '', '', 'original body')
  `).run()
  db.close()
}

beforeEach(() => {
  tmpData = mkdtempSync(join(tmpdir(), 'fulcrum-mig-rollback-'))
  snapshotPath = join(tmpData, 'pre-v3-snapshot.db')
  livePath = join(tmpData, 'fulcrum.db')
  buildPreV3Snapshot(snapshotPath)

  // Bring up a live DB that has already migrated to v3.
  const db = new Database(livePath)
  _configureDb(db)
  runMigrations(db)
  runMigration101MemoryV3Lifecycle(db)
  db.prepare("INSERT INTO workspaces(workspace_id, name) VALUES ('ws_live', 'ws_live')").run()
  db.prepare("INSERT INTO projects(project_id, workspace_id, name) VALUES ('proj_live', 'ws_live', 'proj_live')").run()
  db.prepare(`
    INSERT INTO memories(memory_id, workspace_id, project_id, scope, kind, title, summary, content, schema_version, retention_tier, confidence_decay_at)
    VALUES('mem_post_v3_01', 'ws_live', 'proj_live', 'project', 'decision', '', '', 'post-migration body', 3, 'working', datetime('now'))
  `).run()
  db.close()
})

afterEach(() => {
  closeDb()
  rmSync(tmpData, { recursive: true, force: true })
})

describe('rollbackToV2Snapshot — happy path', () => {
  it('requires --yes-rollback-to-v2 consent', () => {
    expect(() => rollbackToV2Snapshot({ snapshot: snapshotPath, liveDbPath: livePath, yes: false }))
      .toThrowError(/yes-rollback-to-v2|confirm/i)
  })

  it('rejects a missing snapshot file', () => {
    expect(() => rollbackToV2Snapshot({
      snapshot: join(tmpData, 'nope.db'),
      liveDbPath: livePath,
      yes: true,
    })).toThrowError(/snapshot .* not found/i)
  })

  it('rejects a snapshot that still has v3 tables', () => {
    // Use the live DB as a bad "snapshot" — it has l0_sources from 101.
    expect(() => rollbackToV2Snapshot({
      snapshot: livePath,
      liveDbPath: livePath,
      yes: true,
    })).toThrowError(/snapshot .* already migrated|l0_sources/i)
  })

  it('copies snapshot over the live DB and returns a report', () => {
    const result = rollbackToV2Snapshot({ snapshot: snapshotPath, liveDbPath: livePath, yes: true })
    expect(result.mode).toBe('snapshot')
    expect(result.restored_bytes).toBe(statSync(snapshotPath).size)

    // Reopen and verify only the pre-v3 row exists + no l0_sources table.
    const db = new Database(livePath)
    _configureDb(db)
    setDb(db)
    const rows = db.prepare('SELECT memory_id FROM memories').all() as { memory_id: string }[]
    expect(rows.map(r => r.memory_id)).toEqual(['mem_pre_v3_01'])
    const l0 = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='l0_sources'`).get()
    expect(l0).toBeUndefined()
  })

  it('cleans vault/raw + vault/curated when --clean-v3-vault is set', () => {
    const vaultRoot = join(tmpData, 'vault')
    const rawDir = join(vaultRoot, 'raw', 'bash_trace')
    const curatedDir = join(vaultRoot, 'curated', 'pages')
    const { mkdirSync } = require('fs') as typeof import('fs')
    mkdirSync(rawDir, { recursive: true })
    mkdirSync(curatedDir, { recursive: true })
    writeFileSync(join(rawDir, 'a.md'), 'x', 'utf-8')
    writeFileSync(join(curatedDir, 'b.md'), 'y', 'utf-8')

    rollbackToV2Snapshot({
      snapshot: snapshotPath,
      liveDbPath: livePath,
      yes: true,
      vaultRoot,
      cleanV3Vault: true,
    })
    expect(existsSync(join(vaultRoot, 'raw'))).toBe(false)
    expect(existsSync(join(vaultRoot, 'curated'))).toBe(false)
  })

  it('leaves vault/memories untouched (v2a data)', () => {
    const vaultRoot = join(tmpData, 'vault')
    const memoriesDir = join(vaultRoot, 'memories')
    const { mkdirSync } = require('fs') as typeof import('fs')
    mkdirSync(memoriesDir, { recursive: true })
    writeFileSync(join(memoriesDir, 'keep.md'), 'z', 'utf-8')

    rollbackToV2Snapshot({
      snapshot: snapshotPath,
      liveDbPath: livePath,
      yes: true,
      vaultRoot,
      cleanV3Vault: true,
    })
    expect(existsSync(join(memoriesDir, 'keep.md'))).toBe(true)
  })
})

describe('rollback is not agent-exposed', () => {
  it('is NOT in TOOL_REGISTRY', () => {
    expect(TOOL_REGISTRY.has('rollback_memory_to_v2')).toBe(false)
    expect(TOOL_REGISTRY.has('rollback_memory')).toBe(false)
  })
})
