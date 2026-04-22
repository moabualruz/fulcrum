import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export type AgentChatStatus = 'pass' | 'fail' | 'skip'

export interface AgentChatRuntime {
  id: string
  binary: string
  command: (prompt: string, cwd: string, outDir: string) => string
}

export interface AgentChatResult {
  agent: string
  status: AgentChatStatus
  command: string | undefined
  exitCode: number | null
  signal: string | null
  durationMs: number
  reason: string | undefined
  promptPath: string | undefined
  transcriptPath: string | undefined
  validationPath: string | undefined
  authAuditPath: string | undefined
}

export interface AgentChatReport {
  generatedAt: string
  cwd: string
  enabled: boolean
  strict: boolean
  requireAuth: boolean
  total: number
  passed: number
  failed: number
  skipped: number
  results: AgentChatResult[]
}

export const AGENT_CHAT_RUNTIMES: AgentChatRuntime[] = [
  {
    id: 'claude',
    binary: 'claude',
    command: (prompt, cwd) => asSandboxUser([
      'claude',
      '--allowedTools Bash,Read,Write,Edit',
      '--no-session-persistence',
      '-p',
      shQuote(prompt),
    ].join(' '), cwd),
  },
  {
    id: 'gemini',
    binary: 'gemini',
    command: (prompt) => `gemini --approval-mode yolo --output-format text -p ${shQuote(prompt)}`,
  },
  {
    id: 'pi',
    binary: 'pi',
    command: (prompt) => [
      'pi',
      '--no-session',
      '--tools read,bash,edit,write,grep,find,ls',
      '-p',
      shQuote(prompt),
    ].join(' '),
  },
  {
    id: 'codex',
    binary: 'codex',
    command: (prompt, cwd, outDir) => [
      'codex exec',
      '-C',
      shQuote(cwd),
      '--dangerously-bypass-approvals-and-sandbox',
      '--skip-git-repo-check',
      '--ephemeral',
      '--output-last-message',
      shQuote(path.join(outDir, 'last-message.txt')),
      shQuote(prompt),
    ].join(' '),
  },
  {
    id: 'opencode',
    binary: 'opencode',
    command: (prompt, cwd) => `opencode run --dir ${shQuote(cwd)} ${shQuote(prompt)}`,
  },
  {
    id: 'copilot',
    binary: 'copilot',
    command: (prompt, cwd) => [
      'copilot',
      '--allow-all',
      '--no-ask-user',
      '--stream off',
      '--no-color',
      '--silent',
      '--add-dir',
      shQuote(cwd),
      '-p',
      shQuote(prompt),
    ].join(' '),
  },
]

const CHAT_TIMEOUT_MS = Number.parseInt(process.env['FULCRUM_AGENT_CHAT_TIMEOUT_MS'] ?? '180000', 10)
const HOOK_RUNTIMES = ['claude', 'gemini', 'codex', 'pi', 'opencode', 'cursor', 'windsurf', 'copilot']
const AUTH_AUDIT_PATHS: Record<string, string[]> = {
  claude: [
    '.claude',
    '.claude.json',
    '.claude.json.backup',
    '.config/Claude',
    '.config/Claude-3p',
    '.local/share/claude',
    '.local/share/claude-cowork',
    '.local/state/claude',
    '.cache/claude',
    '.cache/claude-cli-nodejs',
    '.cache/claude-desktop',
  ],
  gemini: ['.gemini', '.config/gemini', '.local/share/gemini', '.local/state/gemini', '.cache/gemini'],
  pi: ['.pi', '.config/pi', '.local/share/pi', '.local/state/pi', '.cache/pi', '.pi-lens'],
  codex: ['.codex', '.config/Codex', '.local/state/codex', '.cache/codex', '.cache/codex-desktop'],
  opencode: [
    '.config/opencode',
    '.opencode',
    '.local/share/opencode',
    '.local/state/opencode',
    '.cache/opencode',
    '.config/ai.opencode.desktop',
    '.local/share/ai.opencode.desktop',
    '.cache/ai.opencode.desktop',
  ],
  copilot: ['.config/github-copilot', '.copilot', '.cache/copilot'],
}
const AUTH_ENV_KEYS: Record<string, string[]> = {
  claude: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  pi: ['PI_API_KEY'],
  codex: ['OPENAI_API_KEY'],
  opencode: ['OPENCODE_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY'],
  copilot: ['GITHUB_TOKEN', 'GH_TOKEN', 'COPILOT_GITHUB_TOKEN'],
}

