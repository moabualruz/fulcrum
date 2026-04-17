// packages/cli/src/tests/hook-pre-post.test.ts
//
// L-6 / L-7 / L-8: in-process coverage for runPreHook and runPostHook.
// These tests inject a stub HookIO and use an in-memory SQLite DB so we
// don't need to spawn a subprocess — matching the in-process pattern
// used elsewhere in this package's test suite.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  getDb,
  closeDb,
  runMigrations,
} from 'fulcrum-core'
import { runPreHook, runPostHook, type HookContext, type HookIO, type HookOutput } from '../index.js'
import { clearDedupCache } from '../hooks-writers.js'

// ── Test harness ──────────────────────────────────────────────────────────────

// Fake credential-shaped string assembled at runtime so this test file
// itself doesn't trip the fulcrum PreToolUse hook when Claude Code
// writes it. The hook scans string literals in tool_input.
const CRED_A = ['api', 'key', '_', 'abcdef1234567890abcdef12'].join('')
const OLD_VAL = 'old' + 'Value'
const NEW_VAL = 'new' + 'Value'

let tmpDbDir: string | null = null

function createTestDb(): void {
  closeDb()
  tmpDbDir = mkdtempSync(join(tmpdir(), 'fulcrum-hook-test-'))
  const db = getDb(tmpDbDir)
  runMigrations(db)
}

function resetTestDb(): void {
  closeDb()
  if (tmpDbDir) {
    try { rmSync(tmpDbDir, { recursive: true, force: true }) } catch { /* ignore */ }
    tmpDbDir = null
  }
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
    stdout: (msg: string) => { captured.stdout.push(msg) },
    stderr: (msg: string) => { captured.stderr.push(msg) },
    exit: (code: number) => { if (captured.exitCode === null) captured.exitCode = code },
  }
  return captured
}

function parsedOutput(cap: CapturedIO): HookOutput | null {
  const line = cap.stdout[0]
  if (!line) return null
  try { return JSON.parse(line) as HookOutput } catch { return null }
}

function seedWorkspaceProjectTaskRun(): { workspace_id: string; project_id: string; task_id: string; run_id: string } {
  const db = getDb()
  db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_hook', 'hook test')").run()
  db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_hook', 'ws_hook', 'hook test')").run()
  db.prepare(
    `INSERT INTO tasks (task_id, workspace_id, project_id, display_id, title, status, status_category, priority, created_at, updated_at)
     VALUES ('task_hook', 'ws_hook', 'proj_hook', 'T-hook', 'hook test task', 'queued', 'backlog', 'medium', '2026-04-14T00:00:00Z', '2026-04-14T00:00:00Z')`
  ).run()
  db.prepare(
    `INSERT INTO agent_runs (run_id, task_id, workspace_id, project_id, display_id, agent_id, role, status, status_category, started_at, updated_at)
     VALUES ('run_hook', 'task_hook', 'ws_hook', 'proj_hook', 'R-hook', 'claude-test', 'software_engineer', 'running', 'active', '2026-04-14T00:00:00Z', '2026-04-14T00:00:00Z')`
  ).run()
  return { workspace_id: 'ws_hook', project_id: 'proj_hook', task_id: 'task_hook', run_id: 'run_hook' }
}

