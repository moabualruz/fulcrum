// packages/cli/src/tests/hook-bias-nudge.test.ts
//
// PR 3 R1 — Claude PreToolUse bias nudge (Variant A).
// Covers: session_id forgery defense (AD-9b), nudge emission on
// Grep/Glob/Read for trusted sessions, FULCRUM_NO_RECALL_NUDGE opt-out,
// telemetry JSONL write through to ${globalDataDir()}/telemetry/.

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

function setupTmpDb(): void {
  closeDb()
  tmpDir = mkdtempSync(join(tmpdir(), 'fulcrum-bias-nudge-'))
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
  if (originalFulcrumDir === undefined) delete process.env.FULCRUM_DATA_DIR
  else process.env.FULCRUM_DATA_DIR = originalFulcrumDir
  if (originalNoNudge === undefined) delete process.env.FULCRUM_NO_RECALL_NUDGE
  else process.env.FULCRUM_NO_RECALL_NUDGE = originalNoNudge
}

function seedTrustedRun(runId: string): void {
  const db = getDb()
  db.prepare(
    `INSERT OR IGNORE INTO workspaces (workspace_id, name) VALUES ('ws_bias', 'bias-test')`,
  ).run()
  db.prepare(
    `INSERT OR IGNORE INTO projects (project_id, workspace_id, name)
     VALUES ('proj_bias', 'ws_bias', 'bias-project')`,
  ).run()
  db.prepare(
    `INSERT OR IGNORE INTO tasks (task_id, workspace_id, project_id, title)
     VALUES ('task_bias', 'ws_bias', 'proj_bias', 'bias test task')`,
  ).run()
  db.prepare(
    `INSERT INTO agent_runs (run_id, task_id, workspace_id, role)
     VALUES (?, 'task_bias', 'ws_bias', 'software_engineer')`,
  ).run(runId)
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
    stderr: (m: string) => { captured.stdout /* noop */; captured.stderr.push(m) },
    exit: (code: number) => { captured.exitCode = code },
  }
  return captured
}

function claudeCtx(toolName: string, sessionId: string): HookContext {
  return {
    cliName: 'claude',
    toolName,
    toolInput: {},
    sessionId,
    agentRole: '',
    runId: '',
    workspace_id: 'ws_bias',
  }
}

describe('PreToolUse Fulcrum-first bias nudge (Variant A, PR 3 R1)', () => {
  beforeEach(() => { setupTmpDb() })
  afterEach(() => { tearDownTmpDb() })

  it('does not nudge on a forged session_id (AD-9b defense)', async () => {
    const io = makeCapturedIO()
    await runPreHook(claudeCtx('Grep', 'run_forged_never_seeded'), io.io)
    const nudge = io.stderr.find((l) => l.includes('fulcrum-first'))
    expect(nudge).toBeUndefined()
  })

  it('emits a nudge when Grep is called on a trusted session with no prior recall', async () => {
    seedTrustedRun('run_real')
    const io = makeCapturedIO()
    await runPreHook(claudeCtx('Grep', 'run_real'), io.io)
    const nudge = io.stderr.find((l) => l.includes('fulcrum-first'))
    expect(nudge).toBeDefined()
    expect(nudge).toMatch(/Grep/)
    expect(nudge).toMatch(/recall_knowledge/)
  })

  it('emits nudges on Glob and Read too (all three search tools)', async () => {
    seedTrustedRun('run_real')
    for (const tool of ['Glob', 'Read'] as const) {
      const io = makeCapturedIO()
      await runPreHook(claudeCtx(tool, 'run_real'), io.io)
      const nudge = io.stderr.find((l) => l.includes('fulcrum-first'))
      expect(nudge, `missing nudge for ${tool}`).toBeDefined()
      expect(nudge).toContain(tool)
    }
  })

  it('does not emit a nudge when FULCRUM_NO_RECALL_NUDGE=1 is set', async () => {
    seedTrustedRun('run_real')
    process.env.FULCRUM_NO_RECALL_NUDGE = '1'
    const io = makeCapturedIO()
    await runPreHook(claudeCtx('Grep', 'run_real'), io.io)
    const nudge = io.stderr.find((l) => l.includes('fulcrum-first'))
    expect(nudge).toBeUndefined()
  })

  it('logs grep_called_without_recall + nudge_emitted events to telemetry JSONL', async () => {
    seedTrustedRun('run_real')
    const io = makeCapturedIO()
    await runPreHook(claudeCtx('Grep', 'run_real'), io.io)
    const telemetryPath = join(tmpDir!, 'telemetry', 'recall_bias.jsonl')
    expect(existsSync(telemetryPath)).toBe(true)
    const lines = readFileSync(telemetryPath, 'utf8').trim().split('\n')
    const kinds = lines.map((l) => JSON.parse(l).kind as string)
    expect(kinds).toContain('grep_called_without_recall')
    expect(kinds).toContain('nudge_emitted')
  })

  it('logs nudge_opt_out when FULCRUM_NO_RECALL_NUDGE=1', async () => {
    seedTrustedRun('run_real')
    process.env.FULCRUM_NO_RECALL_NUDGE = '1'
    const io = makeCapturedIO()
    await runPreHook(claudeCtx('Grep', 'run_real'), io.io)
    const telemetryPath = join(tmpDir!, 'telemetry', 'recall_bias.jsonl')
    expect(existsSync(telemetryPath)).toBe(true)
    const lines = readFileSync(telemetryPath, 'utf8').trim().split('\n')
    const kinds = lines.map((l) => JSON.parse(l).kind as string)
    expect(kinds).toContain('nudge_opt_out')
    expect(kinds).not.toContain('nudge_emitted')
  })

  it('never blocks the tool call even when a nudge fires', async () => {
    seedTrustedRun('run_real')
    const io = makeCapturedIO()
    await runPreHook(claudeCtx('Grep', 'run_real'), io.io)
    // Hook exits cleanly and returns continue:true (never blocks)
    expect(io.exitCode).toBe(0)
    const decision = io.stdout.map((s) => {
      try { return JSON.parse(s) as { continue?: boolean } } catch { return {} }
    })
    expect(decision.some((d) => d.continue === true)).toBe(true)
  })

  it('does not nudge on write-family tools (Grep/Glob/Read only)', async () => {
    seedTrustedRun('run_real')
    for (const tool of ['Write', 'Edit', 'Bash'] as const) {
      const io = makeCapturedIO()
      await runPreHook(claudeCtx(tool, 'run_real'), io.io)
      const nudge = io.stderr.find((l) => l.includes('fulcrum-first'))
      expect(nudge, `unexpected nudge for ${tool}`).toBeUndefined()
    }
  })
})
