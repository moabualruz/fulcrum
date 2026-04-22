import { describe, expect, it } from 'vitest'
import {
  AGENT_CHAT_RUNTIMES,
  buildAgentCommand,
  buildAgentPrompt,
  buildFixtureScript,
  buildMarkdownReport,
  selectedRuntimes,
  agentAuthFailure,
  shouldFailAgentChatReport,
  type AgentChatReport,
} from './sandbox-agent-chat.js'

describe('sandbox agent chat harness', () => {
  it('builds a short prompt that asks the agent to run the fixture script', () => {
    const prompt = buildAgentPrompt('claude')

    expect(prompt).toContain('bash sandbox-agent-fixture/agent-task.sh claude')
    expect(prompt).toContain('FULCRUM_AGENT_CHAT_DONE claude')
    expect(prompt.length).toBeLessThan(240)
  })

  it('uses noninteractive chat commands for supported CLI agents', () => {
    const prompt = buildAgentPrompt('codex')
    const byId = new Map(AGENT_CHAT_RUNTIMES.map((runtime) => [runtime.id, runtime]))

    expect(buildAgentCommand(byId.get('claude')!, prompt, '/repo', '/out')).toContain('claude')
    expect(buildAgentCommand(byId.get('claude')!, prompt, '/repo', '/out')).toContain('-p')
    expect(buildAgentCommand(byId.get('claude')!, prompt, '/repo', '/out')).toContain('runuser')
    expect(buildAgentCommand(byId.get('claude')!, prompt, '/repo', '/out')).not.toContain('bypassPermissions')
    expect(buildAgentCommand(byId.get('gemini')!, prompt, '/repo', '/out')).toContain('gemini --approval-mode yolo')
    expect(buildAgentCommand(byId.get('pi')!, prompt, '/repo', '/out')).toContain('pi --no-session')
    expect(buildAgentCommand(byId.get('codex')!, prompt, '/repo', '/out')).toContain('codex exec')
    expect(buildAgentCommand(byId.get('codex')!, prompt, '/repo', '/out')).toContain('--dangerously-bypass-approvals-and-sandbox')
    expect(buildAgentCommand(byId.get('codex')!, prompt, '/repo', '/out')).not.toContain('--ask-for-approval')
    expect(buildAgentCommand(byId.get('opencode')!, prompt, '/repo', '/out')).toContain('opencode run')
    expect(buildAgentCommand(byId.get('copilot')!, prompt, '/repo', '/out')).toContain('copilot --allow-all')
  })

  it('fixture script invokes skills, tools, hooks, DB checks, monitor checks, and sample code', () => {
    const script = buildFixtureScript()

    expect(script).toContain('node "$sample_dir/math.test.mjs"')
    expect(script).toContain('"$fulcrum" skills list')
    expect(script).toContain('"$fulcrum" tool list --json')
    expect(script).toContain('"$fulcrum" action exec get_current_context')
    expect(script).toContain('"$fulcrum" action exec write_memory')
    expect(script).toContain('for runtime in claude gemini codex pi opencode cursor windsurf copilot')
    expect(script).toContain('SELECT COUNT(*) AS n FROM hook_events')
    expect(script).toContain('"$fulcrum" serve monitor --port "$port"')
    expect(script).toContain('monitor_tasks_has_task')
  })

  it('selects runtimes from comma-separated env override', () => {
    expect(selectedRuntimes({ FULCRUM_AGENT_CHAT_RUNTIMES: 'claude,codex' }).map((runtime) => runtime.id)).toEqual([
      'claude',
      'codex',
    ])
  })

  it('builds a reviewable markdown report', () => {
    const report: AgentChatReport = {
      generatedAt: '2026-04-22T00:00:00.000Z',
      cwd: '/repo',
      enabled: true,
      strict: false,
      requireAuth: false,
      total: 1,
      passed: 1,
      failed: 0,
      skipped: 0,
      results: [{
        agent: 'claude',
        status: 'pass',
        command: 'claude -p prompt',
        exitCode: 0,
        signal: null,
        durationMs: 10,
        reason: undefined,
        promptPath: '/out/prompt.txt',
        transcriptPath: '/out/transcript.txt',
        validationPath: '/out/validation.json',
        authAuditPath: '/out/auth-audit.json',
      }],
    }

    expect(buildMarkdownReport(report)).toContain('| claude | pass | 0 |')
  })

  it('classifies live CLI auth failures as failures and can require auth success', () => {
    expect(agentAuthFailure('Error: No authentication information found.')).toBe('auth failed after copied config')
    expect(agentAuthFailure('Failed to authenticate. API Error: 401 authentication_error')).toBe('auth failed after copied config')

    const report: AgentChatReport = {
      generatedAt: '2026-04-22T00:00:00.000Z',
      cwd: '/repo',
      enabled: true,
      strict: false,
      requireAuth: false,
      total: 1,
      passed: 0,
      failed: 1,
      skipped: 0,
      results: [{
        agent: 'claude',
        status: 'fail',
        command: 'claude -p prompt',
        exitCode: 1,
        signal: null,
        durationMs: 10,
        reason: 'auth failed after copied config',
        promptPath: '/out/prompt.txt',
        transcriptPath: '/out/transcript.txt',
        validationPath: undefined,
        authAuditPath: '/out/auth-audit.json',
      }],
    }
    expect(shouldFailAgentChatReport(report)).toBe(false)
    expect(shouldFailAgentChatReport({ ...report, strict: true })).toBe(true)
    expect(shouldFailAgentChatReport({ ...report, requireAuth: true })).toBe(true)
  })
})