export function buildAgentPrompt(agent: string): string {
  return [
    'Disposable Fulcrum sandbox.',
    `Run exactly: bash sandbox-agent-fixture/agent-task.sh ${agent}`,
    `Then reply exactly: FULCRUM_AGENT_CHAT_DONE ${agent}`,
    'Do not edit anything else. Do not ask questions.',
  ].join('\n')
}

export function buildFixtureScript(): string {
  return `#!/usr/bin/env bash
set -euo pipefail

agent="\${1:?agent required}"
fulcrum="./fulcrum"
report_root="\${FULCRUM_E2E_REPORT_DIR:-$(pwd)/sandbox-reports}"
out_dir="$report_root/agent-chat/$agent"
sample_dir="$(pwd)/sandbox-agent-fixture/sample-code"
mkdir -p "$out_dir" "$sample_dir"

cat > "$sample_dir/math.mjs" <<'FULCRUM_SAMPLE'
export function add(a, b) {
  return a + b
}

export function brokenMultiply(a, b) {
  return a * b
}
FULCRUM_SAMPLE

cat > "$sample_dir/math.test.mjs" <<'FULCRUM_SAMPLE_TEST'
import { add, brokenMultiply } from './math.mjs'

if (add(2, 3) !== 5) throw new Error('add failed')
if (brokenMultiply(3, 4) !== 12) throw new Error('multiply failed')
console.log('sample-code-ok')
FULCRUM_SAMPLE_TEST

node "$sample_dir/math.test.mjs" > "$out_dir/sample-test.txt"

"$fulcrum" skills list > "$out_dir/skills.txt"
"$fulcrum" tool list --json > "$out_dir/tools.json"
"$fulcrum" action list --json > "$out_dir/actions.json"
"$fulcrum" action exec get_current_context > "$out_dir/current-context.json"

ws="$(node -e "const j=require('fs').readFileSync('$out_dir/current-context.json','utf8'); console.log(JSON.parse(j).result.workspace_id)")"
proj="$(node -e "const j=require('fs').readFileSync('$out_dir/current-context.json','utf8'); console.log(JSON.parse(j).result.project_id)")"

"$fulcrum" task create \\
  --workspace-id "$ws" \\
  --project-id "$proj" \\
  --title "Agent chat $agent fixture" \\
  --description "Sandbox chat agent invoked Fulcrum skills, tools, hooks, DB and monitor validation." \\
  --json > "$out_dir/task.json"

task_id="$(node -e "const j=require('fs').readFileSync('$out_dir/task.json','utf8'); console.log(JSON.parse(j).task_id)")"

node - "$ws" "$proj" "$agent" <<'NODE' > "$out_dir/write-memory-payload.json"
const [workspace_id, project_id, agent] = process.argv.slice(2)
console.log(JSON.stringify({
  workspace_id,
  project_id,
  title: \`Agent chat \${agent} fixture\`,
  summary: \`Agent chat \${agent} ran sandbox fixture\`,
  content: \`Agent chat \${agent} invoked Fulcrum CLI tools, skills, hooks, DB validation, monitor validation, and sample code tests.\`,
  kind: 'fact',
  scope: 'project',
  tags: ['sandbox', 'agent-chat', agent],
}))
NODE

"$fulcrum" action exec write_memory --json "$(cat "$out_dir/write-memory-payload.json")" > "$out_dir/memory.json"

hook_before="$(node - <<'NODE'
const { createRequire } = require('module')
const requireFromCore = createRequire(process.cwd() + '/packages/core/package.json')
const Database = requireFromCore('better-sqlite3')
const db = new Database(process.env.FULCRUM_DATA_DIR + '/fulcrum.db')
const row = db.prepare('SELECT COUNT(*) AS n FROM hook_events').get()
console.log(row.n)
NODE
)"

for runtime in ${HOOK_RUNTIMES.join(' ')}; do
  node - "$runtime" "$agent" "$task_id" <<'NODE' > "$out_dir/hook-$runtime.json"
const [runtime, agent, taskId] = process.argv.slice(2)
console.log(JSON.stringify({
  session_id: \`sandbox-chat-\${agent}-\${runtime}\`,
  transcript_path: \`sandbox-agent-fixture/\${agent}-\${runtime}.txt\`,
  cwd: process.cwd(),
  tool_name: 'Bash',
  tool_input: { command: 'node sandbox-agent-fixture/sample-code/math.test.mjs' },
  agent_role: 'software_engineer',
  task_id: taskId,
}))
NODE
  if "$fulcrum" hook "$runtime" pre < "$out_dir/hook-$runtime.json" > "$out_dir/hook-$runtime.out" 2> "$out_dir/hook-$runtime.err"; then
    echo "$runtime pass" >> "$out_dir/hooks-summary.txt"
  else
    echo "$runtime fail" >> "$out_dir/hooks-summary.txt"
  fi
done

port="$(node -e "console.log(4800 + Math.floor(Math.random() * 1000))")"
"$fulcrum" serve monitor --port "$port" > "$out_dir/monitor.log" 2>&1 &
monitor_pid="$!"
cleanup() { kill "$monitor_pid" >/dev/null 2>&1 || true; }
trap cleanup EXIT

for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$port/status" > "$out_dir/monitor-status.json"; then
    break
  fi
  sleep 0.25
done

curl -fsS "http://127.0.0.1:$port/tasks?workspace_id=$ws&limit=50" > "$out_dir/monitor-tasks.json"
curl -fsS "http://127.0.0.1:$port/memory/stats?workspace_id=$ws" > "$out_dir/monitor-memory-stats.json" || true

node - "$out_dir" "$agent" "$task_id" "$hook_before" <<'NODE' > "$out_dir/validation.json"
const fs = require('fs')
const path = require('path')
const { createRequire } = require('module')
const requireFromCore = createRequire(process.cwd() + '/packages/core/package.json')
const Database = requireFromCore('better-sqlite3')
const [outDir, agent, taskId, beforeText] = process.argv.slice(2)
const db = new Database(process.env.FULCRUM_DATA_DIR + '/fulcrum.db')
const readJson = (name) => JSON.parse(fs.readFileSync(path.join(outDir, name), 'utf8'))
const count = (sql, ...args) => db.prepare(sql).get(...args).n
const tools = readJson('tools.json')
const actions = readJson('actions.json')
const status = readJson('monitor-status.json')
const tasks = readJson('monitor-tasks.json')
const hookAfter = count('SELECT COUNT(*) AS n FROM hook_events')
const validation = {
  agent,
  task_id: taskId,
  sample_code_ok: fs.readFileSync(path.join(outDir, 'sample-test.txt'), 'utf8').includes('sample-code-ok'),
  skills_listed: fs.statSync(path.join(outDir, 'skills.txt')).size > 0,
  tools_count: Array.isArray(tools) ? tools.length : 0,
  actions_count: Array.isArray(actions) ? actions.length : 0,
  task_rows: count('SELECT COUNT(*) AS n FROM tasks WHERE task_id = ?', taskId),
  memory_rows: count('SELECT COUNT(*) AS n FROM memories WHERE content LIKE ?', \`%Agent chat \${agent}%\`),
  hook_events_before: Number(beforeText),
  hook_events_after: hookAfter,
  hook_events_delta: hookAfter - Number(beforeText),
  monitor_status_ok: Boolean(status.workspace_id),
  monitor_tasks_has_task: Array.isArray(tasks.data) && tasks.data.some((task) => task.task_id === taskId),
}
validation.ok = validation.sample_code_ok
  && validation.skills_listed
  && validation.tools_count > 0
  && validation.actions_count > 0
  && validation.task_rows === 1
  && validation.memory_rows >= 1
  && validation.hook_events_delta >= 1
  && validation.monitor_status_ok
  && validation.monitor_tasks_has_task
console.log(JSON.stringify(validation, null, 2))
process.exit(validation.ok ? 0 : 1)
NODE
`
}

