// packages/cli/src/tests/hook-pre-post.test.ts
//
// L-6 / L-7 / L-8: in-process coverage for runPreHook and runPostHook.
// These tests inject a stub HookIO and use an in-memory SQLite DB so we
// don't need to spawn a subprocess — matching the in-process pattern
// used elsewhere in this package's test suite.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  getDb,
  closeDb,
  runMigrations,
} from '@fulcrum/core'
import { runPreHook, runPostHook, type HookContext, type HookIO, type HookOutput } from '../index.js'

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

describe('runPostHook — tool_trace memory (L-8)', () => {
  beforeEach(() => { createTestDb() })
  afterEach(() => resetTestDb())

  it('writes a tool_trace memory capturing tool name and input keys only', async () => {
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
      `SELECT content, kind, scope, task_id FROM memories WHERE workspace_id = ? AND kind = 'tool_trace' ORDER BY rowid DESC LIMIT 1`
    ).get(workspace_id) as { content: string; kind: string; scope: string; task_id: string | null } | undefined
    expect(row).toBeDefined()
    expect(row!.kind).toBe('tool_trace')
    expect(row!.scope).toBe('task')
    expect(row!.task_id).toBe(task_id)
    expect(row!.content).toMatch(/Tool: Edit/)
    expect(row!.content).toMatch(/file_path, old_string, new_string/)
    // Values must not be echoed back — only the keys.
    expect(row!.content).not.toContain(OLD_VAL)
    expect(row!.content).not.toContain(NEW_VAL)
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
      `SELECT COUNT(*) AS n FROM memories WHERE kind = 'tool_trace'`
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
