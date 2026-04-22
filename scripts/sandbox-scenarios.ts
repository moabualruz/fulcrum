import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdirSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

export type ScenarioCategory =
  | 'cli'
  | 'install'
  | 'registry'
  | 'agent'
  | 'hook'
  | 'tui'
  | 'live-agent'
  | 'discovered'

export type CodificationRecommendation = 'codify' | 'crawl-only' | 'investigate'

export interface HumanScenario {
  id: string
  title: string
  category: ScenarioCategory
  command: string
  input?: string
  required: boolean
  expectedExitCodes: number[]
  timeoutMs: number
  recommendation: CodificationRecommendation
  recommendationReason: string
}

export interface DiscoveredSurface {
  id: string
  category: ScenarioCategory
  command: string
  recommendation: CodificationRecommendation
  reason: string
}

export interface ScenarioCodificationDecision {
  id: string
  source: 'executed' | 'discovered'
  category: ScenarioCategory
  command: string
  recommendation: CodificationRecommendation
  reason: string
  result?: 'pass' | 'fail'
}

export interface ScenarioResult {
  scenario: HumanScenario
  exitCode: number
  signal: string | null
  passed: boolean
  durationMs: number
  transcriptPath: string
  htmlPath: string
  screenshotPath: string | undefined
}

export interface ScenarioRunReport {
  generatedAt: string
  cwd: string
  scriptPtyAvailable: boolean
  total: number
  passed: number
  failed: number
  requiredFailed: number
  results: ScenarioResult[]
  codification: ScenarioCodificationDecision[]
  discovered: DiscoveredSurface[]
}

interface ActionListEntry {
  action_name?: string
  name?: string
  primaryCommand?: string
  compatibilityCommand?: string
  cli?: {
    primaryCommand?: string[] | string
    compatibilityCommand?: string[] | string
  }
}

export interface RunScenarioOptions {
  cwd: string
  reportDir: string
  renderScreenshots: boolean
}

const DEFAULT_TIMEOUT_MS = 20_000
const HELP_TIMEOUT_MS = 8_000
const HELP_COMMAND_ROOTS = new Set([
  'action',
  'agent',
  'bias',
  'board',
  'daemon',
  'doctor',
  'dream',
  'epic',
  'hook',
  'init',
  'install',
  'issue',
  'log',
  'mcp',
  'memory',
  'pi',
  'plugin',
  'projects',
  'queue',
  'serve',
  'skills',
  'sync',
  'task',
  'team',
  'tool',
  'tui',
  'workflow',
  'workspaces',
])
const EXECUTABLE_HELP_ROOTS = new Set([
  'action',
  'agent',
  'board',
  'epic',
  'hook',
  'install',
  'issue',
  'mcp',
  'memory',
  'plugin',
  'projects',
  'queue',
  'serve',
  'skills',
  'sync',
  'task',
  'team',
  'tool',
  'workflow',
  'workspaces',
])

