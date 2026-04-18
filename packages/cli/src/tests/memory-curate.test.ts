// packages/cli/src/tests/memory-curate.test.ts
//
// Memory v3 PR 3 unit 3.6 — `fulcrum memory curate` end-to-end via a stub
// curator backend. Exercises the real ingestRawSource → DB row → vault file
// → runCurator → applyCuratorOutput pipeline; only the LLM call itself is
// stubbed.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { _configureDb, setDb, closeDb, runMigrations, getDb } from 'fulcrum-agent-core'
import {
  runMigration101MemoryV3Lifecycle,
  ingestRawSource,
  clearBackendsForTest,
  registerBackend,
  getBackend,
  type CuratorBackend,
  type CuratorBackendResult,
} from 'fulcrum-memory'
import { curateMemory } from '../commands/memory-curate.js'

let tmpVault: string
let prevVaultEnv: string | undefined

function freshDb(): void {
  const db = new Database(':memory:')
  _configureDb(db)
  runMigrations(db)
  runMigration101MemoryV3Lifecycle(db)
  db.prepare("INSERT OR IGNORE INTO workspaces(workspace_id, name) VALUES (?, ?)").run('ws_cli', 'ws_cli')
  db.prepare("INSERT OR IGNORE INTO projects(project_id, workspace_id, name) VALUES (?, ?, ?)").run('proj_cli', 'ws_cli', 'proj_cli')
  setDb(db)
}

function stubBackend(
  name: 'codex' | 'openai' | 'pi' | 'anthropic',
  raw_text: string,
): CuratorBackend {
  return {
    name,
    async isAvailable() {
      return true
    },
    async curate(input): Promise<CuratorBackendResult> {
      return {
        raw_text,
        backend: name,
        model: input.model,
        duration_ms: 1,
      }
    },
  }
}

beforeEach(() => {
  freshDb()
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-curate-cli-'))
  prevVaultEnv = process.env['FULCRUM_VAULT_PATH']
  process.env['FULCRUM_VAULT_PATH'] = tmpVault
  clearBackendsForTest()
})

afterEach(() => {
  closeDb()
  rmSync(tmpVault, { recursive: true, force: true })
  if (prevVaultEnv === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultEnv
  clearBackendsForTest()
})

function seedL0(): { source_id: string } {
  const file = ingestRawSource({
    source_type: 'bash_trace',
    body: 'pnpm build\nok\n',
    meta: { workspace_id: 'ws_cli', project_id: 'proj_cli', cwd: '/home/mkh' },
  })
  return { source_id: file.frontmatter.id }
}

function curatorOutputFor(source_id: string): string {
  return JSON.stringify({
    new_pages: [
      {
        type: 'page',
        name: null,
        title: 'Build trace',
        entity_type: null,
        aliases: null,
        confidence: 0.8,
        retention_tier: 'working',
        sources: [source_id],
        sources_via: [],
        entities: [],
        body: `# Build trace\n\nSee [[raw/bash_trace/2026/04/18/${source_id}]].\n`,
      },
    ],
    updates: [],
    supersessions: [],
    new_edges: [],
  })
}

describe('curateMemory', () => {
  it('pipes an L0 source through a stub codex backend and applies the CuratorOutput', async () => {
    const { source_id } = seedL0()
    // Override codex via the registry before the CLI registers the real one.
    registerBackend(stubBackend('codex', curatorOutputFor(source_id)))
    const result = await curateMemory({ l0_id: source_id, backend: 'codex' })
    expect(result.backend).toBe('codex')
    expect(result.apply.dry_run).toBe(false)
    expect(result.apply.created_page_ids).toHaveLength(1)
  })

  it('--dry-run produces a diff-shaped ApplyResult without DB or vault writes', async () => {
    const { source_id } = seedL0()
    registerBackend(stubBackend('codex', curatorOutputFor(source_id)))
    const result = await curateMemory({ l0_id: source_id, backend: 'codex', dry_run: true })
    expect(result.apply.dry_run).toBe(true)
    expect(result.apply.created_page_ids).toHaveLength(1)
    // No memories row landed.
    const row = getDb().prepare('SELECT COUNT(*) AS n FROM memories WHERE workspace_id = ?').get('ws_cli') as { n: number }
    expect(row.n).toBe(0)
  })

  it('backend flag routes to the explicit backend', async () => {
    const { source_id } = seedL0()
    registerBackend(stubBackend('codex', curatorOutputFor(source_id)))
    registerBackend(stubBackend('openai', curatorOutputFor(source_id)))
    const result = await curateMemory({ l0_id: source_id, backend: 'openai' })
    expect(result.backend).toBe('openai')
  })

  it('throws when the l0_id is unknown', async () => {
    await expect(
      curateMemory({ l0_id: 'l0src_missing_ULID' }),
    ).rejects.toThrow(/not found|l0 source/i)
  })

  it('throws when the l0 vault file is missing on disk', async () => {
    const { source_id } = seedL0()
    // Blow away the vault file after it was ingested.
    rmSync(join(tmpVault, 'raw'), { recursive: true, force: true })
    registerBackend(stubBackend('codex', curatorOutputFor(source_id)))
    await expect(
      curateMemory({ l0_id: source_id, backend: 'codex' }),
    ).rejects.toThrow(/file missing/i)
  })

  it('curateMemory re-registers default backends (codex+pi+openai) so subsequent calls work out of the box', async () => {
    const { source_id } = seedL0()
    // Do NOT pre-register a codex stub — exercise the default path.
    // Expected: codex backend is registered by curateMemory but
    // `codexBackend.isAvailable()` returns false when FULCRUM_CODEX_BINARY
    // points at a nonexistent path, so selectBackend falls through to
    // openai. We fail with a clear "no backend available" unless we stub.
    process.env['FULCRUM_CODEX_BINARY'] = '/nonexistent'
    delete process.env['OPENAI_API_KEY']
    await expect(
      curateMemory({ l0_id: source_id }),
    ).rejects.toThrow(/no curator backend/i)
    delete process.env['FULCRUM_CODEX_BINARY']
    expect(getBackend('codex')).not.toBeNull()
    expect(getBackend('pi')).not.toBeNull()
    expect(getBackend('openai')).not.toBeNull()
  })
})