export function buildAgentCommand(runtime: AgentChatRuntime, prompt: string, cwd: string, outDir: string): string {
  return runtime.command(prompt, cwd, outDir)
}

export function commandExists(command: string): boolean {
  const result = spawnSync('bash', ['-lc', `command -v ${shQuote(command)} >/dev/null 2>&1`], {
    stdio: 'ignore',
  })
  return result.status === 0
}

export function selectedRuntimes(env: NodeJS.ProcessEnv = process.env): AgentChatRuntime[] {
  const raw = env['FULCRUM_AGENT_CHAT_RUNTIMES']
  if (!raw) return AGENT_CHAT_RUNTIMES
  const wanted = new Set(raw.split(',').map((item) => item.trim()).filter(Boolean))
  return AGENT_CHAT_RUNTIMES.filter((runtime) => wanted.has(runtime.id))
}

export function prepareFixture(cwd: string): void {
  const fixtureDir = path.join(cwd, 'sandbox-agent-fixture')
  mkdirSync(fixtureDir, { recursive: true })
  writeFileSync(path.join(fixtureDir, 'agent-task.sh'), buildFixtureScript(), { mode: 0o755 })
}

export function runAgentChat(runtime: AgentChatRuntime, cwd: string, reportRoot: string): AgentChatResult {
  const outDir = path.join(reportRoot, 'agent-chat', runtime.id)
  mkdirSync(outDir, { recursive: true })
  const authAuditPath = writeAuthAudit(runtime.id, outDir)

  if (!commandExists(runtime.binary)) {
    return {
      agent: runtime.id,
      status: 'skip',
      command: undefined,
      exitCode: null,
      signal: null,
      durationMs: 0,
      reason: `missing binary: ${runtime.binary}`,
      promptPath: undefined,
      transcriptPath: undefined,
      validationPath: undefined,
      authAuditPath,
    }
  }

  const prompt = buildAgentPrompt(runtime.id)
  const promptPath = path.join(outDir, 'prompt.txt')
  const transcriptPath = path.join(outDir, 'transcript.txt')
  const validationPath = path.join(outDir, 'validation.json')
  const command = buildAgentCommand(runtime, prompt, cwd, outDir)
  writeFileSync(promptPath, prompt)

  const started = Date.now()
  const result = spawnSync(command, {
    cwd,
    env: process.env,
    shell: '/bin/bash',
    encoding: 'utf8',
    timeout: CHAT_TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024,
  })
  const durationMs = Date.now() - started
  const transcript = [
    `$ ${command}`,
    result.stdout ?? '',
    result.stderr ?? '',
  ].join('\n')
  writeFileSync(transcriptPath, transcript)

  const validationOk = existsSync(validationPath) && JSON.parse(readFileSync(validationPath, 'utf8')).ok === true
  const sentinelOk = transcript.includes(`FULCRUM_AGENT_CHAT_DONE ${runtime.id}`)
  const exitCode = typeof result.status === 'number' ? result.status : null
  const passed = validationOk && sentinelOk
  const authFailure = passed ? undefined : agentAuthFailure(transcript)

  return {
    agent: runtime.id,
    status: passed ? 'pass' : 'fail',
    command,
    exitCode,
    signal: result.signal,
    durationMs,
    reason: passed ? passReason(exitCode, result.signal) : authFailure ?? failureReason(exitCode, result.signal, validationOk, sentinelOk),
    promptPath,
    transcriptPath,
    validationPath: existsSync(validationPath) ? validationPath : undefined,
    authAuditPath,
  }
}