const BASE_SCENARIOS: HumanScenario[] = [
  scenario('cli-help', 'Top-level help', 'cli', './fulcrum --help', true, 'codify', 'Primary human entrypoint must stay readable.'),
  scenario('cli-version', 'Version flag', 'cli', './fulcrum --version', true, 'codify', 'Version output is a stable CLI contract.'),
  scenario('doctor-json', 'Doctor JSON health check', 'cli', './fulcrum doctor --json', true, 'codify', 'Doctor is the first operator diagnostic.'),
  scenario('doctor-fix-dry-run', 'Doctor dry-run repair path', 'cli', './fulcrum doctor --fix --dry-run', false, 'codify', 'Repair planning should get a dedicated regression if it fails.'),
  scenario('install-plan-json', 'Adaptive install plan JSON', 'install', './fulcrum install plan --json', true, 'codify', 'Agent install planning is a core integration contract.'),
  scenario('install-apply-dry-run', 'Install apply all dry run', 'install', './fulcrum install apply --all --dry-run', true, 'codify', 'Global/project installer paths must remain previewable.'),
  ...['cursor', 'windsurf', 'codex', 'opencode', 'copilot'].map((agent) =>
    scenario(
      `install-verify-${agent}`,
      `Install verify ${agent}`,
      'install',
      `./fulcrum install verify --agent ${agent}`,
      false,
      'codify',
      `${agent} project integration should verify after sandbox install; the main harness has a hard gate for this command.`,
    ),
  ),
  scenario('tool-list-json', 'Tool registry JSON list', 'registry', './fulcrum tool list --json', true, 'codify', 'Agent tool surface must be discoverable.'),
  scenario('action-list-json', 'Action registry JSON list', 'registry', './fulcrum action list --json', true, 'codify', 'Canonical action surface must be discoverable.'),
  scenario('mcp-plan-json', 'Default MCP exposure plan', 'registry', './fulcrum mcp plan --json', true, 'codify', 'Runtime tool exposure plan is an agent integration point.'),
  scenario('mcp-plan-filtered-hooks', 'Filtered hook-capable MCP plan', 'registry', './fulcrum mcp plan --mode filtered --runtime-capability hooks --json', true, 'codify', 'Hook-aware MCP filtering guards duplication between hooks and MCP.'),
  scenario('mcp-plan-minimal-engineer', 'Minimal software engineer MCP plan', 'registry', './fulcrum mcp plan --mode minimal --agent-type software_engineer --json', true, 'codify', 'Role-scoped tool exposure must stay stable.'),
  scenario('task-list-json', 'Task list JSON', 'cli', './fulcrum task list --json', true, 'codify', 'Task list is the core human read path.'),
  scenario('task-human-lifecycle', 'Human CLI task create/get/update flow', 'cli', [
    `created=$(./fulcrum task create --title 'Sandbox Human CLI Task' --description 'created by sandbox scenario crawler' --json)`,
    'echo "$created"',
    'task_id=$(printf "%s" "$created" | node -e "let s = \'\'; process.stdin.on(\'data\', d => s += d); process.stdin.on(\'end\', () => console.log(JSON.parse(s).task_id));")',
    './fulcrum task get --id "$task_id" --json',
    `./fulcrum task update --id "$task_id" --status completed --note 'sandbox human cli flow' --json`,
    './fulcrum task get --id "$task_id" --json',
  ].join(' && '), true, 'codify', 'Task lifecycle must work through the same CLI humans use.'),
  scenario('memory-status', 'Memory status', 'cli', './fulcrum memory status', false, 'crawl-only', 'Useful exploratory operator state; exact output may vary.'),
  scenario('team-list', 'Team list', 'cli', './fulcrum team list --json', false, 'codify', 'Team list should be codified if the crawl finds drift.'),
  scenario('workflow-list', 'Workflow list', 'cli', './fulcrum workflow list --json', false, 'codify', 'Workflow list should be codified if the crawl finds drift.'),
  scenario('agent-list', 'Agent list', 'agent', './fulcrum agent list --json', false, 'codify', 'Agent list should be codified if the crawl finds drift.'),
  scenario('plugin-list', 'Plugin list', 'cli', './fulcrum plugin list', false, 'crawl-only', 'Plugin inventory is environment-sensitive.'),
  scenario('skills-list', 'Skills list', 'cli', './fulcrum skills list', false, 'crawl-only', 'Skill inventory is useful for review but may change often.'),
  scenario('log-tail-read', 'Activity log read', 'cli', './fulcrum log --limit 5', false, 'crawl-only', 'Activity volume is environment-dependent.'),
  scenario('tui-open-quit', 'Cockpit TUI open and quit', 'tui', './fulcrum tui', false, 'codify', 'TUI should at least launch under a PTY and respond to q.', 'q', [0, 124], 8_000),
  ...['claude', 'gemini', 'codex', 'pi', 'opencode', 'cursor', 'windsurf', 'copilot'].map((runtime) =>
    scenario(
      `hook-${runtime}-empty-event`,
      `Hook ${runtime} empty-event smoke`,
      'hook',
      `./fulcrum hook ${runtime}`,
      false,
      'investigate',
      'Hook payload contracts differ; failures become focused scenario candidates.',
      '{}\n',
      [0, 1],
      10_000,
    ),
  ),
]

const AGENT_BINARY_PROBES = [
  { id: 'claude', command: 'claude --version || claude --help' },
  { id: 'gemini', command: 'gemini --version || gemini --help' },
  { id: 'codex', command: 'codex --version || codex --help' },
  { id: 'pi', command: 'pi --version || pi --help' },
  { id: 'opencode', command: 'opencode --version || opencode --help' },
  { id: 'copilot', command: 'copilot --version || copilot --help' },
  { id: 'github-cli', command: 'gh --version || gh --help' },
  { id: 'cursor', command: 'cursor --version || cursor --help' },
  { id: 'windsurf', command: 'windsurf --version || windsurf --help' },
]

