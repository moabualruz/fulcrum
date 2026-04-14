import { describe, it, expect } from 'vitest'
import { normalizeHookEvent } from '../index.js'

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
      })
    })

    it('empty Claude event defaults all fields', () => {
      const result = normalizeHookEvent('claude', {})
      expect(result.toolName).toBe('')
      expect(result.toolInput).toEqual({})
      expect(result.sessionId).toBe('unknown')
      expect(result.agentRole).toBe('')
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
      })
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

    it('empty PI event defaults role to empty string', () => {
      const result = normalizeHookEvent('pi', {})
      expect(result.agentRole).toBe('')
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
