import { describe, it, expect } from 'vitest'
import { detectHookCli } from '../index.js'

describe('detectHookCli', () => {
  describe('happy path — Claude event', () => {
    it('returns "claude" when tool_name + session_id are present', () => {
      const event = { tool_name: 'Write', session_id: 'sess_1', tool_input: {} }
      expect(detectHookCli(event)).toBe('claude')
    })
  })

  describe('happy path — Gemini event (camelCase toolName)', () => {
    it('returns "gemini" when toolName + conversationId are present', () => {
      const event = { toolName: 'edit_file', conversationId: 'conv_1', args: {} }
      expect(detectHookCli(event)).toBe('gemini')
    })
  })

  describe('happy path — Gemini event (snake_case tool_name)', () => {
    it('returns "gemini" when tool_name + conversationId are present', () => {
      const event = { tool_name: 'write_file', conversationId: 'conv_2', args: {} }
      // NOTE: tool_name + conversationId would also match Claude check (tool_name + session_id)
      // but conversationId != session_id so the Claude check fails first; Gemini wins.
      expect(detectHookCli(event)).toBe('gemini')
    })
  })

  describe('happy path — PI event', () => {
    it('returns "pi" when role + runId are present', () => {
      const event = { toolName: 'bash', role: 'software_engineer', runId: 'run_1' }
      expect(detectHookCli(event)).toBe('pi')
    })
  })

  describe('edge case — empty object', () => {
    it('returns null for an empty event', () => {
      expect(detectHookCli({})).toBeNull()
    })
  })

  describe('edge case — partial match (tool_name only, no session_id / conversationId / runId)', () => {
    it('returns null when no discriminating field is present', () => {
      const event = { tool_name: 'Read' }
      expect(detectHookCli(event)).toBeNull()
    })
  })

  describe('edge case — ambiguous (Claude fields + PI fields)', () => {
    it('returns "claude" (first match wins) when both claude and pi fields are present', () => {
      // Claude check (tool_name + session_id) comes before the PI check (role + runId)
      const event = {
        tool_name: 'Write',
        session_id: 'sess_amb',
        role: 'software_engineer',
        runId: 'run_amb',
      }
      expect(detectHookCli(event)).toBe('claude')
    })
  })
})
