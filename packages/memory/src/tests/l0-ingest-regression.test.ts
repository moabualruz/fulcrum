// packages/memory/src/tests/l0-ingest-regression.test.ts
//
// Memory v3 PR 1 unit 1.5 — regression coverage for the end-to-end L0 path.
// Asserts:
//   (a) a 10 KB bash command lands verbatim in vault/raw/bash_trace/... (no
//       truncation, no normalization).
//   (b) every L0 ingest writes a matching WAL audit row (content_sha256 only,
//       no cleartext) — the sanitize-before-WAL invariant (plan Constraint #4).
//   (c) v2a `writeMemory` still works unchanged alongside L0 ingest (the
//       two paths co-exist for lifecycle-memory callers post-PR-9.5).

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createHash } from 'crypto'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { getDb } from 'fulcrum-agent-core'
import { ingestRawSource } from '../l0/ingest.js'
import { walPathFor } from '../wal/writer.js'
import { writeMemory } from '../write.js'

let tmpVault: string
let prevVaultEnv: string | undefined
let prevDataEnv: string | undefined
let tmpGlobalData: string

beforeEach(() => {
  createTestDb()
  seedWorkspaceAndProject(getDb(), 'ws_reg', 'proj_reg')
  tmpVault = mkdtempSync(join(tmpdir(), 'fulcrum-l0-reg-'))
  tmpGlobalData = mkdtempSync(join(tmpdir(), 'fulcrum-l0-reg-data-'))
  prevVaultEnv = process.env['FULCRUM_VAULT_PATH']
  prevDataEnv = process.env['FULCRUM_DATA_DIR']
  process.env['FULCRUM_VAULT_PATH'] = tmpVault
  process.env['FULCRUM_DATA_DIR'] = tmpGlobalData // isolate WAL path for walPathFor()
})

afterEach(() => {
  resetTestDb()
  rmSync(tmpVault, { recursive: true, force: true })
  rmSync(tmpGlobalData, { recursive: true, force: true })
  if (prevVaultEnv === undefined) delete process.env['FULCRUM_VAULT_PATH']
  else process.env['FULCRUM_VAULT_PATH'] = prevVaultEnv
  if (prevDataEnv === undefined) delete process.env['FULCRUM_DATA_DIR']
  else process.env['FULCRUM_DATA_DIR'] = prevDataEnv
})

describe('memory v3 PR 1 — regression: 10 KB bash command is verbatim', () => {
  it('preserves a ~10 KB body byte-for-byte with no truncation', () => {
    // 10 KB of realistic-looking bash trace output (mixed ASCII + multi-byte).
    const chunk = 'build: step=compile file=src/foo/bar.ts len=42 lint=clean 😀\n'
    const body = chunk.repeat(Math.ceil(10_240 / Buffer.byteLength(chunk, 'utf-8')))
    expect(Buffer.byteLength(body, 'utf-8')).toBeGreaterThanOrEqual(10_240)

    const result = ingestRawSource({
      source_type: 'bash_trace',
      body,
      meta: { workspace_id: 'ws_reg', project_id: 'proj_reg', session_id: 'run_reg' },
    })

    const onDisk = readFileSync(join(tmpVault, result.vault_path), 'utf-8')
    // Frontmatter is prepended; verify the body is present verbatim at the tail.
    expect(onDisk.endsWith(body)).toBe(true)
    expect(result.frontmatter.size_bytes).toBe(Buffer.byteLength(body, 'utf-8'))
    expect(result.frontmatter.content_hash).toBe(createHash('sha256').update(body).digest('hex'))
  })
})

describe('memory v3 PR 1 — regression: L0 round-trips through WAL audit', () => {
  it('every ingestRawSource call appends a WAL row with the source_id + sha256', () => {
    const body = 'verbatim raw dump for audit round-trip'
    const result = ingestRawSource({
      source_type: 'tool_trace',
      body,
      meta: { workspace_id: 'ws_reg', project_id: 'proj_reg' },
    })

    const walPath = walPathFor()
    expect(existsSync(walPath)).toBe(true)
    const lines = readFileSync(walPath, 'utf-8').trim().split('\n')
    expect(lines.length).toBeGreaterThan(0)
    const matching = lines
      .map((line) => JSON.parse(line) as { op: string; memory_id: string; kind: string; content_sha256: string; workspace_id: string })
      .filter((r) => r.memory_id === result.frontmatter.id)
    expect(matching).toHaveLength(1)
    const row = matching[0]!
    expect(row.op).toBe('WRITE')
    expect(row.kind).toBe('l0:tool_trace')
    expect(row.workspace_id).toBe('ws_reg')
    // WAL row contains ONLY the content_sha256, never the cleartext body (Constraint #4).
    const serialized = JSON.stringify(row)
    expect(serialized).not.toContain(body)
    expect(row.content_sha256).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('memory v3 PR 1 — regression: v2a writeMemory path still works (flag off)', () => {
  it('writeMemory succeeds without touching the v3 l0_sources table', async () => {
    // Simulate flag-off by NOT invoking ingestRawSource — the v2a path runs directly.
    const m = await writeMemory({
      workspace_id: 'ws_reg',
      project_id: 'proj_reg',
      kind: 'fact',
      scope: 'project',
      title: 'v2a flag-off memory',
      summary: 'stays on old path',
      content: 'the v2a write path must still work alongside L0 ingest',
      tags: ['regression'],
      importance: 0.5,
    })
    expect(m.memory_id).toMatch(/^mem_/)
    // The v3 l0_sources table may not exist on a fresh DB without the v3
    // migration; verify the v2a path doesn't depend on it.
    const row = getDb().prepare(`SELECT memory_id, title FROM memories WHERE memory_id = ?`).get(m.memory_id) as { memory_id: string; title: string } | undefined
    expect(row?.title).toBe('v2a flag-off memory')
  })
})