export function scenario(
  id: string,
  title: string,
  category: ScenarioCategory,
  command: string,
  required: boolean,
  recommendation: CodificationRecommendation,
  recommendationReason: string,
  input = '',
  expectedExitCodes = [0],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): HumanScenario {
  return {
    id,
    title,
    category,
    command,
    input,
    required,
    expectedExitCodes,
    timeoutMs,
    recommendation,
    recommendationReason,
  }
}

export function parseHelpCommands(helpText: string): string[] {
  const commands = new Set<string>()
  for (const line of helpText.split(/\r?\n/)) {
    const match = line.match(/^\s{2,}([a-z][a-z-]*(?:\s+[a-z][a-z-]*){0,2})(?:\s|$)/)
    if (match) {
      const command = match[1]
      const [root] = command.split(/\s+/)
      if (HELP_COMMAND_ROOTS.has(root)) {
        commands.add(command)
      }
    }
  }
  return [...commands].sort()
}

export function parseActionEntries(jsonText: string): ActionListEntry[] {
  const parsed = JSON.parse(jsonText) as unknown
  return Array.isArray(parsed) ? parsed as ActionListEntry[] : []
}

export function registryEntryCommand(entry: ActionListEntry, mode: 'action' | 'tool'): string {
  const name = entry.action_name ?? entry.name ?? 'unknown'
  const raw = mode === 'tool'
    ? entry.cli?.compatibilityCommand ?? entry.compatibilityCommand ?? ['tool', 'exec', name]
    : entry.cli?.primaryCommand ?? entry.primaryCommand ?? ['action', 'exec', name]
  const command = Array.isArray(raw) ? raw.join(' ') : raw
  return `./fulcrum ${command}`
}

export function executableHelpRoots(commands: string[]): string[] {
  const roots = new Set<string>()
  for (const command of commands) {
    const [root] = command.split(/\s+/)
    if (root && EXECUTABLE_HELP_ROOTS.has(root)) {
      roots.add(root)
    }
  }
  return [...roots].sort()
}

export function isLikelyReadAction(name: string): boolean {
  return /^(list|get|recall|inspect|trace|build|lint|search|code|project|query)_/.test(name)
    || name === 'get_current_context'
}

export function buildHumanShellCommand(command: string, input: string, usePty: boolean): string {
  const humanCommand = `export TERM=xterm-256color; export FORCE_COLOR=1; ${command}`
  const bashCommand = `bash -lc ${shQuote(humanCommand)}`
  if (usePty) {
    return `printf ${shQuote(input)} | script -qfec ${shQuote(bashCommand)} /dev/null`
  }
  return `printf ${shQuote(input)} | ${bashCommand}`
}

