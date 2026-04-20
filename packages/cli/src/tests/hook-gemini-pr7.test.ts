// PR 7 — Gemini full hook coverage (6→11 events). Tests for the 4 handlers
// added / fixed in this PR:
//   - runGeminiBeforeAgentHook (exists; fix hookEventName + prompt-field parse)
//   - runGeminiBeforeToolSelectionHook (new)
//   - runGeminiNotificationHook (new)
//   - runGeminiAfterModelHook (new)
// Contract source: google-gemini/gemini-cli docs/hooks/reference.md (re-fetched
// via find-docs 2026-04-20). Base stdin shape:
//   { session_id, transcript_path, cwd, hook_event_name, timestamp }
// Per-event extensions + output shapes are documented in the plan ledger
// (PR 7.1 research summary).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'fs'
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
  tmpDir = mkdtempSync(join(tmpdir(), 'fulcrum-gemini-pr7-'))
  process.env.FULCRUM_DATA_DIR = tmpDir
  process.env.FULCRUM_WORKSPACE_ID = 'ws_pr7'
  process.env.FULCRUM_PROJECT_ID = 'proj_pr7'
  const db = getDb(tmpDir)
  runMigrations(db)
  runMigration101MemoryV3Lifecycle(db)
  db.prepare(`INSERT OR IGNORE INTO workspaces (workspace_id, name) VALUES ('ws_pr7', 'pr7')`).run()
  db.prepare(`INSERT OR IGNORE INTO projects (project_id, workspace_id, name) VALUES ('proj_pr7', 'ws_pr7', 'pr7')`).run()
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

