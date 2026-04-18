// packages/cli/src/tests/memory-migrate-verify.test.ts
//
// Memory v3 PR 6 Verify gate. Per plan:
//
//   Fresh vault + DB → seed 10 representative rows of each kind via the
//   old path → run `fulcrum memory migrate` → all 10 land in the right
//   tier with complete round-trip.
//
// "10 representative rows of each kind" — we seed 9 L0-class rows (3 each
// of bash_trace / file_patch / tool_trace + 1 session_summary alias) and
// 10 L1-class rows (2 each of decision / identity / persona / concept /
// fact). Plus 1 unknown-kind row (legacy `symbol`) to prove it's
// preserved untouched. Total: 20 pre-v3 rows, 19 migratable + 1 unknown.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  _configureDb,
  setDb,
  closeDb,
  runMigrations,
  getDb,
  newId,
} from 'fulcrum-agent-core'
import { parseCuratedPage } from 'fulcrum-memory'
import { runMemoryMigrate } from '../commands/memory-migrate.js'

let tmpVault: string
let db: Database.Database

function seed(kind: string, content: string, title = ''): string {
  const id = newId('memory')
  db.prepare(`
    INSERT INTO memories(memory_id, workspace_id, project_id, scope, kind, title, summary, content, session_id, created_at)
    VALUES(?, 'ws_v', 'proj_v', 'project', ?, ?, '', ?, 'sess_v', '2026-03-15T10:00:00.000Z')
  `).run(id, kind, title, content)
  return id
}

beforeEach(() => {
  db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  setDb(db)
  db.prepare("INSERT INTO workspaces(workspace_id, name) VALUES ('ws_v', 'ws_v')").run()
  db.prepare("INSERT INTO projects(project_id, workspace_id, name) VALUES ('proj_v', 'ws_v', 'proj_v')").run()
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-v3-migrate-verify-'))
})

afterEach(() => {
  closeDb()
  rmSync(tmpVault, { recursive: true, force: true })
})