function passReason(exitCode: number | null, signal: string | null): string | undefined {
  if (exitCode === 0 && !signal) return undefined
  const parts = ['validation and sentinel observed']
  if (exitCode !== 0) parts.push(`exit=${exitCode ?? 'null'}`)
  if (signal) parts.push(`signal=${signal}`)
  return parts.join(', ')
}

export function agentAuthFailure(transcript: string): string | undefined {
  const authPatterns = [
    /No authentication information found/i,
    /not authenticated/i,
    /authentication required/i,
    /authentication_error/i,
    /invalid authentication credentials/i,
    /api key .*not found/i,
    /missing .*api key/i,
    /please .*login/i,
  ]
  return authPatterns.some((pattern) => pattern.test(transcript)) ? 'auth failed after copied config' : undefined
}

function writeAuthAudit(agent: string, outDir: string): string {
  const home = process.env['HOME'] ?? ''
  const auditPath = path.join(outDir, 'auth-audit.json')
  const entries = (AUTH_AUDIT_PATHS[agent] ?? []).map((relativePath) => {
    const absolutePath = path.join(home, relativePath)
    try {
      if (!existsSync(absolutePath)) {
        return { relativePath, exists: false }
      }
      const stat = statSync(absolutePath)
      return {
        relativePath,
        exists: true,
        kind: stat.isDirectory() ? 'directory' : 'file',
        size: stat.isFile() ? stat.size : undefined,
        files: stat.isDirectory() ? collectFileSummaries(absolutePath, 0, '') : undefined,
      }
    } catch (error: unknown) {
      return { relativePath, exists: true, error: error instanceof Error ? error.message : String(error) }
    }
  })
  const envPresent = (AUTH_ENV_KEYS[agent] ?? []).filter((key) => Boolean(process.env[key]))
  writeFileSync(auditPath, JSON.stringify({
    agent,
    home,
    env_present: envPresent,
    entries,
  }, null, 2))
  return auditPath
}

