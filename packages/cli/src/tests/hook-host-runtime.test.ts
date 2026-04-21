import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { parseStdoutJson, runCli } from './compliance/helpers.js'

let tmpDir: string | null = null

function env(): Record<string, string> {
  return {
    FULCRUM_DATA_DIR: tmpDir!,
    FULCRUM_WORKSPACE_ID: 'ws_host_runtime',
    FULCRUM_PROJECT_ID: 'proj_host_runtime',
    FULCRUM_NO_RECALL_NUDGE: '1',
  }
}

describe('host hook runtime dispatch', () => {
  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'fulcrum-host-runtime-'))
  })

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = null
    }
  })

  it('Cursor preToolUse consumes stdin and returns allow JSON for documented tool events', () => {
    const result = runCli(
      ['hook', 'cursor', '--event', 'pre_tool_use'],
      JSON.stringify({
        tool_name: 'Read',
        tool_input: { file_path: '/repo/README.md' },
        tool_use_id: 'cursor_tool_1',
        cwd: '/repo',
      }),
      env(),
    )
    expect(result.exitCode).toBe(0)
    expect(parseStdoutJson(result.stdout)).toEqual({ continue: true })
    expect(result.stderr).not.toMatch(/Unknown hook phase|Unexpected token/)
  })

  it('Cursor sessionStart creates trusted session state used by read/search bias', () => {
    const session = runCli(
      ['hook', 'cursor', '--event', 'session_start'],
      JSON.stringify({ session_id: 'cursor_session_1', is_background_agent: false, composer_mode: 'agent' }),
      env(),
    )
    expect(session.exitCode).toBe(0)
    expect(parseStdoutJson(session.stdout)).toMatchObject({
      env: {
        FULCRUM_SESSION_ID: 'cursor_session_1',
        CURSOR_SESSION_ID: 'cursor_session_1',
      },
    })
    expect(existsSync(join(tmpDir!, 'sessions', 'cursor_session_1.json'))).toBe(true)

    const read = runCli(
      ['hook', 'cursor', '--event', 'pre_tool_use'],
      JSON.stringify({
        tool_name: 'Read',
        tool_input: { file_path: '/repo/README.md' },
        tool_use_id: 'cursor_tool_2',
        cwd: '/repo',
        model: 'claude-sonnet-4-20250514',
      }),
      { ...env(), FULCRUM_NO_RECALL_NUDGE: '0', CURSOR_SESSION_ID: 'cursor_session_1' },
    )
    expect(read.exitCode).toBe(0)
    expect(parseStdoutJson(read.stdout)).toEqual({ continue: true })
    expect(read.stderr).toContain('fulcrum-first')
  })

  it('Windsurf pre_read_code consumes the actual agent_action_name/tool_info schema', () => {
    const result = runCli(
      ['hook', 'windsurf', '--event', 'pre_read_code'],
      JSON.stringify({
        agent_action_name: 'pre_read_code',
        trajectory_id: 'windsurf_traj_1',
        execution_id: 'windsurf_exec_1',
        tool_info: { file_path: '/repo/src/index.ts' },
      }),
      env(),
    )
    expect(result.exitCode).toBe(0)
    expect(parseStdoutJson(result.stdout)).toEqual({ continue: true })
    expect(result.stderr).not.toMatch(/Unknown hook phase|Unexpected token/)
  })

  it('Windsurf pre_user_prompt creates trusted session state used by read/search bias', () => {
    const session = runCli(
      ['hook', 'windsurf', '--event', 'pre_user_prompt'],
      JSON.stringify({
        agent_action_name: 'pre_user_prompt',
        trajectory_id: 'windsurf_traj_bias',
        execution_id: 'windsurf_exec_bias',
        tool_info: { prompt: 'inspect repository docs' },
      }),
      env(),
    )
    expect(session.exitCode).toBe(0)
    expect(parseStdoutJson(session.stdout)).toEqual({ continue: true })
    expect(existsSync(join(tmpDir!, 'sessions', 'windsurf_traj_bias.json'))).toBe(true)

    const read = runCli(
      ['hook', 'windsurf', '--event', 'pre_read_code'],
      JSON.stringify({
        agent_action_name: 'pre_read_code',
        trajectory_id: 'windsurf_traj_bias',
        execution_id: 'windsurf_exec_bias',
        tool_info: { file_path: '/repo/README.md' },
      }),
      { ...env(), FULCRUM_NO_RECALL_NUDGE: '0' },
    )
    expect(read.exitCode).toBe(0)
    expect(parseStdoutJson(read.stdout)).toEqual({ continue: true })
    expect(read.stderr).toContain('fulcrum-first')
  })

  it('Copilot PreToolUse consumes Claude-compatible stdin and returns allow JSON', () => {
    const result = runCli(
      ['hook', 'copilot', '--event', 'pre_tool_use'],
      JSON.stringify({
        tool_name: 'Read',
        tool_input: { file_path: '/repo/README.md' },
        session_id: 'copilot_sess_1',
      }),
      env(),
    )
    expect(result.exitCode).toBe(0)
    expect(parseStdoutJson(result.stdout)).toEqual({ continue: true })
    expect(result.stderr).not.toMatch(/Unknown hook phase|Unexpected token/)
  })

  it('Copilot SessionStart creates trusted session state used by read/search bias', () => {
    const session = runCli(
      ['hook', 'copilot', '--event', 'session_start'],
      JSON.stringify({ session_id: 'copilot_session_1', model: 'copilot-cli' }),
      env(),
    )
    expect(session.exitCode).toBe(0)
    expect(parseStdoutJson(session.stdout)).toEqual({ continue: true })
    expect(existsSync(join(tmpDir!, 'sessions', 'copilot_session_1.json'))).toBe(true)

    const read = runCli(
      ['hook', 'copilot', '--event', 'pre_tool_use'],
      JSON.stringify({
        tool_name: 'Read',
        tool_input: { file_path: '/repo/README.md' },
        session_id: 'copilot_session_1',
      }),
      { ...env(), FULCRUM_NO_RECALL_NUDGE: '0' },
    )
    expect(read.exitCode).toBe(0)
    expect(parseStdoutJson(read.stdout)).toEqual({ continue: true })
    expect(read.stderr).toContain('fulcrum-first')
  })
})