export function discoverScenarios(cwd: string): { scenarios: HumanScenario[], discovered: DiscoveredSurface[] } {
  const scenarios = [...BASE_SCENARIOS]
  const discovered: DiscoveredSurface[] = []
  const coveredScenarioIds = new Set(scenarios.map((item) => item.id))
  const coveredCommands = new Set(scenarios.map((item) => item.command))

  const addScenario = (item: HumanScenario) => {
    if (coveredScenarioIds.has(item.id) || coveredCommands.has(item.command)) {
      return
    }
    coveredScenarioIds.add(item.id)
    coveredCommands.add(item.command)
    scenarios.push(item)
  }

  const helpText = tryExecText(cwd, './fulcrum --help')
  if (helpText) {
    const orderedHelpCommands = parseHelpCommands(helpText)
    for (const root of executableHelpRoots(orderedHelpCommands)) {
      addScenario(scenario(
        `help-${safeFileName(root)}`,
        `Help for ${root}`,
        'discovered',
        `./fulcrum ${root} --help`,
        false,
        'crawl-only',
        'Root command help discovered from CLI crawl; keep as generated crawl unless it becomes a critical human entrypoint.',
        '',
        [0, 1],
        HELP_TIMEOUT_MS,
      ))
    }
    for (const command of orderedHelpCommands) {
      discovered.push({
        id: `help-subcommand-${safeFileName(command)}`,
        category: 'discovered',
        command: `./fulcrum ${command} --help`,
        recommendation: command.includes('create') || command.includes('update') ? 'investigate' : 'crawl-only',
        reason: 'Subcommand help discovered but not executed because some Fulcrum subcommands treat trailing --help as real execution; codify with a seeded safe command if critical.',
      })
    }
  }

  const actionJson = tryExecText(cwd, './fulcrum action list --json')
  if (actionJson) {
    for (const entry of parseActionEntries(actionJson)) {
      const name = entry.action_name ?? entry.name
      if (!name) continue
      const command = registryEntryCommand(entry, 'action')
      if (isLikelyReadAction(name)) {
        addScenario(scenario(
          `action-${safeFileName(name)}`,
          `Action exec ${name}`,
          'registry',
          command,
          false,
          'crawl-only',
          'Discovered read-like action; promote to codified test if output is critical or failure is actionable.',
          '',
          [0, 1],
          12_000,
        ))
      } else {
        discovered.push({
          id: `action-${safeFileName(name)}`,
          category: 'registry',
          command,
          recommendation: 'investigate',
          reason: 'Write/gated action discovered; needs seeded payload before safe codification.',
        })
      }
    }
  }

  const toolJson = tryExecText(cwd, './fulcrum tool list --json')
  if (toolJson) {
    for (const entry of parseActionEntries(toolJson)) {
      const name = entry.name ?? entry.action_name
      if (!name) continue
      const command = registryEntryCommand(entry, 'tool')
      if (isLikelyReadAction(name)) {
        addScenario(scenario(
          `tool-${safeFileName(name)}`,
          `Tool exec ${name}`,
          'registry',
          command,
          false,
          'crawl-only',
          'Discovered read-like tool compatibility path; codify only when the action and tool paths must both be contract-tested.',
          '',
          [0, 1],
          12_000,
        ))
      } else {
        discovered.push({
          id: `tool-${safeFileName(name)}`,
          category: 'registry',
          command,
          recommendation: 'investigate',
          reason: 'Write/gated tool discovered; needs seeded payload before safe codification.',
        })
      }
    }
  }

  for (const probe of AGENT_BINARY_PROBES) {
    const binary = probe.command.split(' ')[0] ?? probe.id
    if (commandExists(binary)) {
      addScenario(scenario(
        `live-agent-${probe.id}`,
        `Installed agent CLI ${probe.id}`,
        'live-agent',
        probe.command,
        false,
        'crawl-only',
        'Agent binary exists in sandbox; version/help smoke proves copied config can coexist with installed runtime.',
        '',
        [0],
        15_000,
      ))
    } else {
      discovered.push({
        id: `live-agent-${probe.id}`,
        category: 'live-agent',
        command: probe.command,
        recommendation: 'crawl-only',
        reason: 'Agent binary not present; sandbox live-agent installer will run only when config and install command are available.',
      })
    }
  }

  return { scenarios: dedupeScenarios(scenarios), discovered }
}

function dedupeScenarios(scenarios: HumanScenario[]): HumanScenario[] {
  const seen = new Set<string>()
  return scenarios.filter((scenario) => {
    if (seen.has(scenario.id)) return false
    seen.add(scenario.id)
    return true
  })
}

export async function runScenarioMatrix(options: RunScenarioOptions): Promise<ScenarioRunReport> {
  const reportDir = path.resolve(options.reportDir, 'cli-scenarios')
  const transcriptDir = path.join(reportDir, 'transcripts')
  const htmlDir = path.join(reportDir, 'html')
  const screenshotDir = path.join(reportDir, 'screenshots')
  mkdirSync(transcriptDir, { recursive: true })
  mkdirSync(htmlDir, { recursive: true })
  mkdirSync(screenshotDir, { recursive: true })

  const usePty = commandExists('script')
  const { scenarios, discovered } = discoverScenarios(options.cwd)
  const results = scenarios.map((item) => runOneScenario(item, options.cwd, {
    transcriptDir,
    htmlDir,
    screenshotDir,
    usePty,
  }))

  if (options.renderScreenshots) {
    await renderTranscriptScreenshots(results)
  }

  const report: ScenarioRunReport = {
    generatedAt: new Date().toISOString(),
    cwd: options.cwd,
    scriptPtyAvailable: usePty,
    total: results.length,
    passed: results.filter((item) => item.passed).length,
    failed: results.filter((item) => !item.passed).length,
    requiredFailed: results.filter((item) => item.scenario.required && !item.passed).length,
    results,
    codification: buildCodificationDecisions(results, discovered),
    discovered,
  }

  writeFileSync(path.join(reportDir, 'scenario-results.json'), JSON.stringify(report, null, 2))
  writeFileSync(path.join(reportDir, 'codification-recommendations.json'), JSON.stringify(report.codification, null, 2))
  writeFileSync(path.join(reportDir, 'scenario-report.md'), buildReviewMarkdown(report))
  writeFileSync(path.join(reportDir, 'review.html'), buildReviewHtml(report))
  writeFileSync(path.join(reportDir, 'review-notes.md'), buildReviewNotesTemplate(report))
  return report
}