function collectFileSummaries(root: string, depth: number, prefix: string): Array<{ path: string, size: number }> {
  if (depth > 3) return []
  const summaries: Array<{ path: string, size: number }> = []
  let entries
  try {
    entries = readdirSync(root, { withFileTypes: true }).slice(0, 80)
  } catch {
    return summaries
  }
  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name)
    const relativePath = path.join(prefix, entry.name)
    try {
      if (entry.isDirectory()) {
        summaries.push(...collectFileSummaries(absolutePath, depth + 1, relativePath))
      } else if (entry.isFile()) {
        const stat = statSync(absolutePath)
        summaries.push({ path: relativePath, size: stat.size })
      }
    } catch {
      continue
    }
    if (summaries.length >= 80) break
  }
  return summaries
}

function failureReason(exitCode: number | null, signal: string | null, validationOk: boolean, sentinelOk: boolean): string {
  const parts = []
  if (exitCode !== 0) parts.push(`exit=${exitCode ?? 'null'}`)
  if (signal) parts.push(`signal=${signal}`)
  if (!validationOk) parts.push('validation failed')
  if (!sentinelOk) parts.push('missing sentinel')
  return parts.join(', ')
}

export function buildMarkdownReport(report: AgentChatReport): string {
  const lines = [
    '# Agent Chat Sandbox Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Enabled: ${report.enabled ? 'yes' : 'no'}`,
    `Strict: ${report.strict ? 'yes' : 'no'}`,
    `Require Auth: ${report.requireAuth ? 'yes' : 'no'}`,
    '',
    `Total: ${report.total}`,
    `Passed: ${report.passed}`,
    `Failed: ${report.failed}`,
    `Skipped: ${report.skipped}`,
    '',
    '| Agent | Status | Exit | Reason | Validation | Auth Audit |',
    '|---|---:|---:|---|---|---|',
  ]
  for (const result of report.results) {
    lines.push(`| ${result.agent} | ${result.status} | ${result.exitCode ?? ''} | ${result.reason ?? ''} | ${result.validationPath ?? ''} | ${result.authAuditPath ?? ''} |`)
  }
  return `${lines.join('\n')}\n`
}