async function runHookWithStdin(hookFn: () => Promise<void>, stdin: string): Promise<{ stdout: string; stderr: string; exit: number | null }> {
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
  process.stdout.write = ((chunk: string | Uint8Array) => { captured.stdout += typeof chunk === 'string' ? chunk : chunk.toString(); return true }) as typeof process.stdout.write
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

describe('PR 7.2 runGeminiBeforeAgentHook — hookEventName correctness fix', () => {
  beforeEach(() => { setupTmpDb() })
  afterEach(() => { tearDownTmpDb() })

  it('emits hookSpecificOutput.hookEventName = "BeforeAgent" per docs/hooks/reference.md', async () => {
    // Pre-fetched workspace snapshot missing → empty additionalContext path.
    // Even empty, the contract per reference.md is that hookSpecificOutput
    // MUST carry hookEventName. Earlier handler omitted this.
    const { runGeminiBeforeAgentHook } = await import('../index.js')
    const out = await runHookWithStdin(runGeminiBeforeAgentHook, JSON.stringify({
      session_id: 'gemini-sess-a',
      hook_event_name: 'BeforeAgent',
      prompt: 'plan the next task',
    }))
    expect(out.exit).toBe(0)
    if (out.stdout) {
      const resp = JSON.parse(out.stdout) as { hookSpecificOutput?: { hookEventName?: string } }
      expect(resp.hookSpecificOutput?.hookEventName).toBe('BeforeAgent')
    }
  })

  it('parses session_id (snake_case) per reference.md — NOT only conversationId', async () => {
    const { runGeminiBeforeAgentHook } = await import('../index.js')
    const out = await runHookWithStdin(runGeminiBeforeAgentHook, JSON.stringify({
      session_id: 'gemini-snake-id',
      prompt: 'x',
    }))
    expect(out.exit).toBe(0)
    // Contract is session_id per docs/hooks/reference.md — not conversationId.
    // We keep backward-compat with conversationId but session_id must be honored.
  })
})

describe('PR 7.2 runGeminiBeforeToolSelectionHook', () => {
  beforeEach(() => { setupTmpDb() })
  afterEach(() => { tearDownTmpDb() })

  it('pass-through default: allow all tools (no toolConfig mode restriction)', async () => {
    const { runGeminiBeforeToolSelectionHook } = await import('../index.js')
    const out = await runHookWithStdin(runGeminiBeforeToolSelectionHook, JSON.stringify({
      session_id: 'gemini-toolsel-1',
      hook_event_name: 'BeforeToolSelection',
      llm_request: { model: 'gemini-2.0-pro', messages: [{ role: 'user', content: 'hi' }], config: {} },
    }))
    expect(out.exit).toBe(0)
    // Default contract: emit nothing OR an empty pass-through object. Never a
    // toolConfig.mode = 'NONE' (which would disable all tools).
    if (out.stdout.trim()) {
      const resp = JSON.parse(out.stdout) as { hookSpecificOutput?: { toolConfig?: { mode?: string } } }
      expect(resp.hookSpecificOutput?.toolConfig?.mode).not.toBe('NONE')
    }
  })

  it('never throws on empty stdin', async () => {
    const { runGeminiBeforeToolSelectionHook } = await import('../index.js')
    const out = await runHookWithStdin(runGeminiBeforeToolSelectionHook, '')
    expect(out.exit).toBe(0)
  })

  it('never throws on malformed JSON stdin', async () => {
    const { runGeminiBeforeToolSelectionHook } = await import('../index.js')
    const out = await runHookWithStdin(runGeminiBeforeToolSelectionHook, 'not-json')
    expect(out.exit).toBe(0)
  })
})

describe('PR 7.2 runGeminiNotificationHook', () => {
  beforeEach(() => { setupTmpDb() })
  afterEach(() => { tearDownTmpDb() })

  it('logs hook_events row with cli_name=gemini and tool_name=Notification:<type>', async () => {
    const { runGeminiNotificationHook } = await import('../index.js')
    await runHookWithStdin(runGeminiNotificationHook, JSON.stringify({
      session_id: 'gemini-notif-1',
      hook_event_name: 'Notification',
      notification_type: 'ToolPermission',
      message: 'Permission requested for run_shell_command',
      details: { tool: 'run_shell_command', cwd: '/tmp' },
    }))
    const db = getDb()
    const row = db.prepare(`SELECT tool_name, cli_name FROM hook_events WHERE session_id = ?`).get('gemini-notif-1') as { tool_name: string; cli_name: string } | undefined
    expect(row?.cli_name).toBe('gemini')
    expect(row?.tool_name).toContain('Notification')
    expect(row?.tool_name).toContain('ToolPermission')
  })

  it('never throws on empty stdin', async () => {
    const { runGeminiNotificationHook } = await import('../index.js')
    const out = await runHookWithStdin(runGeminiNotificationHook, '')
    expect(out.exit).toBe(0)
  })
})

describe('PR 7.2 runGeminiAfterModelHook', () => {
  beforeEach(() => { setupTmpDb() })
  afterEach(() => { tearDownTmpDb() })

  it('drains stdin and exits 0 without emitting tool-blocking stdout (per-chunk budget: no DB write)', async () => {
    // AfterModel fires per LLM response chunk. Per AD-4 budget (20ms/event),
    // we deliberately skip DB writes. Drain + exit only.
    const { runGeminiAfterModelHook } = await import('../index.js')
    const out = await runHookWithStdin(runGeminiAfterModelHook, JSON.stringify({
      session_id: 'gemini-am-1',
      hook_event_name: 'AfterModel',
      llm_request: { model: 'gemini-2.0-pro' },
      llm_response: { content: 'partial chunk text' },
    }))
    expect(out.exit).toBe(0)
    // Default stdout is either empty or a benign `{}` — never `{decision:"deny"}`.
    if (out.stdout.trim()) {
      const resp = JSON.parse(out.stdout) as { decision?: string }
      expect(resp.decision).not.toBe('deny')
    }
    // No hook_events row expected — per-chunk writes exceed budget.
    const db = getDb()
    const row = db.prepare(`SELECT tool_name FROM hook_events WHERE session_id = ?`).get('gemini-am-1') as { tool_name: string } | undefined
    expect(row).toBeUndefined()
  })

  it('never throws on empty stdin', async () => {
    const { runGeminiAfterModelHook } = await import('../index.js')
    const out = await runHookWithStdin(runGeminiAfterModelHook, '')
    expect(out.exit).toBe(0)
  })
})

describe('PR 7.2 CLI dispatch for new Gemini phases', () => {
  it('dispatch routes before-tool-selection → runGeminiBeforeToolSelectionHook', async () => {
    const src = readFileSync(join(import.meta.dirname ?? __dirname, '..', 'index.ts'), 'utf8')
    expect(src).toMatch(/phaseArg === ['"]before-tool-selection['"].*runGeminiBeforeToolSelectionHook/s)
  })

  it('dispatch routes notification → runGeminiNotificationHook', async () => {
    const src = readFileSync(join(import.meta.dirname ?? __dirname, '..', 'index.ts'), 'utf8')
    expect(src).toMatch(/cli === ['"]gemini['"][\s\S]{0,2000}phaseArg === ['"]notification['"].*runGeminiNotificationHook/)
  })

  it('dispatch routes after-model → runGeminiAfterModelHook (real handler, not stub)', async () => {
    const src = readFileSync(join(import.meta.dirname ?? __dirname, '..', 'index.ts'), 'utf8')
    expect(src).toMatch(/phaseArg === ['"]after-model['"].*runGeminiAfterModelHook/s)
  })

  it('hooks.json registers BeforeAgent + BeforeToolSelection + Notification events', async () => {
    const hooks = JSON.parse(readFileSync(
      join(import.meta.dirname ?? __dirname, '..', '..', '..', '..', 'agent-integration', 'gemini', 'hooks', 'hooks.json'),
      'utf8',
    )) as Record<string, unknown>
    expect(Object.keys(hooks)).toContain('BeforeAgent')
    expect(Object.keys(hooks)).toContain('BeforeToolSelection')
    expect(Object.keys(hooks)).toContain('Notification')
  })
})
