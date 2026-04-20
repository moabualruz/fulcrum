// packages/cli/src/tests/hook-bias-variant-b.test.ts
//
// PR 3 R1 — Variant B (passive injection) coverage.
// Covers: FULCRUM_BIAS_VARIANT=B activates passive injection; Grep / Glob /
// Read queries are extracted correctly; recall timeout falls through to
// Variant A; telemetry records passive_injection events; Variant B only
// fires on trusted sessions.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  getDb,
  closeDb,
  runMigrations,
} from 'fulcrum-agent-core'
import { runPreHook, type HookContext, type HookIO } from '../index.js'

let tmpDir: string | null = null
const originalFulcrumDir = process.env.FULCRUM_DATA_DIR
const originalNoNudge = process.env.FULCRUM_NO_RECALL_NUDGE
const originalVariant = process.env.FULCRUM_BIAS_VARIANT

function setupTmpDb(): void {
  closeDb()
  tmpDir = mkdtempSync(join(tmpdir(), 'fulcrum-variant-b-'))
  process.env.FULCRUM_DATA_DIR = tmpDir
  const db = getDb(tmpDir)
  runMigrations(db)
}

function tearDownTmpDb(): void {
  closeDb()
  if (tmpDir) {
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
    tmpDir = null
  }
  for (const [key, val] of [
    ['FULCRUM_DATA_DIR', originalFulcrumDir],
    ['FULCRUM_NO_RECALL_NUDGE', originalNoNudge],
    ['FULCRUM_BIAS_VARIANT', originalVariant],
  ] as const) {
    if (val === undefined) delete process.env[key]
    else process.env[key] = val
  }
}

function seedTrustedRun(runId: string, workspaceId = 'ws_varb'): void {
  const db = getDb()
  db.prepare(
    `INSERT OR IGNORE INTO workspaces (workspace_id, name) VALUES (?, 'variant-b-test')`,
  ).run(workspaceId)
  db.prepare(
    `INSERT OR IGNORE INTO projects (project_id, workspace_id, name)
     VALUES ('proj_varb', ?, 'variant-b-project')`,
  ).run(workspaceId)
  db.prepare(
    `INSERT OR IGNORE INTO tasks (task_id, workspace_id, project_id, title)
     VALUES ('task_varb', ?, 'proj_varb', 'variant b test task')`,
  ).run(workspaceId)
  db.prepare(
    `INSERT INTO agent_runs (run_id, task_id, workspace_id, role)
     VALUES (?, 'task_varb', ?, 'software_engineer')`,
  ).run(runId, workspaceId)
}