export function buildReviewHtml(report: AgentChatReport): string {
  const rows = report.results.map((result) => `
<article>
  <h2>${escapeHtml(result.agent)} - ${escapeHtml(result.status)}</h2>
  <p>${escapeHtml(result.reason ?? 'ok')}</p>
  <label><input type="checkbox" data-key="accepted:${escapeHtml(result.agent)}"> accepted</label>
  <textarea data-key="notes:${escapeHtml(result.agent)}" placeholder="notes"></textarea>
  <details><summary>auth audit</summary><pre>${escapeHtml(result.authAuditPath ? readFileSync(result.authAuditPath, 'utf8').slice(0, 12000) : '')}</pre></details>
  <pre>${escapeHtml(result.transcriptPath ? readFileSync(result.transcriptPath, 'utf8').slice(0, 12000) : '')}</pre>
</article>`).join('\n')

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Agent Chat Sandbox Review</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; background: #f7f7f2; color: #17201a; }
    article { border: 1px solid #bac4b8; border-radius: 8px; padding: 16px; margin: 0 0 16px; background: #fff; }
    textarea { display: block; width: 100%; min-height: 80px; margin-top: 8px; }
    pre { overflow: auto; background: #111; color: #eee; padding: 12px; border-radius: 6px; }
  </style>
</head>
<body>
  <h1>Agent Chat Sandbox Review</h1>
  ${rows}
  <script>
    for (const el of document.querySelectorAll('[data-key]')) {
      const key = el.dataset.key;
      const saved = localStorage.getItem(key);
      if (el.type === 'checkbox') el.checked = saved === 'true';
      else if (saved !== null) el.value = saved;
      el.addEventListener('input', () => {
        localStorage.setItem(key, el.type === 'checkbox' ? String(el.checked) : el.value);
      });
    }
  </script>
</body>
</html>
`
}

export async function runAgentChatMatrix(
  cwd = process.cwd(),
  reportRoot = process.env['FULCRUM_E2E_REPORT_DIR'] ?? path.resolve('sandbox-reports'),
  env = process.env,
): Promise<AgentChatReport> {
  const enabled = env['FULCRUM_SANDBOX_AGENT_CHAT'] === '1'
  const strict = env['FULCRUM_AGENT_CHAT_STRICT'] === '1'
  const requireAuth = env['FULCRUM_AGENT_CHAT_REQUIRE_AUTH'] === '1'
  const reportDir = path.join(reportRoot, 'agent-chat')
  mkdirSync(reportDir, { recursive: true })

  let results: AgentChatResult[] = []
  if (enabled) {
    prepareFixture(cwd)
    results = selectedRuntimes(env).map((runtime) => runAgentChat(runtime, cwd, reportRoot))
  } else {
    results = selectedRuntimes(env).map((runtime) => ({
      agent: runtime.id,
      status: 'skip',
      command: undefined,
      exitCode: null,
      signal: null,
      durationMs: 0,
      reason: 'FULCRUM_SANDBOX_AGENT_CHAT is not 1',
      promptPath: undefined,
      transcriptPath: undefined,
      validationPath: undefined,
      authAuditPath: undefined,
    }))
  }

  const report: AgentChatReport = {
    generatedAt: new Date().toISOString(),
    cwd,
    enabled,
    strict,
    requireAuth,
    total: results.length,
    passed: results.filter((result) => result.status === 'pass').length,
    failed: results.filter((result) => result.status === 'fail').length,
    skipped: results.filter((result) => result.status === 'skip').length,
    results,
  }

  writeFileSync(path.join(reportDir, 'agent-chat-results.json'), JSON.stringify(report, null, 2))
  writeFileSync(path.join(reportDir, 'agent-chat-report.md'), buildMarkdownReport(report))
  writeFileSync(path.join(reportDir, 'review.html'), buildReviewHtml(report))

  if (shouldFailAgentChatReport(report)) {
    process.exitCode = 1
  }
  return report
}

export function shouldFailAgentChatReport(report: AgentChatReport): boolean {
  return (report.strict && report.failed > 0)
    || (report.requireAuth && report.results.some((result) => result.status === 'fail' && result.reason === 'auth failed after copied config'))
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function asSandboxUser(command: string, cwd: string): string {
  const inner = [
    `cd ${shQuote(cwd)}`,
    'export HOME="${HOME:-/sandbox/home}"',
    'export XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"',
    'export XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"',
    'export XDG_CACHE_HOME="${XDG_CACHE_HOME:-$HOME/.cache}"',
    command,
  ].join(' && ')
  const wrapper = [
    'set -e',
    'if [ "$(id -u)" = "0" ] && command -v runuser >/dev/null 2>&1; then',
    'id -u fulcrum-agent >/dev/null 2>&1 || useradd --home-dir "${HOME:-/sandbox/home}" --no-create-home --shell /bin/bash fulcrum-agent',
    'chown -R fulcrum-agent:fulcrum-agent "${HOME:-/sandbox/home}" "${FULCRUM_DATA_DIR:-/sandbox/fulcrum-data}" "${FULCRUM_VAULT_PATH:-/sandbox/vault}" "${FULCRUM_E2E_REPORT_DIR:-sandbox-reports}" "$PWD" /tmp 2>/dev/null || true',
    `exec runuser -u fulcrum-agent -- bash -lc ${shQuote(inner)}`,
    'else',
    `exec bash -lc ${shQuote(inner)}`,
    'fi',
  ].join('\n')
  return `bash -lc ${shQuote(wrapper)}`
}

const entrypoint = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === entrypoint) {
  runAgentChatMatrix().then((report) => {
    console.log(JSON.stringify({
      total: report.total,
      passed: report.passed,
      failed: report.failed,
      skipped: report.skipped,
      strict: report.strict,
      requireAuth: report.requireAuth,
      report: path.join(process.env['FULCRUM_E2E_REPORT_DIR'] ?? path.resolve('sandbox-reports'), 'agent-chat', 'agent-chat-report.md'),
    }, null, 2))
  }).catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error))
    process.exit(1)
  })
}