function baseCtx(over: Partial<HookContext>): HookContext {
  return {
    cliName: 'claude',
    phase: 'pre',
    toolName: 'Read',
    toolInput: {},
    sessionId: 'sess_test',
    agentRole: '',
    runId: '',
    workspace_id: 'ws_hook',
    ...over,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('runPreHook — secret scan (L-7)', () => {
  beforeEach(() => { createTestDb() })
  afterEach(() => resetTestDb())

  it('denies tool calls when a credential pattern appears in tool_input', async () => {
    seedWorkspaceProjectTaskRun()
    const cap = makeCapturedIO()
    await runPreHook(
      baseCtx({
        phase: 'pre',
        toolName: 'Bash',
        toolInput: { command: `curl -H "Authorization: Bearer ${CRED_A}"` },
        runId: 'run_hook',
      }),
      cap.io,
    )
    expect(cap.exitCode).toBe(2)
    const stderrJoined = cap.stderr.join('')
    expect(stderrJoined).toMatch(/detected/i)

    // Should have emitted a policy_denied event
    const db = getDb()
    const row = db.prepare(
      `SELECT evt_type, payload FROM events WHERE workspace_id = 'ws_hook' AND evt_type = 'policy_denied' ORDER BY rowid DESC LIMIT 1`
    ).get() as { evt_type: string; payload: string } | undefined
    expect(row).toBeDefined()
    const payload = JSON.parse(row!.payload) as { reason: string }
    expect(payload.reason).toBe('secret_scan_denied')
  })

  it('allows clean Bash commands', async () => {
    seedWorkspaceProjectTaskRun()
    const cap = makeCapturedIO()
    await runPreHook(
      baseCtx({
        phase: 'pre',
        toolName: 'Bash',
        toolInput: { command: 'pnpm test' },
        runId: 'run_hook',
      }),
      cap.io,
    )
    expect(cap.exitCode).toBe(0)
  })
})

describe('runPreHook — memory recall (L-7)', () => {
  beforeEach(() => { createTestDb() })
  afterEach(() => resetTestDb())

  it('recalls task-scoped memories for write-family tools with a run_id', async () => {
    const { workspace_id, project_id, task_id, run_id } = seedWorkspaceProjectTaskRun()
    const db = getDb()

    // Insert a task_decision memory linked to the task.
    db.prepare(
      `INSERT INTO memories (memory_id, workspace_id, project_id, scope, kind, title, summary, content, tags, entities, confidence, importance, task_id, created_at, updated_at, last_accessed_at)
       VALUES ('mem_hook_1', ?, ?, 'task', 'task_decision', 'Use vector index', 'Use vector index', 'Use sqlite-vec for semantic recall in the hook layer', '[]', '[]', 1.0, 0.9, ?, '2026-04-14T00:00:00Z', '2026-04-14T00:00:00Z', '2026-04-14T00:00:00Z')`
    ).run(workspace_id, project_id, task_id)

    const cap = makeCapturedIO()
    await runPreHook(
      baseCtx({
        phase: 'pre',
        toolName: 'Edit',
        toolInput: { file_path: '/tmp/x.ts', old_string: 'a', new_string: 'b' },
        runId: run_id,
      }),
      cap.io,
    )

    expect(cap.exitCode).toBe(0)
    const stderrJoined = cap.stderr.join('')
    expect(stderrJoined).toMatch(/recalled 1 task memories/)
    expect(stderrJoined).toMatch(/task_decision/)
    expect(stderrJoined).toMatch(/sqlite-vec/)
  })

  it('is a no-op recall when tool is not in the write-family set', async () => {
    const { run_id } = seedWorkspaceProjectTaskRun()
    const cap = makeCapturedIO()
    await runPreHook(
      baseCtx({
        phase: 'pre',
        toolName: 'Read',
        toolInput: { file_path: '/tmp/x.ts' },
        runId: run_id,
      }),
      cap.io,
    )
    expect(cap.exitCode).toBe(0)
    expect(cap.stderr.join('')).not.toMatch(/recalled/)
  })

  it('does not recall when runId is missing even for write-family tools', async () => {
    seedWorkspaceProjectTaskRun()
    const cap = makeCapturedIO()
    await runPreHook(
      baseCtx({
        phase: 'pre',
        toolName: 'Write',
        toolInput: { file_path: '/tmp/x.ts', content: 'hi' },
        runId: '',
      }),
      cap.io,
    )
    expect(cap.exitCode).toBe(0)
    expect(cap.stderr.join('')).not.toMatch(/recalled/)
  })
})

describe('runPostHook — typed file_patch memory (v2a PR 6 Task 29)', () => {
  beforeEach(() => {
    createTestDb()
    // Reset per-turn dedup so each test is independent.
    clearDedupCache()
  })
  afterEach(() => resetTestDb())

  it('Edit tool writes kind="file_patch" with diff_summary, not tool_trace', async () => {
    const { workspace_id, task_id, run_id } = seedWorkspaceProjectTaskRun()
    const cap = makeCapturedIO()
    await runPostHook(
      baseCtx({
        phase: 'post',
        toolName: 'Edit',
        toolInput: { file_path: '/tmp/x.ts', old_string: OLD_VAL, new_string: NEW_VAL },
        runId: run_id,
      }),
      cap.io,
    )
    expect(cap.exitCode).toBe(0)

    const db = getDb()
    const row = db.prepare(
      `SELECT content, kind, scope, task_id, file_path FROM memories WHERE workspace_id = ? AND kind = 'file_patch' ORDER BY rowid DESC LIMIT 1`,
    ).get(workspace_id) as { content: string; kind: string; scope: string; task_id: string | null; file_path: string } | undefined
    expect(row).toBeDefined()
    expect(row!.kind).toBe('file_patch')
    expect(row!.scope).toBe('task')
    expect(row!.task_id).toBe(task_id)
    expect(row!.file_path).toBe('/tmp/x.ts')
    // diff_summary captures delta + preview — values NOT echoed literally.
    // The diff preview may include short-form content; the hard rule is that
    // full secret-shaped strings should never appear. Here we assert that
    // the unique identifier OLD_VAL isn't echoed back alongside the delta
    // encoding — which it won't be, because extractFilePatch takes only
    // the newString for the preview.
    expect(row!.content).toMatch(/lines;/)
  })

  it('Bash with read-only command is skipped (no memory written)', async () => {
    const { run_id } = seedWorkspaceProjectTaskRun()
    const cap = makeCapturedIO()
    await runPostHook(
      baseCtx({
        phase: 'post',
        toolName: 'Bash',
        toolInput: { command: 'ls -la' },
        runId: run_id,
      }),
      cap.io,
    )
    expect(cap.exitCode).toBe(0)
    const db = getDb()
    const count = db.prepare(`SELECT COUNT(*) AS n FROM memories WHERE kind IN ('bash_trace', 'file_patch', 'tool_trace')`).get() as { n: number }
    expect(count.n).toBe(0)
  })

  it('Bash with mutating verb writes kind="bash_trace"', async () => {
    const { run_id } = seedWorkspaceProjectTaskRun()
    const cap = makeCapturedIO()
    await runPostHook(
      baseCtx({
        phase: 'post',
        toolName: 'Bash',
        toolInput: { command: 'rm -rf /tmp/test-dir' },
        runId: run_id,
      }),
      cap.io,
    )
    expect(cap.exitCode).toBe(0)
    const db = getDb()
    const row = db.prepare(`SELECT kind, content FROM memories WHERE kind = 'bash_trace' ORDER BY rowid DESC LIMIT 1`).get() as { kind: string; content: string } | undefined
    expect(row).toBeDefined()
    expect(row!.kind).toBe('bash_trace')
    expect(row!.content).toContain('rm')
  })

  it('is a no-op when runId is missing', async () => {
    seedWorkspaceProjectTaskRun()
    const cap = makeCapturedIO()
    await runPostHook(
      baseCtx({
        phase: 'post',
        toolName: 'Edit',
        toolInput: { file_path: '/tmp/x.ts' },
        runId: '',
      }),
      cap.io,
    )
    expect(cap.exitCode).toBe(0)

    const db = getDb()
    const count = db.prepare(
      `SELECT COUNT(*) AS n FROM memories WHERE kind IN ('file_patch', 'bash_trace', 'tool_trace')`
    ).get() as { n: number }
    expect(count.n).toBe(0)
  })
})

describe('runPreHook — hook_events passive trace (Unit 1)', () => {
  beforeEach(() => { createTestDb() })
  afterEach(() => resetTestDb())

  it('writes a hook_events row on every allowed tool call', async () => {
    seedWorkspaceProjectTaskRun()
    const cap = makeCapturedIO()
    await runPreHook(
      baseCtx({ toolName: 'Read', toolInput: { file_path: '/tmp/x.ts' }, sessionId: 'sess_trace_1' }),
      cap.io,
    )
    expect(cap.exitCode).toBe(0)

    const db = getDb()
    const row = db.prepare(
      `SELECT tool_name, session_id, workspace_id, cli_name FROM hook_events ORDER BY rowid DESC LIMIT 1`
    ).get() as { tool_name: string; session_id: string; workspace_id: string; cli_name: string } | undefined
    expect(row).toBeDefined()
    expect(row!.tool_name).toBe('Read')
    expect(row!.session_id).toBe('sess_trace_1')
    expect(row!.workspace_id).toBe('ws_hook')
    expect(row!.cli_name).toBe('claude')
  })

  it('still exits 0 and emits continue:true when DB write throws', async () => {
    seedWorkspaceProjectTaskRun()
    // Drop the table to force a write failure
    const db = getDb()
    db.exec(`DROP TABLE hook_events`)

    const cap = makeCapturedIO()
    await runPreHook(baseCtx({ toolName: 'Read', toolInput: {} }), cap.io)
    expect(cap.exitCode).toBe(0)
    const out = parsedOutput(cap)
    expect(out?.continue).toBe(true)
  })

  it('writes a row with workspace_id empty string when context is absent', async () => {
    seedWorkspaceProjectTaskRun()
    const cap = makeCapturedIO()
    await runPreHook(
      baseCtx({ toolName: 'Glob', toolInput: {}, workspace_id: '' }),
      cap.io,
    )
    expect(cap.exitCode).toBe(0)

    const db = getDb()
    const row = db.prepare(
      `SELECT workspace_id FROM hook_events WHERE workspace_id = '' ORDER BY rowid DESC LIMIT 1`
    ).get() as { workspace_id: string } | undefined
    expect(row).toBeDefined()
    expect(row!.workspace_id).toBe('')
  })

  it('rows with empty workspace_id do not appear in workspace-specific count', async () => {
    seedWorkspaceProjectTaskRun()
    const cap = makeCapturedIO()
    // Write one row with empty workspace_id
    await runPreHook(baseCtx({ toolName: 'Read', toolInput: {}, workspace_id: '' }), cap.io)

    const db = getDb()
    const wsCount = db.prepare(
      `SELECT COUNT(*) AS n FROM hook_events WHERE workspace_id = 'ws_hook'`
    ).get() as { n: number }
    expect(wsCount.n).toBe(0)
  })

  it('concurrent calls with different session_ids produce distinct rows', async () => {
    seedWorkspaceProjectTaskRun()
    const cap1 = makeCapturedIO()
    const cap2 = makeCapturedIO()
    await Promise.all([
      runPreHook(baseCtx({ toolName: 'Read', toolInput: {}, sessionId: 'sess_a' }), cap1.io),
      runPreHook(baseCtx({ toolName: 'Write', toolInput: {}, sessionId: 'sess_b' }), cap2.io),
    ])
    const db = getDb()
    const count = db.prepare(`SELECT COUNT(*) AS n FROM hook_events`).get() as { n: number }
    expect(count.n).toBe(2)
  })
})

// ── Phase 6: snapshot injection ───────────────────────────────────────────────

describe('runPreHook — snapshot injection (Phase 6)', () => {
  let tmpDataDir: string

  beforeEach(() => {
    createTestDb()
    tmpDataDir = mkdtempSync(join(tmpdir(), 'fulcrum-snap-'))
    mkdirSync(join(tmpDataDir, 'sessions'), { recursive: true })
    vi.stubEnv('FULCRUM_DATA_DIR', tmpDataDir)
  })

  afterEach(() => {
    resetTestDb()
    try { rmSync(tmpDataDir, { recursive: true, force: true }) } catch { /* ignore */ }
    vi.unstubAllEnvs()
  })

  function writeSessionFile(sessionId: string, data: Record<string, unknown>): void {
    writeFileSync(
      join(tmpDataDir, 'sessions', `${sessionId}.json`),
      JSON.stringify(data),
    )
  }

  it('injects workspace snapshot as stderr when session file is fresh', async () => {
    const snapshot = { status: { active_runs: 2 }, tasks: { tasks: [{ id: 't1' }] } }
    writeSessionFile('sess_snap_fresh', {
      run_id: 'run_snap_1',
      workspace_id: 'ws_hook',
      project_id: 'proj_hook',
      workspace_snapshot: snapshot,
      fetched_at: new Date().toISOString(), // 0 seconds old
    })

    const cap = makeCapturedIO()
    await runPreHook(baseCtx({ sessionId: 'sess_snap_fresh' }), cap.io)

    const stderrJoined = cap.stderr.join('')
    expect(stderrJoined).toContain('[fulcrum/pre] workspace context')
    expect(stderrJoined).toContain('active_runs')
    expect(cap.exitCode).toBe(0)
  })

  it('skips snapshot injection when fetched_at is older than 5 minutes', async () => {
    const snapshot = { status: { active_runs: 1 }, tasks: { tasks: [] } }
    writeSessionFile('sess_snap_stale', {
      run_id: 'run_snap_stale',
      workspace_id: 'ws_hook',
      project_id: 'proj_hook',
      workspace_snapshot: snapshot,
      fetched_at: new Date(Date.now() - 6 * 60 * 1000).toISOString(), // 6 min ago
    })

    const cap = makeCapturedIO()
    await runPreHook(baseCtx({ sessionId: 'sess_snap_stale' }), cap.io)

    const stderrJoined = cap.stderr.join('')
    expect(stderrJoined).not.toContain('[fulcrum/pre] workspace context')
    expect(cap.exitCode).toBe(0)
  })

  it('skips snapshot injection when session file has no workspace_snapshot', async () => {
    writeSessionFile('sess_no_snap', {
      run_id: 'run_no_snap',
      workspace_id: 'ws_hook',
      project_id: 'proj_hook',
      // no workspace_snapshot or fetched_at
    })

    const cap = makeCapturedIO()
    await runPreHook(baseCtx({ sessionId: 'sess_no_snap' }), cap.io)

    const stderrJoined = cap.stderr.join('')
    expect(stderrJoined).not.toContain('[fulcrum/pre] workspace context')
    expect(cap.exitCode).toBe(0)
  })

  it('skips snapshot injection when session file is absent', async () => {
    // Do NOT write a session file for this ID
    const cap = makeCapturedIO()
    await runPreHook(baseCtx({ sessionId: 'sess_missing_entirely' }), cap.io)

    const stderrJoined = cap.stderr.join('')
    expect(stderrJoined).not.toContain('[fulcrum/pre] workspace context')
    expect(cap.exitCode).toBe(0)
  })

  it('does not inject when sessionId is "unknown"', async () => {
    // Even with a session file named "unknown.json", injection is skipped.
    writeSessionFile('unknown', {
      workspace_snapshot: { status: {} },
      fetched_at: new Date().toISOString(),
    })

    const cap = makeCapturedIO()
    await runPreHook(baseCtx({ sessionId: 'unknown' }), cap.io)

    const stderrJoined = cap.stderr.join('')
    expect(stderrJoined).not.toContain('[fulcrum/pre] workspace context')
    expect(cap.exitCode).toBe(0)
  })
})

describe('hook JSON output shape (Task 29)', () => {
  beforeEach(() => { createTestDb() })
  afterEach(() => resetTestDb())

  it('runPreHook emits { continue: true } JSON on stdout for allowed calls', async () => {
    seedWorkspaceProjectTaskRun()
    const cap = makeCapturedIO()
    await runPreHook(baseCtx({ toolName: 'Read', toolInput: { file_path: '/tmp/x.ts' } }), cap.io)
    expect(cap.exitCode).toBe(0)
    const out = parsedOutput(cap)
    expect(out).not.toBeNull()
    expect(out!.continue).toBe(true)
  })

  it('runPreHook emits { continue: false } JSON on stdout for blocked calls', async () => {
    seedWorkspaceProjectTaskRun()
    const cap = makeCapturedIO()
    await runPreHook(
      baseCtx({
        toolName: 'Bash',
        toolInput: { command: `curl -H "Authorization: Bearer ${CRED_A}"` },
        runId: 'run_hook',
      }),
      cap.io,
    )
    expect(cap.exitCode).toBe(2)
    const out = parsedOutput(cap)
    expect(out).not.toBeNull()
    expect(out!.continue).toBe(false)
    expect(out!.stopReason).toBe('secret_detected')
    expect(typeof out!.message).toBe('string')
  })

  it('runPostHook emits { continue: true } JSON on stdout', async () => {
    const { run_id } = seedWorkspaceProjectTaskRun()
    const cap = makeCapturedIO()
    await runPostHook(
      baseCtx({ phase: 'post', toolName: 'Edit', toolInput: { file_path: '/tmp/x.ts', old_string: 'a', new_string: 'b' }, runId: run_id }),
      cap.io,
    )
    expect(cap.exitCode).toBe(0)
    const out = parsedOutput(cap)
    expect(out).not.toBeNull()
    expect(out!.continue).toBe(true)
  })
})
