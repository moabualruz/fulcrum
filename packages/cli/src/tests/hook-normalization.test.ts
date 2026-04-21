import { describe, it, expect } from 'vitest'
import { detectHookCli, normalizeHookEvent } from '../index.js'

describe('normalizeHookEvent (H-21)', () => {
  describe('Claude Code (PreToolUse)', () => {
    it('normalizes tool_name / tool_input / session_id', () => {
      const result = normalizeHookEvent('claude', {
        tool_name: 'Read',
        tool_input: { file_path: '/x' },
        session_id: 'sess_abc',
      })
      expect(result).toEqual({
        toolName: 'Read',
        toolInput: { file_path: '/x' },
        sessionId: 'sess_abc',
        agentRole: '',
        runId: '',
      })
    })

    it('empty Claude event defaults all fields', () => {
      const result = normalizeHookEvent('claude', {})
      expect(result.toolName).toBe('')
      expect(result.toolInput).toEqual({})
      expect(result.sessionId).toBe('unknown')
      expect(result.agentRole).toBe('')
      expect(result.runId).toBe('')
    })

    it('Claude events have empty runId', () => {
      const result = normalizeHookEvent('claude', {
        tool_name: 'Read', tool_input: {}, session_id: 's',
      })
      expect(result.runId).toBe('')
    })
  })

  describe('Gemini CLI (BeforeTool)', () => {
    it('normalizes snake_case fields (tool_name / tool_input / session_id)', () => {
      const result = normalizeHookEvent('gemini', {
        tool_name: 'Write',
        tool_input: { path: '/y', content: 'hi' },
        session_id: 'sess_g1',
      })
      expect(result).toEqual({
        toolName: 'Write',
        toolInput: { path: '/y', content: 'hi' },
        sessionId: 'sess_g1',
        agentRole: '',
        runId: '',
      })
    })

    it('Gemini events have empty runId', () => {
      const result = normalizeHookEvent('gemini', {
        toolName: 'Edit', toolInput: {}, conversationId: 'c',
      })
      expect(result.runId).toBe('')
    })

    it('normalizes camelCase fields (toolName / toolInput / conversationId)', () => {
      const result = normalizeHookEvent('gemini', {
        toolName: 'Edit',
        toolInput: { path: '/z' },
        conversationId: 'conv_42',
      })
      expect(result.toolName).toBe('Edit')
      expect(result.toolInput).toEqual({ path: '/z' })
      expect(result.sessionId).toBe('conv_42')
    })

    it('normalizes args as toolInput fallback', () => {
      const result = normalizeHookEvent('gemini', {
        toolName: 'Bash',
        args: { command: 'ls' },
        conversationId: 'c1',
      })
      expect(result.toolInput).toEqual({ command: 'ls' })
    })
  })

  describe('PI (BeforeTool)', () => {
    it('extracts role and runId on top of the tool shape', () => {
      const result = normalizeHookEvent('pi', {
        toolName: 'Grep',
        toolInput: { pattern: 'foo' },
        sessionId: 'pi_sess_1',
        role: 'software_engineer',
        runId: 'run_xyz',
      })
      expect(result.toolName).toBe('Grep')
      expect(result.toolInput).toEqual({ pattern: 'foo' })
      expect(result.sessionId).toBe('pi_sess_1')
      expect(result.agentRole).toBe('software_engineer')
      expect(result.runId).toBe('run_xyz')
    })

    it('PI fall back: snake_case fields still work', () => {
      const result = normalizeHookEvent('pi', {
        tool_name: 'Glob',
        tool_input: { pattern: '**/*.ts' },
        session_id: 'pi_sess_2',
        role: 'code_reviewer',
      })
      expect(result.toolName).toBe('Glob')
      expect(result.sessionId).toBe('pi_sess_2')
      expect(result.agentRole).toBe('code_reviewer')
    })

    it('PI snake_case run_id still round-trips', () => {
      const result = normalizeHookEvent('pi', {
        tool_name: 'Bash',
        tool_input: { command: 'ls' },
        session_id: 'pi_sess_2',
        role: 'software_engineer',
        run_id: 'run_snake',
      })
      expect(result.runId).toBe('run_snake')
    })

    it('empty PI event defaults role to empty string', () => {
      const result = normalizeHookEvent('pi', {})
      expect(result.agentRole).toBe('')
      expect(result.runId).toBe('')
    })
  })

  describe('GitHub Copilot CLI (Claude-compatible hook shape)', () => {
    it('normalizes tool_name / tool_input / session_id', () => {
      const result = normalizeHookEvent('copilot', {
        tool_name: 'Write',
        tool_input: { file_path: '/x', content: 'hi' },
        session_id: 'copilot_sess_1',
      })
      expect(result).toEqual({
        toolName: 'Write',
        toolInput: { file_path: '/x', content: 'hi' },
        sessionId: 'copilot_sess_1',
        agentRole: '',
        runId: '',
      })
    })
  })

  describe('Cursor hooks (actual request body)', () => {
    it('uses Cursor session env before tool_use_id when Cursor omits session_id', () => {
      const previous = process.env['CURSOR_SESSION_ID']
      process.env['CURSOR_SESSION_ID'] = 'cursor_session_env'
      const result = normalizeHookEvent('cursor', {
        tool_name: 'Read',
        tool_input: { file_path: '/repo/README.md' },
        tool_use_id: 'cursor_tool_123',
        cwd: '/repo',
      })
      if (previous === undefined) {
        delete process.env['CURSOR_SESSION_ID']
      } else {
        process.env['CURSOR_SESSION_ID'] = previous
      }
      expect(result.toolName).toBe('Read')
      expect(result.toolInput).toEqual({ file_path: '/repo/README.md' })
      expect(result.sessionId).toBe('cursor_session_env')
    })

    it('uses tool_use_id as last session fallback when no Cursor session env exists', () => {
      const previous = process.env['CURSOR_SESSION_ID']
      const previousFulcrum = process.env['FULCRUM_SESSION_ID']
      delete process.env['CURSOR_SESSION_ID']
      delete process.env['FULCRUM_SESSION_ID']
      const result = normalizeHookEvent('cursor', {
        tool_name: 'Read',
        tool_input: { file_path: '/repo/README.md' },
        tool_use_id: 'cursor_tool_123',
        cwd: '/repo',
      })
      if (previous !== undefined) process.env['CURSOR_SESSION_ID'] = previous
      if (previousFulcrum !== undefined) process.env['FULCRUM_SESSION_ID'] = previousFulcrum
      expect(result.sessionId).toBe('cursor_tool_123')
    })
  })

  describe('Windsurf hooks (documented agent_action_name/tool_info shape)', () => {
    it('auto-detects Windsurf actual hook events', () => {
      expect(detectHookCli({
        agent_action_name: 'pre_read_code',
        trajectory_id: 'traj_1',
        tool_info: { file_path: '/repo/a.ts' },
      })).toBe('windsurf')
    })

    it('normalizes pre_read_code to Read + file_path', () => {
      const result = normalizeHookEvent('windsurf', {
        agent_action_name: 'pre_read_code',
        trajectory_id: 'traj_1',
        execution_id: 'exec_1',
        tool_info: { file_path: '/repo/a.ts' },
      })
      expect(result.toolName).toBe('Read')
      expect(result.toolInput).toEqual({ file_path: '/repo/a.ts' })
      expect(result.sessionId).toBe('traj_1')
    })

    it('normalizes pre_run_command to Bash + command', () => {
      const result = normalizeHookEvent('windsurf', {
        agent_action_name: 'pre_run_command',
        execution_id: 'exec_2',
        tool_info: { command_line: 'pnpm test', cwd: '/repo' },
      })
      expect(result.toolName).toBe('Bash')
      expect(result.toolInput).toEqual({ command: 'pnpm test', cwd: '/repo' })
      expect(result.sessionId).toBe('exec_2')
    })

    it('normalizes pre_mcp_tool_use to the MCP tool name and arguments', () => {
      const result = normalizeHookEvent('windsurf', {
        agent_action_name: 'pre_mcp_tool_use',
        trajectory_id: 'traj_3',
        tool_info: {
          mcp_server_name: 'fulcrum',
          mcp_tool_name: 'search_code',
          mcp_tool_arguments: { text: 'hook drift' },
        },
      })
      expect(result.toolName).toBe('search_code')
      expect(result.toolInput).toEqual({
        text: 'hook drift',
        mcp_server_name: 'fulcrum',
      })
      expect(result.sessionId).toBe('traj_3')
    })
  })

  describe('safety', () => {
    it('non-object toolInput degrades to empty object', () => {
      const result = normalizeHookEvent('claude', {
        tool_name: 'Read',
        tool_input: null,
        session_id: 's',
      })
      // tool_input=null coerces to empty object via the ?? fallback
      expect(result.toolInput).toEqual({})
    })

    it('pure object return — no prototype pollution from event', () => {
      const result = normalizeHookEvent('claude', {
        tool_name: 'x',
        tool_input: { a: 1 },
        session_id: 's',
      })
      // The function must copy-by-reference at most, not merge into a global object.
      // This is a sanity check, not a deep-clone requirement.
      expect(typeof result).toBe('object')
      expect(result).not.toBe(null)
    })
  })
})