function runOneScenario(
  item: HumanScenario,
  cwd: string,
  paths: { transcriptDir: string, htmlDir: string, screenshotDir: string, usePty: boolean },
): ScenarioResult {
  const started = Date.now()
  const wrapped = buildHumanShellCommand(item.command, item.input ?? '', paths.usePty)
  const result = spawnSync('bash', ['-lc', wrapped], {
    cwd,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      FORCE_COLOR: '1',
      CI: process.env['CI'] ?? '1',
    },
    encoding: 'utf8',
    timeout: item.timeoutMs,
    maxBuffer: 12 * 1024 * 1024,
  })
  const exitCode = result.status ?? (result.signal ? 124 : 1)
  const passed = item.expectedExitCodes.includes(exitCode)
  const basename = safeFileName(item.id)
  const transcriptPath = path.join(paths.transcriptDir, `${basename}.txt`)
  const htmlPath = path.join(paths.htmlDir, `${basename}.html`)
  const screenshotPath = path.join(paths.screenshotDir, `${basename}.png`)
  const transcript = [
    `$ ${item.command}`,
    item.input ? `# stdin\n${item.input}` : '',
    `# exit=${exitCode}${result.signal ? ` signal=${result.signal}` : ''}`,
    '# stdout',
    result.stdout ?? '',
    '# stderr',
    result.stderr ?? '',
  ].filter(Boolean).join('\n')

  writeFileSync(transcriptPath, transcript)
  writeFileSync(htmlPath, terminalHtml(item, transcript))

  return {
    scenario: item,
    exitCode,
    signal: result.signal ?? null,
    passed,
    durationMs: Date.now() - started,
    transcriptPath,
    htmlPath,
    screenshotPath,
  }
}

async function renderTranscriptScreenshots(results: ScenarioResult[]): Promise<void> {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    for (const result of results) {
      await page.goto(pathToFileURL(result.htmlPath).href)
      await page.screenshot({ path: result.screenshotPath, fullPage: true })
    }
  } finally {
    await browser.close()
  }
}

export function buildCodificationDecisions(
  results: ScenarioResult[],
  discovered: DiscoveredSurface[],
): ScenarioCodificationDecision[] {
  return [
    ...results.map((result) => ({
      id: result.scenario.id,
      source: 'executed' as const,
      category: result.scenario.category,
      command: result.scenario.command,
      recommendation: result.scenario.recommendation,
      reason: result.scenario.recommendationReason,
      result: result.passed ? 'pass' as const : 'fail' as const,
    })),
    ...discovered.map((item) => ({
      id: item.id,
      source: 'discovered' as const,
      category: item.category,
      command: item.command,
      recommendation: item.recommendation,
      reason: item.reason,
    })),
  ]
}

