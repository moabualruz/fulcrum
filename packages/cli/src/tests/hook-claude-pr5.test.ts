// PR 5 — Claude Code hook parity (4 missing events).
// Covers: runUserPromptSubmitHook, runSubagentStopHook, runSessionEndHook,
// runNotificationHook. Each must: (a) never throw, (b) emit { continue: true }
// on stdout, (c) write a hook_events row, (d) write the appropriate memory /
// telemetry side-effect when applicable.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { getDb, closeDb, runMigrations } from 'fulcrum-agent-core'
import { runMigration101MemoryV3Lifecycle } from 'fulcrum-memory'

let tmpDir: string | null = null
const originalFulcrumDir = process.env.FULCRUM_DATA_DIR
const originalWorkspaceId = process.env.FULCRUM_WORKSPACE_ID
const originalProjectId = process.env.FULCRUM_PROJECT_ID

function setupTmpDb(): void {
  closeDb()
  tmpDir = mkdtempSync(join(tmpdir(), 'fulcrum-claude-pr5-'))
  process.env.FULCRUM_DATA_DIR = tmpDir
  process.env.FULCRUM_WORKSPACE_ID = 'ws_pr5'
  process.env.FULCRUM_PROJECT_ID = 'proj_pr5'
  const db = getDb(tmpDir)
  runMigrations(db)
  runMigration101MemoryV3Lifecycle(db)
  // Seed workspace + project up-front so writeMemory's FK succeeds even when
  // a test doesn't call seedRun (UserPromptSubmit + Notification + SubagentStop
  // don't need an agent_run).
  db.prepare(`INSERT OR IGNORE INTO workspaces (workspace_id, name) VALUES ('ws_pr5', 'pr5')`).run()
  db.prepare(`INSERT OR IGNORE INTO projects (project_id, workspace_id, name) VALUES ('proj_pr5', 'ws_pr5', 'pr5')`).run()
}

function tearDownTmpDb(): void {
  closeDb()
  if (tmpDir) { try { rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ } tmpDir = null }
  for (const [k, v] of [
    ['FULCRUM_DATA_DIR', originalFulcrumDir],
    ['FULCRUM_WORKSPACE_ID', originalWorkspaceId],
    ['FULCRUM_PROJECT_ID', originalProjectId],
  ] as const) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
}

function seedRun(sessionId: string, runId: string): void {
  const db = getDb()
  db.prepare(`INSERT OR IGNORE INTO workspaces (workspace_id, name) VALUES ('ws_pr5', 'pr5')`).run()
  db.prepare(`INSERT OR IGNORE INTO projects (project_id, workspace_id, name) VALUES ('proj_pr5', 'ws_pr5', 'pr5')`).run()
  db.prepare(`INSERT OR IGNORE INTO tasks (task_id, workspace_id, project_id, title) VALUES ('task_pr5', 'ws_pr5', 'proj_pr5', 'pr5 task')`).run()
  db.prepare(`INSERT INTO agent_runs (run_id, task_id, workspace_id, role) VALUES (?, 'task_pr5', 'ws_pr5', 'software_engineer')`).run(runId)
  const safe = sessionId.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128)
  mkdirSync(join(tmpDir!, 'sessions'), { recursive: true })
  writeFileSync(join(tmpDir!, 'sessions', `${safe}.json`), JSON.stringify({ session_id: sessionId, run_id: runId, workspace_id: 'ws_pr5' }))
}

async function runHookWithStdin(hookFn: () => Promise<void>, stdin: string): Promise<{ stdout: string; stderr: string; exit: number | null }> {
  // Capture stdout/stderr/exit. Stub process.stdin to replay the payload.
  const captured = { stdout: '', stderr: '', exit: null as number | null }
  const origStdinOn = process.stdin.on.bind(process.stdin)
  const origStdoutWrite = process.stdout.write.bind(process.stdout)
  const origStderrWrite = process.stderr.write.bind(process.stderr)
  const origExit = process.exit.bind(process)

  process.stdin.on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    if (event === 'data' && stdin) {
      queueMicrotask(() => handler(Buffer.from(stdin)))
    } else if (event === 'end') {
      queueMicrotask(() => handler())
    }
    return process.stdin
  }) as typeof process.stdin.on
  process.stdout.write = ((chunk: string | Uint8Array) => { captured.stdout += typeof chunk === 'string' ? chunk : chunk.toString() ; return true }) as typeof process.stdout.write
  process.stderr.write = ((chunk: string | Uint8Array) => { captured.stderr += typeof chunk === 'string' ? chunk : chunk.toString(); return true }) as typeof process.stderr.write
  process.exit = ((code?: number) => { captured.exit = code ?? 0; throw new Error('__exit__') }) as typeof process.exit

  try {
    await hookFn()
  } catch (err) {
    if (!(err instanceof Error) || err.message !== '__exit__') throw err
  } finally {
    process.stdin.on = origStdinOn
    process.stdout.write = origStdoutWrite
    process.stderr.write = origStderrWrite
    process.exit = origExit
  }
  return captured
}