function seedMemory(workspaceId: string, title: string, summary: string, content: string): void {
  const db = getDb()
  // Minimum shape for a memories row — defaults cover the rest. The FTS5
  // trigger populates memories_fts automatically on insert.
  db.prepare(
    `INSERT INTO memories (memory_id, workspace_id, project_id, scope, kind, title, summary, content)
     VALUES (?, ?, 'proj_varb', 'project', 'decision', ?, ?, ?)`,
  ).run(
    `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    workspaceId,
    title,
    summary,
    content,
  )
}

interface CapturedIO {
  io: HookIO
  stdout: string[]
  stderr: string[]
  exitCode: number | null
}

function makeCapturedIO(): CapturedIO {
  const captured: CapturedIO = { io: null as unknown as HookIO, stdout: [], stderr: [], exitCode: null }
  captured.io = {
    stdout: (m: string) => { captured.stdout.push(m) },
    stderr: (m: string) => { captured.stderr.push(m) },
    exit: (code: number) => { captured.exitCode = code },
  }
  return captured
}

function claudeCtx(toolName: string, sessionId: string, toolInput: Record<string, unknown> = {}, workspaceId = 'ws_varb'): HookContext {
  return {
    cliName: 'claude',
    toolName,
    toolInput,
    sessionId,
    agentRole: '',
    runId: '',
    workspace_id: workspaceId,
  }
}

describe('PreToolUse Variant B passive injection (PR 3 R1)', () => {
  beforeEach(() => { setupTmpDb() })
  afterEach(() => { tearDownTmpDb() })

  it('falls through to Variant A when FULCRUM_BIAS_VARIANT is unset', async () => {
    seedTrustedRun('run_default')
    const io = makeCapturedIO()
    await runPreHook(claudeCtx('Grep', 'run_default', { pattern: 'recall_knowledge' }), io.io)
    const telemetry = readTelemetry()
    const kinds = telemetry.map((t) => t.kind)
    expect(kinds).toContain('nudge_emitted')
    expect(kinds).not.toContain('passive_injection')
  })

  it('injects recall results to stderr when FULCRUM_BIAS_VARIANT=B and memories exist', async () => {
    process.env.FULCRUM_BIAS_VARIANT = 'B'
    seedTrustedRun('run_b')
    seedMemory(
      'ws_varb',
      'Recall-first bias rationale',
      'Cursor / Continue inject context passively rather than instructing recall',
      'passive injection is the production pattern; the plan bets on an unfalsified premise',
    )
    const io = makeCapturedIO()
    await runPreHook(claudeCtx('Grep', 'run_b', { pattern: 'recall passive injection' }), io.io)
    const injection = io.stderr.find((l) => l.includes('passive injection'))
    expect(injection).toBeDefined()
    expect(io.stderr.some((l) => l.includes('<fulcrum-recall'))).toBe(true)
    const telemetry = readTelemetry()
    expect(telemetry.some((t) => t.kind === 'passive_injection' && t.variant === 'B')).toBe(true)
    // Variant A nudge should NOT also fire (avoid double-notify).
    expect(telemetry.some((t) => t.kind === 'nudge_emitted')).toBe(false)
  })

  it('falls through to Variant A nudge when Variant B recall returns no hits', async () => {
    process.env.FULCRUM_BIAS_VARIANT = 'B'
    seedTrustedRun('run_b_empty')
    // No memories seeded → recall returns []
    const io = makeCapturedIO()
    await runPreHook(claudeCtx('Grep', 'run_b_empty', { pattern: 'nonexistent-thing-xyz' }), io.io)
    const telemetry = readTelemetry()
    expect(telemetry.some((t) => t.kind === 'passive_injection')).toBe(false)
    expect(telemetry.some((t) => t.kind === 'nudge_emitted' && t.variant === 'A')).toBe(true)
  })

  it('extracts the Read query from file_path basename', async () => {
    process.env.FULCRUM_BIAS_VARIANT = 'B'
    seedTrustedRun('run_read')
    seedMemory(
      'ws_varb',
      'recall measurement harness',
      'summarizeRecallTelemetry computes recall_rate',
      'telemetry jsonl aggregator lives in packages/core/src/recall-measurement.ts',
    )
    const io = makeCapturedIO()
    await runPreHook(
      claudeCtx('Read', 'run_read', { file_path: '/tmp/some/deep/path/recall-measurement.ts' }),
      io.io,
    )
    const injection = io.stderr.find((l) => l.includes('passive injection'))
    expect(injection).toBeDefined()
    // Query should have been "recall measurement" (basename without .ts, hyphens replaced).
    expect(injection).toContain('recall measurement')
  })

  it('does not inject on an untrusted (forged) session (AD-9b)', async () => {
    process.env.FULCRUM_BIAS_VARIANT = 'B'
    seedTrustedRun('run_real_but_different_id')
    seedMemory('ws_varb', 'should not surface', 'because session is forged', 'test')
    const io = makeCapturedIO()
    // session_id is not in agent_runs — isTrustedSession returns false,
    // passive injection must NOT fire.
    await runPreHook(
      claudeCtx('Grep', 'run_forged_abc', { pattern: 'anything' }),
      io.io,
    )
    expect(io.stderr.some((l) => l.includes('passive injection'))).toBe(false)
    const telemetry = readTelemetry()
    expect(telemetry.some((t) => t.kind === 'passive_injection')).toBe(false)
  })

  it('never blocks the tool call (Variant B is still nudge-only)', async () => {
    process.env.FULCRUM_BIAS_VARIANT = 'B'
    seedTrustedRun('run_block_check')
    seedMemory('ws_varb', 'hit', 'matches', 'match content here')
    const io = makeCapturedIO()
    await runPreHook(claudeCtx('Grep', 'run_block_check', { pattern: 'hit' }), io.io)
    expect(io.exitCode).toBe(0)
    const decisions = io.stdout.map((s) => {
      try { return JSON.parse(s) as { continue?: boolean } } catch { return {} }
    })
    expect(decisions.some((d) => d.continue === true)).toBe(true)
  })
})

function readTelemetry(): Array<Record<string, unknown>> {
  const path = join(tmpDir!, 'telemetry', 'recall_bias.jsonl')
  if (!existsSync(path)) return []
  const raw = readFileSync(path, 'utf8').trim()
  if (!raw) return []
  return raw.split('\n').map((l) => JSON.parse(l) as Record<string, unknown>)
}