export function buildReviewMarkdown(report: ScenarioRunReport): string {
  const recommendationCounts = countRecommendations(report.codification)
  const lines = [
    '# Sandbox Scenario Crawl Report',
    '',
    `Generated: ${report.generatedAt}`,
    `PTY available: ${report.scriptPtyAvailable ? 'yes' : 'no'}`,
    '',
    `Total: ${report.total}`,
    `Passed: ${report.passed}`,
    `Failed: ${report.failed}`,
    `Required failed: ${report.requiredFailed}`,
    '',
    '## Codification Summary',
    '',
    `Codify: ${recommendationCounts.codify}`,
    `Crawl-only: ${recommendationCounts['crawl-only']}`,
    `Investigate: ${recommendationCounts.investigate}`,
    '',
    '`codify` means promote to a dedicated regression. `crawl-only` means keep generated crawl coverage. `investigate` means seed payload/auth/safety before codifying.',
    '',
    '## Scenario Results',
    '',
    '| Scenario | Category | Required | Exit | Result | Recommendation |',
    '|---|---:|---:|---:|---:|---|',
  ]

  for (const result of report.results) {
    lines.push(`| ${result.scenario.id} | ${result.scenario.category} | ${result.scenario.required ? 'yes' : 'no'} | ${result.exitCode} | ${result.passed ? 'pass' : 'fail'} | ${result.scenario.recommendation}: ${result.scenario.recommendationReason} |`)
  }

  lines.push('', '## Discovered Surfaces Not Executed', '')
  if (report.discovered.length === 0) {
    lines.push('None.')
  } else {
    lines.push('| Surface | Category | Recommendation | Reason |', '|---|---:|---|---|')
    for (const item of report.discovered) {
      lines.push(`| ${item.command} | ${item.category} | ${item.recommendation} | ${item.reason} |`)
    }
  }

  lines.push('', '## Codification Recommendations', '')
  lines.push('| Source | Scenario | Recommendation | Result | Reason |', '|---|---|---:|---:|---|')
  for (const item of report.codification) {
    lines.push(`| ${item.source} | ${item.id} | ${item.recommendation} | ${item.result ?? ''} | ${item.reason} |`)
  }

  return lines.join('\n')
}

function countRecommendations(items: ScenarioCodificationDecision[]): Record<CodificationRecommendation, number> {
  return {
    codify: items.filter((item) => item.recommendation === 'codify').length,
    'crawl-only': items.filter((item) => item.recommendation === 'crawl-only').length,
    investigate: items.filter((item) => item.recommendation === 'investigate').length,
  }
}

export function buildReviewNotesTemplate(report: ScenarioRunReport): string {
  const lines = ['# Sandbox Review Notes', '']
  for (const result of report.results) {
    lines.push(`## ${result.scenario.id}`)
    lines.push(`- [ ] accepted`)
    lines.push(`- result: ${result.passed ? 'pass' : 'fail'} (${result.exitCode})`)
    lines.push(`- recommendation: ${result.scenario.recommendation}`)
    lines.push('- notes:')
    lines.push('')
  }
  return lines.join('\n')
}