describe('PR 5 Claude hook handlers', () => {
  beforeEach(() => { setupTmpDb() })
  afterEach(() => { tearDownTmpDb() })

  it('runUserPromptSubmitHook writes a hook_events row + telemetry + continue:true', async () => {
    const { runUserPromptSubmitHook } = await import('../index.js')
    const out = await runHookWithStdin(runUserPromptSubmitHook, JSON.stringify({
      session_id: 'c-sess-user-prompt',
      prompt: 'what is the state of the plan?',
    }))
    expect(out.exit).toBe(0)
    expect(JSON.parse(out.stdout).continue).toBe(true)
    const db = getDb()
    const row = db.prepare(`SELECT tool_name FROM hook_events WHERE session_id = ?`).get('c-sess-user-prompt') as { tool_name: string } | undefined
    expect(row?.tool_name).toBe('UserPromptSubmit')
    expect(existsSync(join(tmpDir!, 'telemetry', 'recall_bias.jsonl'))).toBe(true)
  })

  it('runSubagentStopHook writes a task_outcome memory + hook_events row', async () => {
    const { runSubagentStopHook } = await import('../index.js')
    const out = await runHookWithStdin(runSubagentStopHook, JSON.stringify({
      session_id: 'c-sess-subagent',
      subagent_type: 'code-reviewer',
      result: 'Review found 2 HIGH issues and 1 MODERATE.',
    }))
    expect(out.exit).toBe(0)
    expect(JSON.parse(out.stdout).continue).toBe(true)
    const db = getDb()
    const row = db.prepare(`SELECT tool_name, agent_role FROM hook_events WHERE session_id = ?`).get('c-sess-subagent') as { tool_name: string; agent_role: string } | undefined
    expect(row?.tool_name).toBe('SubagentStop')
    expect(row?.agent_role).toBe('code-reviewer')
    const mem = db.prepare(`SELECT title, kind FROM memories WHERE title LIKE ?`).get('Subagent code-reviewer%') as { title: string; kind: string } | undefined
    expect(mem?.kind).toBe('task_outcome')
  })

  it('runSessionEndHook completes the agent run via session file + writes a session_summary memory', async () => {
    seedRun('c-sess-end', 'run_pr5_end')
    const { runSessionEndHook } = await import('../index.js')
    const out = await runHookWithStdin(runSessionEndHook, JSON.stringify({
      session_id: 'c-sess-end',
      summary: 'done with today',
    }))
    expect(out.exit).toBe(0)
    const db = getDb()
    const run = db.prepare(`SELECT status, output_summary FROM agent_runs WHERE run_id = ?`).get('run_pr5_end') as { status: string; output_summary: string } | undefined
    expect(run?.status).toBe('finished')
    expect(run?.output_summary).toContain('done with today')
    const mem = db.prepare(`SELECT kind FROM memories WHERE title LIKE 'Session end%'`).get() as { kind: string } | undefined
    expect(mem?.kind).toBe('session_summary')
  })

  it('runSessionEndHook flushes recall_turn_state rows for the ended run', async () => {
    seedRun('c-sess-flush', 'run_pr5_flush')
    const db = getDb()
    db.prepare(`INSERT INTO recall_turn_state (session_id, turn_id, agent_type, grep_count_without_recall) VALUES (?, '', 'claude', 5)`).run('run_pr5_flush')
    const { runSessionEndHook } = await import('../index.js')
    await runHookWithStdin(runSessionEndHook, JSON.stringify({ session_id: 'c-sess-flush', summary: 'ok' }))
    const remaining = db.prepare(`SELECT COUNT(*) AS n FROM recall_turn_state WHERE session_id = ?`).get('run_pr5_flush') as { n: number }
    expect(remaining.n).toBe(0)
  })

  it('runNotificationHook logs to hook_events + stderr + continue:true', async () => {
    const { runNotificationHook } = await import('../index.js')
    const out = await runHookWithStdin(runNotificationHook, JSON.stringify({
      session_id: 'c-sess-notif',
      message: 'long-running tool hit 30s mark',
      level: 'warn',
    }))
    expect(out.exit).toBe(0)
    expect(JSON.parse(out.stdout).continue).toBe(true)
    expect(out.stderr).toContain('long-running tool hit 30s mark')
    const db = getDb()
    const row = db.prepare(`SELECT tool_name FROM hook_events WHERE session_id = ?`).get('c-sess-notif') as { tool_name: string } | undefined
    expect(row?.tool_name).toBe('Notification:warn')
  })

  it('every PR 5 handler tolerates empty stdin (no crash; continue:true)', async () => {
    const mod = await import('../index.js')
    for (const fn of [mod.runUserPromptSubmitHook, mod.runSubagentStopHook, mod.runSessionEndHook, mod.runNotificationHook]) {
      const out = await runHookWithStdin(fn, '')
      expect(out.exit).toBe(0)
      if (out.stdout) {
        expect(JSON.parse(out.stdout).continue).toBe(true)
      }
    }
  })
})
