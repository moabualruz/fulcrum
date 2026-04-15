// packages/cli/src/doctor.ts
// `fulcrum doctor` — environment + configuration health check.
//
// Runs a series of checks and prints a PASS/WARN/FAIL report.
// Returns a non-zero exit code when any FAIL is found.

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { execSync } from 'child_process'
import { homedir } from 'os'

// ---------- Check result type ----------

export type CheckStatus = 'pass' | 'warn' | 'fail'

export interface CheckResult {
  name: string
  status: CheckStatus
  message: string
}

// ---------- Individual checks ----------

function checkNodeVersion(): CheckResult {
  const version = process.version
  const major = parseInt(version.slice(1).split('.')[0] ?? '0', 10)
  if (major >= 20) {
    return { name: 'Node.js version', status: 'pass', message: `${version} (≥ 20 required)` }
  }
  return { name: 'Node.js version', status: 'fail', message: `${version} — need Node.js ≥ 20` }
}

function getGlobalDataDir(): string {
  if (process.env['FULCRUM_DATA_DIR']) return process.env['FULCRUM_DATA_DIR']
  // macOS
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'fulcrum')
  // XDG
  if (process.env['XDG_DATA_HOME']) return join(process.env['XDG_DATA_HOME'], 'fulcrum')
  return join(homedir(), '.local', 'share', 'fulcrum')
}

function checkGlobalConfig(): CheckResult {
  const configPath = join(getGlobalDataDir(), 'config.json')
  if (!existsSync(configPath)) {
    return {
      name: 'Global config',
      status: 'pass',
      message: `No ${configPath} — using defaults (workspace_id derived from CWD on each run)`,
    }
  }
  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>
    const keys = Object.keys(raw).join(', ') || '(empty)'
    return { name: 'Global config', status: 'pass', message: `${configPath} — keys: ${keys}` }
  } catch {
    return { name: 'Global config', status: 'fail', message: `Cannot parse ${configPath} — invalid JSON` }
  }
}

function checkDataDir(): CheckResult {
  const dataDir = process.env['FULCRUM_DATA_DIR'] ?? join(process.env['HOME'] ?? '~', '.local', 'share', 'fulcrum')
  if (existsSync(dataDir)) {
    return { name: 'Data directory', status: 'pass', message: dataDir }
  }
  return {
    name: 'Data directory',
    status: 'warn',
    message: `${dataDir} does not exist — will be created on first use`,
  }
}

function checkSqliteBinary(): CheckResult {
  try {
    execSync('node -e "require(\'better-sqlite3\')"', { stdio: 'ignore' })
    return { name: 'better-sqlite3', status: 'pass', message: 'native module loads correctly' }
  } catch {
    return {
      name: 'better-sqlite3',
      status: 'fail',
      message: 'Cannot load better-sqlite3 — run: pnpm install',
    }
  }
}

function checkDbLiveness(): CheckResult {
  try {
    // Dynamic import to avoid top-level DB initialization on doctor runs
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { checkDbHealth } = require('@fulcrum/core') as { checkDbHealth: () => { ok: boolean; latencyMs?: number; error?: string } }
    const result = checkDbHealth()
    if (result.ok) {
      return { name: 'Database liveness', status: 'pass', message: `${result.latencyMs}ms round-trip` }
    }
    return { name: 'Database liveness', status: 'fail', message: result.error ?? 'DB check failed' }
  } catch {
    return { name: 'Database liveness', status: 'warn', message: 'Could not check DB — run a fulcrum command first to initialize' }
  }
}

function checkMcpSdk(): CheckResult {
  try {
    execSync('node -e "require(\'@modelcontextprotocol/sdk/server/mcp.js\')"', { stdio: 'ignore' })
    return { name: '@modelcontextprotocol/sdk', status: 'pass', message: 'MCP SDK loads correctly' }
  } catch {
    return {
      name: '@modelcontextprotocol/sdk',
      status: 'fail',
      message: 'Cannot load @modelcontextprotocol/sdk — run: pnpm install',
    }
  }
}

function checkEnvVars(): CheckResult {
  const relevant = ['FULCRUM_DATA_DIR', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY']
  const present = relevant.filter(k => process.env[k])
  const absent = relevant.filter(k => !process.env[k])

  if (absent.length === relevant.length) {
    return {
      name: 'Environment variables',
      status: 'warn',
      message: `None of ${relevant.join(', ')} are set — local-only mode`,
    }
  }
  if (present.length > 0) {
    return {
      name: 'Environment variables',
      status: 'pass',
      message: `Set: ${present.join(', ')}`,
    }
  }
  return { name: 'Environment variables', status: 'pass', message: 'OK' }
}

function checkAgentIntegration(cwd: string): CheckResult {
  // Look for CLAUDE.md, AGENTS.md, or GEMINI.md in project
  const markers = ['CLAUDE.md', 'AGENTS.md', 'GEMINI.md']
  const found = markers.filter(f => existsSync(join(cwd, f)))
  if (found.length === 0) {
    return {
      name: 'Agent integration files',
      status: 'warn',
      message: `No agent integration files found — copy from agent-integration/ in the fulcrum repo`,
    }
  }
  return { name: 'Agent integration files', status: 'pass', message: `Found: ${found.join(', ')}` }
}

// ---------- Runner ----------

export interface DoctorOptions {
  cwd?: string
  json?: boolean
}

export function runDoctor(options: DoctorOptions = {}): { results: CheckResult[]; exitCode: number } {
  const cwd = options.cwd ?? process.cwd()

  const results: CheckResult[] = [
    checkNodeVersion(),
    checkGlobalConfig(),
    checkDataDir(),
    checkSqliteBinary(),
    checkDbLiveness(),
    checkMcpSdk(),
    checkEnvVars(),
    checkAgentIntegration(cwd),
  ]

  const exitCode = results.some(r => r.status === 'fail') ? 1 : 0
  return { results, exitCode }
}

const STATUS_ICONS: Record<CheckStatus, string> = {
  pass: '✓',
  warn: '⚠',
  fail: '✗',
}

const STATUS_LABELS: Record<CheckStatus, string> = {
  pass: 'PASS',
  warn: 'WARN',
  fail: 'FAIL',
}

export function printDoctorResults(results: CheckResult[], json: boolean): void {
  if (json) {
    console.log(JSON.stringify(results, null, 2))
    return
  }
  const width = Math.max(...results.map(r => r.name.length))
  for (const r of results) {
    const icon = STATUS_ICONS[r.status]
    const label = STATUS_LABELS[r.status]
    const name = r.name.padEnd(width)
    console.log(`  ${icon} [${label}]  ${name}  ${r.message}`)
  }
  const fails = results.filter(r => r.status === 'fail').length
  const warns = results.filter(r => r.status === 'warn').length
  console.log(`\n  ${results.length} checks: ${results.length - fails - warns} passed, ${warns} warnings, ${fails} failed`)
}