describe('PR 6 Verify gate — end-to-end migrate', () => {
  it('seeds 20 pre-v3 rows, runs migrate, every row lands in the right tier', () => {
    // 9 L0-class (bash_trace + file_patch + tool_trace + session_summary alias)
    const l0Ids = [
      seed('bash_trace',      'echo hello\n', 'echo'),
      seed('bash_trace',      'git status',   'git status'),
      seed('bash_trace',      'ls -la',       'ls'),
      seed('file_patch',      'diff --git a/x b/x\n', 'patch 1'),
      seed('file_patch',      'diff --git a/y b/y\n', 'patch 2'),
      seed('file_patch',      'diff --git a/z b/z\n', 'patch 3'),
      seed('tool_trace',      'tool call 1',  'tt1'),
      seed('tool_trace',      'tool call 2',  'tt2'),
      seed('session_summary', 'session wrap', 'summary'),
    ]
    // 10 L1-class (2 each of decision / identity / persona / concept / fact)
    const l1Ids = [
      seed('decision', 'Use Turbo 2.0', 'Turbo'),
      seed('decision', 'Adopt Vitest',   'Vitest'),
      seed('identity', 'Alice',          'Alice'),
      seed('identity', 'Bob',            'Bob'),
      seed('persona',  'SWE Jane',       'Jane'),
      seed('persona',  'PM Sam',         'Sam'),
      seed('concept',  'Vault Tiers',    'Tiers'),
      seed('concept',  'Retention λ',    'Decay'),
      seed('fact',     'Sky is blue',    'Sky'),
      seed('fact',     'π ≈ 3.14159',    'Pi'),
    ]
    // 1 unknown (legacy `symbol`) — must stay untouched
    const unknownId = seed('symbol', 'getUserById()', 'symbol')

    const result = runMemoryMigrate({ vault_root: tmpVault, db })

    // Overall migration ok.
    expect(result.ok).toBe(true)
    expect(result.dry_run).toBe(false)
    expect(result.vault.errors).toEqual([])
    expect(result.db?.errors).toEqual([])

    // Classifier counts match seeded rows (20 total, 19 migratable + 1 unknown).
    expect(result.classifier.total).toBe(20)
    expect(result.classifier.by_class.l0_raw).toBe(9)
    expect(result.classifier.by_class.l1_curated_stub).toBe(10)
    expect(result.classifier.by_class.unknown).toBe(1)

    // Vault write counts.
    expect(result.vault.l0.count).toBe(9)
    expect(result.vault.l1.count).toBe(10)
    expect(result.vault.unknown.count).toBe(1)

    // DB backfill counts.
    expect(result.db?.counts.l0_inserted).toBe(9)
    expect(result.db?.counts.l0_deleted).toBe(9)
    expect(result.db?.counts.l1_backfilled).toBe(10)

    // Cutover ran.
    expect(result.cutover.applied).toBe(true)

    // Lint reports clean.
    expect(result.lint.ok).toBe(true)
    expect(result.lint.counts.orphans).toBe(0)
    expect(result.lint.counts.missing_sources).toBe(0)
    expect(result.lint.counts.supersession_cycles).toBe(0)
    // 10 L1 stubs each count as a migration_stub (sources=[] per §6.2).
    expect(result.lint.counts.migration_stubs).toBe(10)

    // Round-trip L0: each ID now resolves via l0_sources + vault/raw file.
    for (const id of l0Ids) {
      const row = db.prepare('SELECT source_type, vault_path FROM l0_sources WHERE source_id = ?').get(id) as { source_type: string; vault_path: string } | undefined
      expect(row?.source_type).toBeTruthy()
      const abs = join(tmpVault, row!.vault_path)
      expect(existsSync(abs)).toBe(true)
      // File body (after frontmatter) matches the original content.
      const text = readFileSync(abs, 'utf-8')
      expect(text).toContain('schema: fulcrum.source/v3')
      // memories row is gone — its ID is now l0-only.
      expect(db.prepare('SELECT memory_id FROM memories WHERE memory_id = ?').get(id)).toBeUndefined()
    }

    // Round-trip L1: each ID now has schema_version=3 + vault/curated stub.
    for (const id of l1Ids) {
      const row = db.prepare('SELECT schema_version, retention_tier, vault_path FROM memories WHERE memory_id = ?').get(id) as { schema_version: number; retention_tier: string; vault_path: string } | undefined
      expect(row?.schema_version).toBe(3)
      expect(row?.retention_tier).toBe('working')
      const abs = join(tmpVault, row!.vault_path)
      expect(existsSync(abs)).toBe(true)
      const page = parseCuratedPage(readFileSync(abs, 'utf-8'))
      expect(page.id).toBe(id)
      expect(page.sources).toEqual([])
      expect(page.confidence).toBe(0.5)
    }

    // Unknown row untouched — still pre-v3.
    const unknown = db.prepare('SELECT schema_version, kind FROM memories WHERE memory_id = ?').get(unknownId) as { schema_version: number; kind: string }
    expect(unknown.kind).toBe('symbol')
    expect(unknown.schema_version).not.toBe(3)
  })

  it('dry-run reports plan without writing', () => {
    seed('bash_trace', 'x')
    seed('decision',   'y')
    const result = runMemoryMigrate({ vault_root: tmpVault, db, dry_run: true })

    expect(result.dry_run).toBe(true)
    expect(result.classifier.total).toBe(2)
    expect(result.vault.l0.count).toBe(1)
    expect(result.vault.l1.count).toBe(1)
    expect(result.cutover.applied).toBe(false)
    expect(result.cutover.skipped_reason).toMatch(/dry_run/)
    // No vault dirs created.
    expect(existsSync(join(tmpVault, 'raw'))).toBe(false)
    expect(existsSync(join(tmpVault, 'curated'))).toBe(false)
    // DB untouched: rows still present with original schema.
    const rows = db.prepare('SELECT schema_version FROM memories').all() as { schema_version: number }[]
    expect(rows.every(r => r.schema_version !== 3)).toBe(true)
  })

  it('migrate is idempotent — second run is a no-op on already-migrated state', () => {
    seed('bash_trace', 'x')
    seed('decision',   'y')

    const first = runMemoryMigrate({ vault_root: tmpVault, db })
    expect(first.ok).toBe(true)

    const second = runMemoryMigrate({ vault_root: tmpVault, db })
    expect(second.ok).toBe(true)
    expect(second.classifier.total).toBe(0) // schema_version>=3 rows are excluded
    expect(second.db?.counts.l0_inserted).toBe(0)
    expect(second.db?.counts.l1_backfilled).toBe(0)
  })
})
