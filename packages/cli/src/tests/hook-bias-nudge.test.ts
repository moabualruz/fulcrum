// packages/cli/src/tests/hook-bias-nudge.test.ts
//
// PR 3 R1 — Claude PreToolUse bias nudge (Variant A).
// Covers: session_id forgery defense (AD-9b), nudge emission on
// Grep/Glob/Read for trusted sessions, FULCRUM_NO_RECALL_NUDGE opt-out,
// telemetry JSONL write through to ${globalDataDir()}/telemetry/.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs'
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

// Seed a workspace/project/task + agent_run row AND the session file that
// the SessionStart hook would have written. The bias nudge reads the session
// file to resolve a Claude session_id (UUID) into the Fulcrum run_id (ULID);
// production has separate namespaces.
function seedTrustedSession(claudeSessionId: string, runId: string): void {
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
  const safeId = claudeSessionId.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128)
  const sessionsDir = join(tmpDir!, 'sessions')
  mkdirSync(sessionsDir, { recursive: true })
  writeFileSync(
    join(sessionsDir, `${safeId}.json`),
    JSON.stringify({
      session_id: claudeSessionId,
      run_id: runId,
      workspace_id: 'ws_bias',
      project_id: 'proj_bias',
    }),
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

  it('does not nudge when no session file exists (pre-SessionStart window)', async () => {
    const io = makeCapturedIO()
    // Claude session_id with no corresponding session file → silent fallthrough
    await runPreHook(claudeCtx('Grep', 'c-sess-no-file-uuid'), io.io)
    const nudge = io.stderr.find((l) => l.includes('fulcrum-first'))
    expect(nudge).toBeUndefined()
  })

  it('does not nudge on a forged session_id (AD-9b defense)', async () => {
    // Session file exists but points to a run_id not in agent_runs.
    seedTrustedSession('c-sess-forged-uuid', 'run_01TRUSTED')
    // Tamper: overwrite the session file to point at a different, unseeded run_id.
    writeFileSync(
      join(tmpDir!, 'sessions', 'c-sess-forged-uuid.json'),
      JSON.stringify({ session_id: 'c-sess-forged-uuid', run_id: 'run_forged_not_in_db' }),
    )
    const io = makeCapturedIO()
    await runPreHook(claudeCtx('Grep', 'c-sess-forged-uuid'), io.io)
    const nudge = io.stderr.find((l) => l.includes('fulcrum-first'))
    expect(nudge).toBeUndefined()
  })

  it('emits a nudge when Grep is called on a trusted session with no prior recall', async () => {
    seedTrustedSession('c-sess-real-uuid', 'run_01REAL')
    const io = makeCapturedIO()
    await runPreHook(claudeCtx('Grep', 'c-sess-real-uuid'), io.io)
    const nudge = io.stderr.find((l) => l.includes('fulcrum-first'))
    expect(nudge).toBeDefined()
    expect(nudge).toMatch(/Grep/)
    expect(nudge).toMatch(/recall_knowledge/)
  })

  it('emits nudges on Glob and Read too (all three search tools)', async () => {
    seedTrustedSession('c-sess-real-uuid', 'run_01REAL')
    for (const tool of ['Glob', 'Read'] as const) {
      const io = makeCapturedIO()
      await runPreHook(claudeCtx(tool, 'c-sess-real-uuid'), io.io)
      const nudge = io.stderr.find((l) => l.includes('fulcrum-first'))
      expect(nudge, `missing nudge for ${tool}`).toBeDefined()
      expect(nudge).toContain(tool)
    }
  })

  it('does not emit a nudge when FULCRUM_NO_RECALL_NUDGE=1 is set', async () => {
    seedTrustedSession('c-sess-real-uuid', 'run_01REAL')
    process.env.FULCRUM_NO_RECALL_NUDGE = '1'
    const io = makeCapturedIO()
    await runPreHook(claudeCtx('Grep', 'c-sess-real-uuid'), io.io)
    const nudge = io.stderr.find((l) => l.includes('fulcrum-first'))
    expect(nudge).toBeUndefined()
  })

  it('logs grep_called_without_recall + nudge_emitted events to telemetry JSONL', async () => {
    seedTrustedSession('c-sess-real-uuid', 'run_01REAL')
    const io = makeCapturedIO()
    await runPreHook(claudeCtx('Grep', 'c-sess-real-uuid'), io.io)
    const telemetryPath = join(tmpDir!, 'telemetry', 'recall_bias.jsonl')
    expect(existsSync(telemetryPath)).toBe(true)
    const lines = readFileSync(telemetryPath, 'utf8').trim().split('\n')
    const events = lines.map((l) => JSON.parse(l) as Record<string, unknown>)
    const kinds = events.map((e) => e.kind as string)
    expect(kinds).toContain('grep_called_without_recall')
    expect(kinds).toContain('nudge_emitted')
    // Claude session_id is the telemetry key; run_id is recorded in `extra`.
    const gr = events.find((e) => e.kind === 'grep_called_without_recall')!
    expect(gr.session_id).toBe('c-sess-real-uuid')
    expect((gr.extra as { run_id?: string }).run_id).toBe('run_01REAL')
  })

  it('logs nudge_opt_out when FULCRUM_NO_RECALL_NUDGE=1', async () => {
    seedTrustedSession('c-sess-real-uuid', 'run_01REAL')
    process.env.FULCRUM_NO_RECALL_NUDGE = '1'
    const io = makeCapturedIO()
    await runPreHook(claudeCtx('Grep', 'c-sess-real-uuid'), io.io)
    const telemetryPath = join(tmpDir!, 'telemetry', 'recall_bias.jsonl')
    expect(existsSync(telemetryPath)).toBe(true)
    const lines = readFileSync(telemetryPath, 'utf8').trim().split('\n')
    const kinds = lines.map((l) => JSON.parse(l).kind as string)
    expect(kinds).toContain('nudge_opt_out')
    expect(kinds).not.toContain('nudge_emitted')
  })

  it('never blocks the tool call even when a nudge fires', async () => {
    seedTrustedSession('c-sess-real-uuid', 'run_01REAL')
    const io = makeCapturedIO()
    await runPreHook(claudeCtx('Grep', 'c-sess-real-uuid'), io.io)
    expect(io.exitCode).toBe(0)
    const decision = io.stdout.map((s) => {
      try { return JSON.parse(s) as { continue?: boolean } } catch { return {} }
    })
    expect(decision.some((d) => d.continue === true)).toBe(true)
  })

  it('does not nudge on write-family tools (Grep/Glob/Read only)', async () => {
    seedTrustedSession('c-sess-real-uuid', 'run_01REAL')
    for (const tool of ['Write', 'Edit', 'Bash'] as const) {
      const io = makeCapturedIO()
      await runPreHook(claudeCtx(tool, 'c-sess-real-uuid'), io.io)
      const nudge = io.stderr.find((l) => l.includes('fulcrum-first'))
      expect(nudge, `unexpected nudge for ${tool}`).toBeUndefined()
    }
  })

  // PR 4 closeout c4 — the bias gate now opens for opencode alongside claude.
  // The plugin shells to `fulcrum hook opencode pre`, which lands as
  // cliName === 'opencode' in runPreHook. Trust boundary + telemetry wiring
  // mirror the Claude path; `agent_type` in telemetry is derived from
  // ctx.cliName (not hard-coded 'claude'), so opencode events carry the
  // correct label.
  function opencodeCtx(toolName: string, sessionId: string): HookContext {
    return {
      cliName: 'opencode',
      toolName,
      toolInput: {},
      sessionId,
      agentRole: '',
      runId: '',
      workspace_id: 'ws_bias',
    }
  }

  it('emits a nudge for opencode Grep on a trusted session (AD-9b trust honored)', async () => {
    seedTrustedSession('oc-sess-real-uuid', 'run_01OPENCODE')
    const io = makeCapturedIO()
    await runPreHook(opencodeCtx('Grep', 'oc-sess-real-uuid'), io.io)
    const nudge = io.stderr.find((l) => l.includes('fulcrum-first'))
    expect(nudge).toBeDefined()
    expect(nudge).toMatch(/Grep/)
  })

  it('does not nudge for opencode when no session file exists (AD-9b silent skip)', async () => {
    const io = makeCapturedIO()
    await runPreHook(opencodeCtx('Grep', 'oc-sess-no-file'), io.io)
    const nudge = io.stderr.find((l) => l.includes('fulcrum-first'))
    expect(nudge).toBeUndefined()
  })

  it('records opencode events with agent_type=opencode in telemetry', async () => {
    seedTrustedSession('oc-sess-telem-uuid', 'run_01TELEM')
    const io = makeCapturedIO()
    await runPreHook(opencodeCtx('Grep', 'oc-sess-telem-uuid'), io.io)
    const telemetryPath = join(tmpDir!, 'telemetry', 'recall_bias.jsonl')
    expect(existsSync(telemetryPath)).toBe(true)
    const events = readFileSync(telemetryPath, 'utf8').trim().split('\n')
      .map((l) => JSON.parse(l) as { kind: string; agent_type: string; session_id: string })
    const grep = events.find((e) => e.kind === 'grep_called_without_recall')
    expect(grep).toBeDefined()
    expect(grep!.agent_type).toBe('opencode')
    expect(grep!.session_id).toBe('oc-sess-telem-uuid')
  })
})
