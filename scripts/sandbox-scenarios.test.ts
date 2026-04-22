import { describe, expect, it } from 'vitest'
import {
  buildCodificationDecisions,
  buildHumanShellCommand,
  buildReviewMarkdown,
  buildReviewNotesTemplate,
  escapeHtml,
  executableHelpRoots,
  isLikelyReadAction,
  parseActionEntries,
  parseHelpCommands,
  registryEntryCommand,
  safeFileName,
  scenario,
  stripAnsi,
  type ScenarioRunReport,
} from './sandbox-scenarios.js'

describe('sandbox scenario crawler', () => {
  it('parses human CLI commands from help text', () => {
    const commands = parseHelpCommands(`
  memory init          Initialize L0 vault
  serve monitor        Start HTTP monitor
  task create --title <title>
  queue merge process --workspace-id <id>
  install plan --json
  creates a workspace when none exists
  fulcrum doctor
  cat payload.json | fulcrum tool exec get_current_context
`)

    expect(commands).toEqual([
      'install plan',
      'memory init',
      'queue merge process',
      'serve monitor',
      'task create',
    ])
    expect(executableHelpRoots(commands)).toEqual([
      'install',
      'memory',
      'queue',
      'serve',
      'task',
    ])
    expect(executableHelpRoots(['doctor', 'memory embed'])).toEqual(['memory'])
  })

  it('identifies read-like actions for safe crawl execution', () => {
    expect(isLikelyReadAction('list_tasks')).toBe(true)
    expect(isLikelyReadAction('get_current_context')).toBe(true)
    expect(isLikelyReadAction('recall_knowledge')).toBe(true)
    expect(isLikelyReadAction('create_task')).toBe(false)
    expect(isLikelyReadAction('complete_agent_run')).toBe(false)
  })

  it('parses action list JSON from the CLI', () => {
    const actions = parseActionEntries(JSON.stringify([
      { action_name: 'list_tasks', cli: { primaryCommand: ['action', 'exec', 'list_tasks'] } },
      { name: 'get_current_context', compatibilityCommand: 'tool exec get_current_context' },
    ]))

    expect(actions.map((action) => action.action_name ?? action.name)).toEqual([
      'list_tasks',
      'get_current_context',
    ])
    expect(registryEntryCommand(actions[0], 'action')).toBe('./fulcrum action exec list_tasks')
    expect(registryEntryCommand(actions[1], 'tool')).toBe('./fulcrum tool exec get_current_context')
  })

  it('wraps commands in a PTY when script is available', () => {
    const wrapped = buildHumanShellCommand('./fulcrum tui', 'q', true)

    expect(wrapped).toContain('script -qfec')
    expect(wrapped).toContain('TERM=xterm-256color')
    expect(wrapped).toContain("printf 'q'")
  })

  it('builds review markdown with codify recommendations and discovered surfaces', () => {
    const item = scenario(
      'doctor-json',
      'Doctor JSON',
      'cli',
      './fulcrum doctor --json',
      true,
      'codify',
      'core diagnostic',
    )
    const report: ScenarioRunReport = {
      generatedAt: '2026-04-22T00:00:00.000Z',
      cwd: '/repo',
      scriptPtyAvailable: true,
      total: 1,
      passed: 1,
      failed: 0,
      requiredFailed: 0,
      results: [{
        scenario: item,
        exitCode: 0,
        signal: null,
        passed: true,
        durationMs: 12,
        transcriptPath: '/repo/report/doctor.txt',
        htmlPath: '/repo/report/doctor.html',
        screenshotPath: '/repo/report/doctor.png',
      }],
      codification: [{
        id: 'doctor-json',
        source: 'executed',
        category: 'cli',
        command: './fulcrum doctor --json',
        recommendation: 'codify',
        reason: 'core diagnostic',
        result: 'pass',
      }],
      discovered: [{
        id: 'action-create-task',
        category: 'registry',
        command: './fulcrum action exec create_task',
        recommendation: 'investigate',
        reason: 'needs payload',
      }],
    }

    expect(buildReviewMarkdown(report)).toContain('doctor-json')
    expect(buildReviewMarkdown(report)).toContain('codify: core diagnostic')
    expect(buildReviewMarkdown(report)).toContain('./fulcrum action exec create_task')
    expect(buildReviewNotesTemplate(report)).toContain('- [ ] accepted')
    expect(buildCodificationDecisions(report.results, report.discovered)).toHaveLength(2)
  })

  it('escapes terminal content for screenshot HTML', () => {
    expect(stripAnsi('\u001b[31mred\u001b[0m')).toBe('red')
    expect(escapeHtml('<script>"x"</script>')).toBe('&lt;script&gt;&quot;x&quot;&lt;/script&gt;')
    expect(safeFileName('MCP plan --json')).toBe('mcp-plan-json')
  })
})