export function buildReviewHtml(report: ScenarioRunReport): string {
  const recommendationCounts = countRecommendations(report.codification)
  const codificationRows = report.codification.map((item) => `<tr>
    <td>${escapeHtml(item.source)}</td>
    <td>${escapeHtml(item.id)}</td>
    <td>${escapeHtml(item.recommendation)}</td>
    <td>${escapeHtml(item.result ?? '')}</td>
    <td>${escapeHtml(item.reason)}</td>
  </tr>`).join('\n')
  const cards = report.results.map((result) => {
    return `<article class="card ${result.passed ? 'pass' : 'fail'}">
  <header>
    <h2>${escapeHtml(result.scenario.id)}</h2>
    <span>${result.passed ? 'PASS' : 'FAIL'} exit=${result.exitCode}</span>
  </header>
  <p><strong>${escapeHtml(result.scenario.title)}</strong></p>
  <p><code>${escapeHtml(result.scenario.command)}</code></p>
  <p>${escapeHtml(result.scenario.recommendation)}: ${escapeHtml(result.scenario.recommendationReason)}</p>
  <label><input type="checkbox" data-key="accepted:${escapeHtml(result.scenario.id)}"> accepted</label>
  <textarea data-key="notes:${escapeHtml(result.scenario.id)}" placeholder="notes"></textarea>
  <img src="${escapeHtml(path.relative(path.dirname(result.htmlPath), result.screenshotPath ?? '').replace(/\\/g, '/'))}" alt="${escapeHtml(result.scenario.id)} terminal screenshot">
</article>`
  }).join('\n')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Fulcrum Sandbox Review</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, sans-serif; color: #172026; background: #f4f6f8; }
    main { max-width: 1180px; margin: 0 auto; padding: 24px; }
    h1 { margin: 0 0 8px; }
    .summary { display: flex; gap: 12px; flex-wrap: wrap; margin: 16px 0 24px; }
    .summary span { background: #fff; border: 1px solid #d7dee5; padding: 8px 10px; border-radius: 6px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(460px, 1fr)); gap: 16px; }
    table { width: 100%; border-collapse: collapse; background: #fff; margin: 0 0 24px; }
    th, td { text-align: left; border-bottom: 1px solid #d7dee5; padding: 8px; vertical-align: top; }
    .card { background: #fff; border: 1px solid #d7dee5; border-left: 6px solid #7a8694; border-radius: 8px; padding: 14px; }
    .card.pass { border-left-color: #16794c; }
    .card.fail { border-left-color: #bd352c; }
    header { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
    h2 { font-size: 16px; margin: 0; }
    code { white-space: pre-wrap; word-break: break-word; }
    textarea { width: 100%; min-height: 72px; display: block; margin: 8px 0 12px; }
    img { width: 100%; border: 1px solid #d7dee5; border-radius: 4px; background: #111; }
  </style>
</head>
<body>
  <main>
    <h1>Fulcrum Sandbox Review</h1>
    <p>Checkboxes and notes persist in this browser through localStorage.</p>
    <section class="summary">
      <span>Total ${report.total}</span>
      <span>Passed ${report.passed}</span>
      <span>Failed ${report.failed}</span>
      <span>Required failed ${report.requiredFailed}</span>
      <span>Codify ${recommendationCounts.codify}</span>
      <span>Crawl-only ${recommendationCounts['crawl-only']}</span>
      <span>Investigate ${recommendationCounts.investigate}</span>
    </section>
    <table>
      <thead><tr><th>Source</th><th>Scenario</th><th>Recommendation</th><th>Result</th><th>Reason</th></tr></thead>
      <tbody>${codificationRows}</tbody>
    </table>
    <section class="grid">${cards}</section>
  </main>
  <script>
    for (const el of document.querySelectorAll('[data-key]')) {
      const key = 'fulcrum-sandbox-review:' + el.dataset.key;
      if (el.type === 'checkbox') el.checked = localStorage.getItem(key) === 'true';
      else el.value = localStorage.getItem(key) || '';
      el.addEventListener('input', () => {
        localStorage.setItem(key, el.type === 'checkbox' ? String(el.checked) : el.value);
      });
    }
  </script>
</body>
</html>`
}

function terminalHtml(item: HumanScenario, transcript: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(item.id)}</title>
  <style>
    body { margin: 0; background: #0d1117; color: #d6deeb; font: 14px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    header { padding: 14px 18px; background: #161b22; border-bottom: 1px solid #30363d; }
    h1 { margin: 0; font-size: 16px; }
    p { margin: 6px 0 0; color: #9fb0c0; }
    pre { margin: 0; padding: 18px; white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <header><h1>${escapeHtml(item.id)}</h1><p>${escapeHtml(item.command)}</p></header>
  <pre>${escapeHtml(stripAnsi(transcript))}</pre>
</body>
</html>`
}

export function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function safeFileName(value: string): string {
  return value
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 120) || 'scenario'
}

function commandExists(binary: string): boolean {
  const result = spawnSync('bash', ['-lc', `command -v ${shQuote(binary)} >/dev/null 2>&1`])
  return result.status === 0
}

function tryExecText(cwd: string, command: string): string | undefined {
  try {
    return execFileSync('bash', ['-lc', command], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return undefined
  }
}

function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function defaultReportDir(): string {
  return path.resolve(process.env['FULCRUM_E2E_REPORT_DIR'] ?? 'sandbox-reports')
}

const entrypoint = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === entrypoint) {
  runScenarioMatrix({
    cwd: process.cwd(),
    reportDir: defaultReportDir(),
    renderScreenshots: process.env['FULCRUM_SCENARIO_SCREENSHOTS'] !== '0',
  }).then((report) => {
    console.log(JSON.stringify({
      total: report.total,
      passed: report.passed,
      failed: report.failed,
      requiredFailed: report.requiredFailed,
      report: path.join(defaultReportDir(), 'cli-scenarios', 'scenario-report.md'),
      review: path.join(defaultReportDir(), 'cli-scenarios', 'review.html'),
    }, null, 2))
    process.exit(report.requiredFailed === 0 ? 0 : 1)
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error))
    process.exit(1)
  })
}
