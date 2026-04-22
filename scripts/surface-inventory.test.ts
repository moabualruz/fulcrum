// Granular surface inventory guard.
//
// This does not prove every unit is implemented. It proves a full-pass ledger
// cannot skip whole package/plugin/extension/callable classes and still claim
// coverage. If a surface is added or removed, update this guard and the ledger
// together.

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve, relative } from 'node:path'

const REPO_ROOT = resolve(__dirname, '..')
const LEDGER = join(REPO_ROOT, 'docs/reference/2026-04-21-sixth-pass-granular-surface-ledger.md')
const UNIT_LEDGER = join(REPO_ROOT, 'docs/reference/2026-04-21-sixth-pass-unit-acceptance-ledger.json')

const EXPECTED_PROJECTS = [
  'package.json',
  'agent-integration/opencode/package.json',
  'agent-integration/pi/cockpit/package.json',
  'packages/agent-fanout/package.json',
  'packages/cli/package.json',
  'packages/core/package.json',
  'packages/fulcrum-mcp/package.json',
  'packages/memory/package.json',
  'packages/monitor/package.json',
  'packages/planning/package.json',
  'packages/policy/package.json',
  'packages/sync/package.json',
  'packages/teams/package.json',
  'packages/worker/package.json',
  'packages/workflows/package.json',
  'packages/worktrees/package.json',
  'scripts/package.json',
]

const EXPECTED_HOSTS = [
  'agent-integration/claude',
  'agent-integration/codex',
  'agent-integration/gemini',
  'agent-integration/opencode',
  'agent-integration/pi',
  'agent-integration/qwen',
  'agent-integration/copilot',
  'agent-integration/cursor',
  'agent-integration/windsurf',
]

const EXPECTED_PUBLIC_ENTRYPOINTS = [
  'packages/agent-fanout/src/index.ts',
  'packages/cli/src/index.ts',
  'packages/core/src/index.ts',
  'packages/fulcrum-mcp/src/index.ts',
  'packages/memory/src/index.ts',
  'packages/monitor/src/index.ts',
  'packages/planning/src/index.ts',
  'packages/policy/src/index.ts',
  'packages/sync/src/index.ts',
  'packages/teams/src/index.ts',
  'packages/worker/src/index.ts',
  'packages/workflows/src/index.ts',
  'packages/worktrees/src/index.ts',
]

const EXPECTED_FANOUT_TARGETS = [
  'claude',
  'codex',
  'gemini',
  'opencode',
  'pi',
  'copilot',
  'cursor',
  'windsurf',
]

const EXPECTED_CLI_DISPATCH_TOKENS = [
  '--help',
  '--version',
  '-h',
  '-v',
  'action',
  'actions',
  'agent',
  'agents',
  'bias',
  'board',
  'daemon',
  'doctor',
  'dream',
  'epic',
  'epics',
  'hook',
  'init',
  'install',
  'issue',
  'issues',
  'job',
  'jobs',
  'log',
  'mcp',
  'memory',
  'pi',
  'plugin',
  'plugins',
  'projects',
  'queue',
  'serve',
  'skill',
  'skills',
  'sync',
  'task',
  'tasks',
  'team',
  'teams',
  'tool',
  'tools',
  'tui',
  'version',
  'workflow',
  'workflows',
  'workspaces',
]

const EXPECTED_HOST_ARTIFACT_FILES = [
  'agent-integration/claude/.claude-plugin/plugin.json',
  'agent-integration/claude/.mcp.json',
  'agent-integration/claude/CLAUDE.md',
  'agent-integration/claude/hooks/hooks.json',
  'agent-integration/claude/settings-hooks-snippet.json',
  'agent-integration/codex/AGENTS.md',
  'agent-integration/codex/config.toml',
  'agent-integration/codex/hooks.json',
  'agent-integration/codex/marketplace.json',
  'agent-integration/codex/plugin/.mcp.json',
  'agent-integration/copilot/.github/copilot-instructions.md',
  'agent-integration/copilot/.mcp.json',
  'agent-integration/copilot/.vscode/mcp.json',
  'agent-integration/copilot/AGENTS.md',
  'agent-integration/cursor/.cursor/hooks.json',
  'agent-integration/cursor/.cursor/mcp.json',
  'agent-integration/cursor/.cursor/rules/fulcrum-core.mdc',
  'agent-integration/cursor/mcp.json',
  'agent-integration/cursor/rules/fulcrum.mdc',
  'agent-integration/gemini/GEMINI.md',
  'agent-integration/gemini/gemini-extension.json',
  'agent-integration/gemini/hooks/hooks.json',
  'agent-integration/gemini/policies/fulcrum-sensitive.toml',
  'agent-integration/gemini/policies/fulcrum-subagent-boundaries.toml',
  'agent-integration/opencode/opencode.jsonc',
  'agent-integration/opencode/opencode.md',
  'agent-integration/opencode/package.json',
  'agent-integration/opencode/plugins/fulcrum.ts',
  'agent-integration/opencode/plugins/rider.ts',
  'agent-integration/pi/PI.md',
  'agent-integration/pi/fulcrum.d.ts',
  'agent-integration/pi/cockpit/index.ts',
  'agent-integration/pi/cockpit/package.json',
  'agent-integration/qwen/QWEN.md',
  'agent-integration/qwen/hooks/hooks.json',
  'agent-integration/qwen/qwen-extension.json',
  'agent-integration/windsurf/.windsurf/hooks.json',
  'agent-integration/windsurf/.windsurf/mcp.json',
  'agent-integration/windsurf/.windsurf/rules/fulcrum-core.md',
  'agent-integration/windsurf/mcp.json',
  'agent-integration/windsurf/rules/fulcrum.mdc',
]

const EXPECTED_MCP_TOOLS = [
  'list_tasks',
  'create_task',
  'update_task',
  'recall_memory',
  'recall_knowledge',
  'get_memory_sources',
  'get_rag_rebuild_plan',
  'get_rag_rebuild_dry_run',
  'start_rag_rebuild',
  'get_runtime_profile_paths',
  'get_rag_rebuild_report',
  'start_embedding_job',
  'get_embedding_job_status',
  'get_embedding_job_logs',
  'cancel_embedding_job',
  'resume_embedding_job',
  'retry_embedding_job_failed',
  'inspect_memory',
  'read_raw_source',
  'trace_claim',
  'consolidate_memory',
  'lint_memory',
  'mark_memory_wrong',
  'write_memory',
  'list_agent_profiles',
  'get_agent_run_status',
  'start_agent_run',
  'heartbeat_agent_run',
  'complete_agent_run',
  'block_agent_run',
  'sweep_stale_runs',
  'build_cos_context',
  'get_workspace_status',
  'create_team_template',
  'invoke_team',
  'list_team_templates',
  'list_team_instances',
  'create_agent_profile',
  'create_agent_definition',
  'get_agent_definition',
  'update_agent_definition',
  'list_agent_definitions',
  'get_current_context',
]

const EXPECTED_REGISTRY_TOOLS = [
  'get_task',
  ...EXPECTED_MCP_TOOLS.slice(0, 3),
  'get_memory_sources',
  'inspect_memory',
  'read_raw_source',
  'trace_claim',
  'consolidate_memory',
  'lint_memory',
  'mark_memory_wrong',
  'recall_knowledge',
  'recall_memory',
  'write_memory',
  'code_context',
  'project_context',
  'query_memory',
  'search_code',
  'get_rag_rebuild_plan',
  'get_rag_rebuild_dry_run',
  'start_rag_rebuild',
  'get_runtime_profile_paths',
  'get_rag_rebuild_report',
  'start_embedding_job',
  'get_embedding_job_status',
  'get_embedding_job_logs',
  'cancel_embedding_job',
  'resume_embedding_job',
  'retry_embedding_job_failed',
  'list_agent_profiles',
  'create_agent_profile',
  'get_agent_run_status',
  'start_agent_run',
  'heartbeat_agent_run',
  'complete_agent_run',
  'block_agent_run',
  'sweep_stale_runs',
  'build_cos_context',
  'get_workspace_status',
  'get_current_context',
  'create_team_template',
  'invoke_team',
  'list_team_templates',
  'list_team_instances',
  'create_agent_definition',
  'get_agent_definition',
  'update_agent_definition',
  'list_activations',
  'list_agent_definitions',
  'graph_consistency_check',
]

const EXPECTED_MONITOR_ROUTES = [
  'GET /',
  'GET /status',
  'GET /content-index',
  'GET /metrics',
  'GET /burndown',
  'GET /events/stream',
  'GET /board',
  'GET /agents',
  'GET /workspaces',
  'GET /agents/:id',
  'GET /merge-queue',
  'GET /review-queue',
  'GET /artifacts',
  'GET /memory-trace',
  'GET /analytics/summary',
  'GET /pm/overview',
  'GET /policy/events',
  'GET /sync/state',
  'GET /teams',
  'GET /analytics/per-role',
  'GET /analytics/memory',
  'GET /memory/stats',
  'GET /replay/:run_id',
  'GET /analytics/forecast',
  'GET /tasks',
  'POST /tasks',
  'PATCH /tasks/:id',
  'POST /runs',
  'POST /runs/:id/heartbeat',
  'POST /runs/:id/complete',
  'POST /runs/:id/block',
  'POST /runs/:id/unblock',
  'POST /runs/:id/kill',
  'POST /reviews/:id/approve',
  'POST /reviews/:id/reject',
  'POST /memory/recall',
  'POST /memory/write',
  'POST /cos-context',
  'POST /policy/check',
  'GET /.well-known/agent.json',
]

const EXPECTED_INSTALL_FUNCTIONS = [
  'installCliBin',
  'installClaudePluginNative',
  'installClaudeMcp',
  'installClaudeHook',
  'installClaudeContext',
  'installClaudeSkills',
  'installClaudeAgentMds',
  'installClaudeCommands',
  'installGeminiExtension',
  'installQwenExtension',
  'installPiCockpit',
  'installCodexGlobal',
  'installOpencodeGlobal',
  'installCursor',
  'installCodex',
  'installOpencode',
  'installWindsurf',
  'installCopilot',
]

const EXPECTED_WORKFLOW_STEPS = [
  'prompt_user',
  'read_memory',
  'write_memory',
  'spawn_agent',
  'create_task',
  'create_issue',
  'create_epic',
  'write_artifact',
  'read_artifact',
  'evaluate_policy',
  'search_web',
  'search_code',
  'run_tool',
  'wait_for_task',
  'wait_for_review',
  'wait_for_artifact',
  'branch',
  'loop',
  'parallel',
  'complete',
  'halt',
  'escalate',
  'invoke_team',
  'run_script',
  'call_mcp_tool',
  'read_project',
  'review_artifact',
  'validate_schema',
  'gate',
]

const EXPECTED_OPENCODE_TOOLS = [
  'fulcrum_workspace_status',
  'fulcrum_list_tasks',
  'fulcrum_create_task',
  'fulcrum_recall_memory',
  'fulcrum_write_memory',
  'fulcrum_start_run',
  'fulcrum_heartbeat',
  'fulcrum_complete_run',
  'fulcrum_block_run',
  'fulcrum_build_cos_context',
]

const EXPECTED_PI_TOOLS = [
  'fulcrum_list_tasks',
  'fulcrum_create_task',
  'fulcrum_update_task',
  'fulcrum_recall_memory',
  'fulcrum_write_memory',
  'fulcrum_start_run',
  'fulcrum_heartbeat',
  'fulcrum_complete_run',
  'fulcrum_block_run',
  'fulcrum_workspace_status',
  'fulcrum_build_cos_context',
]

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue
    const p = join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

function sorted<T>(v: Iterable<T>): T[] {
  return [...v].sort()
}

function extractMcpTools(): string[] {
  const raw = readFileSync(join(REPO_ROOT, 'packages/cli/src/mcp-tools.ts'), 'utf8')
  return [...raw.matchAll(/name: '([a-z0-9_]+)'/g)].map((m) => m[1]!)
}

function extractCliDispatchTokens(): string[] {
  const raw = readFileSync(join(REPO_ROOT, 'packages/cli/src/index.ts'), 'utf8')
  const tokens = new Set<string>()
  for (const m of raw.matchAll(/group === '([^']+)'/g)) tokens.add(m[1]!)
  return sorted(tokens)
}

function extractFanoutTargets(): string[] {
  const raw = readFileSync(join(REPO_ROOT, 'packages/agent-fanout/src/types.ts'), 'utf8')
  const block = raw.match(/export const ALL_TARGETS[\s\S]*?\] as const/)
  expect(block).not.toBeNull()
  return [...block![0]!.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]!)
}

function extractRegistryTools(): string[] {
  const raw = readFileSync(join(REPO_ROOT, 'packages/cli/src/tool-registry.ts'), 'utf8')
  return [...raw.matchAll(/TOOL_REGISTRY\.set\('([a-z0-9_]+)'/g)].map((m) => m[1]!)
}

function extractMonitorRoutes(): string[] {
  const raw = readFileSync(join(REPO_ROOT, 'packages/monitor/src/server.ts'), 'utf8')
  return [...raw.matchAll(/app\.(get|post|patch|put|delete)\('([^']+)'/g)]
    .map((m) => `${m[1]!.toUpperCase()} ${m[2]!}`)
}

function extractMonitorGuideRoutes(): string[] {
  const raw = readFileSync(join(REPO_ROOT, 'docs/guides/monitor.md'), 'utf8')
  return [...raw.matchAll(/\| `([A-Z]+)` \| `([^`]+)` \|/g)]
    .map((m) => `${m[1]!} ${m[2]!}`)
}

function normalizeRoutePath(routePath: string): string {
  return routePath
    .replace(/\?.*$/, '')
    .replace(/\$\{[^}]+\}/g, ':id')
}

function extractPiMonitorCalls(): string[] {
  const raw = readFileSync(join(REPO_ROOT, 'agent-integration/pi/cockpit/index.ts'), 'utf8')
  const methodMap: Record<string, string> = { Get: 'GET', Post: 'POST', Patch: 'PATCH' }
  const calls = [...raw.matchAll(/api(Get|Post|Patch)(?:<[^>]+>)?\(\s*baseUrl,\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/gs)]
    .map((m) => `${methodMap[m[1]!]!} ${normalizeRoutePath(m[2] ?? m[3] ?? m[4] ?? '')}`)
  return sorted(new Set(calls))
}

function extractInstallFunctions(): string[] {
  const raw = readFileSync(join(REPO_ROOT, 'agent-integration/install.ts'), 'utf8')
  return [...raw.matchAll(/(?:export\s+)?(?:async\s+)?function\s+(install[A-Z][A-Za-z0-9_]*)/g)]
    .map((m) => m[1]!)
}

function extractWorkflowSteps(): string[] {
  const raw = readFileSync(join(REPO_ROOT, 'packages/workflows/src/types.ts'), 'utf8')
  const block = raw.match(/export type WorkflowStepType =([\s\S]*?)\n\nexport interface RetryPolicy/)
  expect(block).not.toBeNull()
  return [...block![1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!)
}

function extractOpencodeTools(): string[] {
  const raw = readFileSync(join(REPO_ROOT, 'agent-integration/opencode/plugins/fulcrum.ts'), 'utf8')
  return [...raw.matchAll(/\b(fulcrum_[a-z_]+): tool\(/g)].map((m) => m[1]!)
}

function extractPiTools(): string[] {
  const raw = readFileSync(join(REPO_ROOT, 'agent-integration/pi/cockpit/index.ts'), 'utf8')
  return [...raw.matchAll(/name: "([^"]+)"/g)].map((m) => m[1]!).filter((name) => name.startsWith('fulcrum_'))
}

function packageCodeFiles(): string[] {
  return sorted(
    walk(join(REPO_ROOT, 'packages'))
      .map((p) => relative(REPO_ROOT, p).replaceAll('\\', '/'))
      .filter((p) => /\.(ts|tsx)$/.test(p))
      .filter((p) => !p.includes('/dist/')),
  )
}

function packageProductionSourceFiles(): string[] {
  return packageCodeFiles()
    .filter((p) => p.includes('/src/'))
    .filter((p) => !p.includes('/tests/'))
    .filter((p) => !p.endsWith('.test.ts'))
}

function packageTestFiles(): string[] {
  return packageCodeFiles()
    .filter((p) => p.includes('/tests/') || p.endsWith('.test.ts'))
}

function packageConfigFiles(): string[] {
  return sorted(
    walk(join(REPO_ROOT, 'packages'))
      .map((p) => relative(REPO_ROOT, p).replaceAll('\\', '/'))
      .filter((p) => /\/(?:tsconfig|vitest\.config|tsup\.config)\.json$/.test(p) || /\/(?:vitest\.config|tsup\.config)\.ts$/.test(p)),
  )
}

function packageGeneratedArtifacts(): string[] {
  return sorted(
    walk(join(REPO_ROOT, 'packages'))
      .map((p) => relative(REPO_ROOT, p).replaceAll('\\', '/'))
      .filter((p) => p.includes('/dist/')),
  )
}

function scriptSourceFiles(): string[] {
  return sorted(
    walk(join(REPO_ROOT, 'scripts'))
      .map((p) => relative(REPO_ROOT, p).replaceAll('\\', '/'))
      .filter((p) => /\.(ts|tsx|js|mjs|cjs)$/.test(p)),
  )
}

function packageManifestScriptRows(): string[] {
  const rows: string[] = []
  for (const manifest of packageManifestPaths()) {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, manifest), 'utf8')) as {
      scripts?: Record<string, unknown>
    }
    for (const scriptName of Object.keys(pkg.scripts ?? {})) rows.push(`${manifest}#${scriptName}`)
  }
  return sorted(rows)
}

function agentIntegrationFiles(): string[] {
  return sorted(
    walk(join(REPO_ROOT, 'agent-integration'))
      .map((p) => relative(REPO_ROOT, p).replaceAll('\\', '/'))
      .filter((p) => !p.includes('/node_modules/')),
  )
}

function extractHookConfigEvents(): string[] {
  const events: string[] = []
  const hookFiles = agentIntegrationFiles().filter((p) => /hooks.*\.json$/.test(p) || p.endsWith('/hooks.json'))
  for (const file of hookFiles) {
    const raw = readFileSync(join(REPO_ROOT, file), 'utf8')
    for (const m of raw.matchAll(/"([A-Za-z_][A-Za-z0-9_:-]+)"\s*:\s*\[/g)) {
      const key = m[1]!
      if (key !== 'hooks') events.push(`${file}#${key}`)
    }
  }
  return sorted(new Set(events))
}

function extractPiEvents(): string[] {
  const file = 'agent-integration/pi/cockpit/index.ts'
  const raw = readFileSync(join(REPO_ROOT, file), 'utf8')
  return sorted([...raw.matchAll(/pi\.on\(\s*["']([^"']+)["']/g)].map((m) => `${file}#${m[1]!}`))
}

function extractPiCommands(): string[] {
  const file = 'agent-integration/pi/cockpit/index.ts'
  const raw = readFileSync(join(REPO_ROOT, file), 'utf8')
  return sorted([...raw.matchAll(/pi\.registerCommand\(\s*["']([^"']+)["']/g)].map((m) => `${file}#${m[1]!}`))
}

function extractOpencodeEvents(): string[] {
  const file = 'agent-integration/opencode/plugins/fulcrum.ts'
  const raw = readFileSync(join(REPO_ROOT, file), 'utf8')
  return sorted([...raw.matchAll(/"([a-z][a-z0-9_.]+)"\s*:\s*async/g)].map((m) => `${file}#${m[1]!}`))
}

function ledgerText(): string {
  return readFileSync(LEDGER, 'utf8')
}

function unitLedgerRows(): Array<{
  id: string
  status: string
  source_paths?: string[]
  evidence?: string[]
  blocker?: string
}> {
  const raw = JSON.parse(readFileSync(UNIT_LEDGER, 'utf8')) as {
    rows?: Array<{
      id: string
      status: string
      source_paths?: string[]
      evidence?: string[]
      blocker?: string
    }>
  }
  return raw.rows ?? []
}

function expectLedgerMentions(items: string[]): void {
  const raw = ledgerText()
  for (const item of items) expect(raw, `ledger missing ${item}`).toContain(item)
}

function slug(value: string): string {
  return value
    .replace(/\\/g, '/')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function rowId(type: string, unit: string): string {
  return `${type}:${slug(unit)}`
}

function splitExportNames(rawNames: string): string[] {
  return rawNames
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^type\s+/, '').split(/\s+as\s+/).pop() ?? part)
    .map((part) => part.replace(/\/\/.*$/g, '').trim())
    .filter((part) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(part))
}

function extractPackageExports(entrypoint: string): string[] {
  const raw = readFileSync(join(REPO_ROOT, entrypoint), 'utf8')
  const names = new Set<string>()
  for (const m of raw.matchAll(/export\s+const\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)) names.add(m[1]!)
  for (const m of raw.matchAll(/export\s+(?:type\s+)?\{([\s\S]*?)\}\s+from/g)) {
    for (const name of splitExportNames(m[1]!)) names.add(name)
  }
  return sorted(names)
}

function expectedUnitRowIds(): string[] {
  const ids = new Set<string>()
  for (const project of EXPECTED_PROJECTS) ids.add(rowId('workspace_project', project))
  for (const sourceFile of packageProductionSourceFiles()) ids.add(rowId('package_source_file', sourceFile))
  for (const testFile of packageTestFiles()) ids.add(rowId('package_test_file', testFile))
  for (const configFile of packageConfigFiles()) ids.add(rowId('package_config_file', configFile))
  for (const artifact of packageGeneratedArtifacts()) ids.add(rowId('package_generated_artifact', artifact))
  for (const scriptFile of scriptSourceFiles()) ids.add(rowId('script_source_file', scriptFile))
  for (const manifestScript of packageManifestScriptRows()) ids.add(rowId('package_manifest_script', manifestScript))
  for (const entrypoint of EXPECTED_PUBLIC_ENTRYPOINTS) {
    ids.add(rowId('public_entrypoint', entrypoint))
    for (const symbol of extractPackageExports(entrypoint)) {
      ids.add(rowId('package_export', `${entrypoint}#${symbol}`))
    }
  }
  for (const token of EXPECTED_CLI_DISPATCH_TOKENS) ids.add(rowId('cli_dispatch_token', token))
  for (const target of EXPECTED_FANOUT_TARGETS) ids.add(rowId('fanout_target', target))
  for (const tool of EXPECTED_MCP_TOOLS) ids.add(rowId('mcp_tool', tool))
  for (const tool of EXPECTED_REGISTRY_TOOLS) ids.add(rowId('tool_registry_entry', tool))
  for (const route of EXPECTED_MONITOR_ROUTES) ids.add(rowId('monitor_route', route))
  for (const step of EXPECTED_WORKFLOW_STEPS) ids.add(rowId('workflow_step', step))
  for (const fn of EXPECTED_INSTALL_FUNCTIONS) ids.add(rowId('installer_function', fn))
  for (const tool of EXPECTED_OPENCODE_TOOLS) ids.add(rowId('opencode_native_tool', tool))
  for (const tool of EXPECTED_PI_TOOLS) ids.add(rowId('pi_native_tool', tool))
  for (const file of agentIntegrationFiles()) ids.add(rowId('agent_integration_artifact', file))
  for (const event of extractHookConfigEvents()) ids.add(rowId('host_hook_config_event', event))
  for (const event of extractPiEvents()) ids.add(rowId('pi_extension_event', event))
  for (const command of extractPiCommands()) ids.add(rowId('pi_extension_command', command))
  for (const event of extractOpencodeEvents()) ids.add(rowId('opencode_plugin_event', event))
  return sorted(ids)
}

function packageManifestPaths(): string[] {
  return sorted(
    walk(REPO_ROOT)
      .filter((p) => p.endsWith('package.json'))
      .map((p) => relative(REPO_ROOT, p).replaceAll('\\', '/'))
      .filter((p) => p === 'package.json' || p.startsWith('packages/') || p.startsWith('agent-integration/') || p === 'scripts/package.json'),
  )
}

describe('granular full-pass surface inventory', () => {
  it('enumerates every workspace package root', () => {
    const found = packageManifestPaths()
    expect(found).toEqual(sorted(EXPECTED_PROJECTS))
    expectLedgerMentions(EXPECTED_PROJECTS)
  })

  it('rejects PI extension manifest entries that point at missing files', () => {
    for (const manifest of packageManifestPaths()) {
      const pkg = JSON.parse(readFileSync(join(REPO_ROOT, manifest), 'utf8')) as {
        pi?: { extensions?: unknown }
      }
      const extensions = pkg.pi?.extensions
      if (extensions === undefined) continue
      expect(Array.isArray(extensions), `${manifest} pi.extensions must be an array`).toBe(true)
      for (const extensionPath of extensions as unknown[]) {
        expect(typeof extensionPath, `${manifest} pi.extensions values must be strings`).toBe('string')
        const target = resolve(dirname(join(REPO_ROOT, manifest)), extensionPath as string)
        expect(existsSync(target), `${manifest} pi.extensions target missing: ${extensionPath}`).toBe(true)
      }
    }
  })

  it('enumerates every agent host integration root', () => {
    for (const host of EXPECTED_HOSTS) expect(existsSync(join(REPO_ROOT, host))).toBe(true)
    expectLedgerMentions(EXPECTED_HOSTS)
  })

  it('enumerates public package entrypoints without wildcard export drift', () => {
    const found = sorted(
      walk(join(REPO_ROOT, 'packages'))
        .filter((p) => p.endsWith('/src/index.ts'))
        .map((p) => relative(REPO_ROOT, p).replaceAll('\\', '/')),
    )
    expect(found).toEqual(sorted(EXPECTED_PUBLIC_ENTRYPOINTS))
    for (const entry of found) {
      expect(readFileSync(join(REPO_ROOT, entry), 'utf8'), `${entry} must not wildcard-export`).not.toMatch(/export\s+\*\s+from/)
    }
    expectLedgerMentions(EXPECTED_PUBLIC_ENTRYPOINTS)
  })

  it('enumerates CLI dispatch tokens and fanout targets', () => {
    expect(extractCliDispatchTokens()).toEqual(EXPECTED_CLI_DISPATCH_TOKENS)
    expect(extractFanoutTargets()).toEqual(EXPECTED_FANOUT_TARGETS)
    expectLedgerMentions([...EXPECTED_CLI_DISPATCH_TOKENS, ...EXPECTED_FANOUT_TARGETS])
  })

  it('enumerates host plugin and extension sentinel artifacts', () => {
    for (const file of EXPECTED_HOST_ARTIFACT_FILES) {
      expect(existsSync(join(REPO_ROOT, file)), `missing host artifact: ${file}`).toBe(true)
    }
    expectLedgerMentions(EXPECTED_HOST_ARTIFACT_FILES)
    expect(existsSync(join(REPO_ROOT, 'agent-integration/windsurf/.windsurf/mcp_config.json'))).toBe(false)
  })

  it('enumerates callable core surfaces', () => {
    expect(extractMcpTools()).toEqual(EXPECTED_MCP_TOOLS)
    expect(extractRegistryTools()).toEqual(EXPECTED_REGISTRY_TOOLS)
    expect(extractMonitorRoutes()).toEqual(EXPECTED_MONITOR_ROUTES)
    expect(extractInstallFunctions()).toEqual(EXPECTED_INSTALL_FUNCTIONS)
    expect(extractWorkflowSteps()).toEqual(EXPECTED_WORKFLOW_STEPS)
    expectLedgerMentions([
      ...EXPECTED_MCP_TOOLS,
      ...EXPECTED_REGISTRY_TOOLS,
      ...EXPECTED_MONITOR_ROUTES,
      ...EXPECTED_INSTALL_FUNCTIONS,
      ...EXPECTED_WORKFLOW_STEPS,
    ])
  })

  it('enumerates native plugin tool surfaces', () => {
    expect(extractOpencodeTools()).toEqual(EXPECTED_OPENCODE_TOOLS)
    expect(extractPiTools()).toEqual(EXPECTED_PI_TOOLS)
    expectLedgerMentions([...EXPECTED_OPENCODE_TOOLS, ...EXPECTED_PI_TOOLS])
  })

  it('keeps monitor docs and PI cockpit route consumers wired to real routes', () => {
    const monitorRoutes = new Set(extractMonitorRoutes())
    for (const route of extractMonitorGuideRoutes()) {
      expect(monitorRoutes.has(route), `docs/guides/monitor.md route missing implementation: ${route}`).toBe(true)
    }
    for (const route of extractPiMonitorCalls()) {
      expect(monitorRoutes.has(route), `PI cockpit route call missing monitor implementation: ${route}`).toBe(true)
    }
  })

  it('keeps host integration docs aligned with shipped hook/config surfaces', () => {
    const cursorRule = readFileSync(join(REPO_ROOT, 'agent-integration/cursor/.cursor/rules/fulcrum-core.mdc'), 'utf8')
    const legacyCursorRule = readFileSync(join(REPO_ROOT, 'agent-integration/cursor/rules/fulcrum.mdc'), 'utf8')
    const legacyWindsurfRule = readFileSync(join(REPO_ROOT, 'agent-integration/windsurf/rules/fulcrum.mdc'), 'utf8')
    const mcpToolsGuide = readFileSync(join(REPO_ROOT, 'docs/guides/mcp-tools.md'), 'utf8')
    const installGuide = readFileSync(join(REPO_ROOT, 'docs/guides/installation.md'), 'utf8')
    const pluginsGuide = readFileSync(join(REPO_ROOT, 'docs/guides/plugins-and-extensions.md'), 'utf8')

    for (const doc of [cursorRule, legacyCursorRule, legacyWindsurfRule, mcpToolsGuide]) {
      expect(doc).not.toMatch(/Hook-based features .*not available in Cursor\/Windsurf/)
      expect(doc).not.toMatch(/Without hooks \(PI, Gemini, Codex, CI\)/)
    }

    expect(installGuide).toContain('.cursor/hooks.json')
    expect(installGuide).toContain('.windsurf/hooks.json')
    expect(installGuide).toContain('.windsurf/mcp.json')
    expect(installGuide).toContain('.codex/config.toml')
    expect(installGuide).toContain('.opencode/opencode.jsonc')
    expect(pluginsGuide).toContain('project rules + hooks + MCP config')
  })

  it('requires explicit status rows for every discovered package/plugin/callable unit', () => {
    const rows = unitLedgerRows()
    const ids = rows.map((row) => row.id)
    expect(new Set(ids).size, 'unit ledger has duplicate row ids').toBe(ids.length)

    const allowedStatuses = new Set([
      'accepted',
      'code-gap',
      'test-gap',
      'doc-stale',
      'integration-gap',
      'runtime-unverified',
      'blocked-external',
      'blocked-decision',
      'descoped-user',
    ])
    for (const row of rows) {
      expect(allowedStatuses.has(row.status), `invalid status for ${row.id}: ${row.status}`).toBe(true)
      for (const p of row.source_paths ?? []) {
        expect(existsSync(join(REPO_ROOT, p)), `${row.id} source path missing: ${p}`).toBe(true)
      }
    }

    const actual = new Set(ids)
    for (const id of expectedUnitRowIds()) {
      expect(actual.has(id), `unit ledger missing explicit row: ${id}`).toBe(true)
    }
  })

  it('requires every unit ledger row to be terminal before the full pass can close', () => {
    const rows = unitLedgerRows()
    const terminalStatuses = new Set([
      'accepted',
      'blocked-external',
      'blocked-decision',
      'descoped-user',
    ])

    for (const row of rows) {
      expect(terminalStatuses.has(row.status), `open unit ledger row: ${row.id} status=${row.status}`).toBe(true)
      if (row.status === 'accepted') {
        expect(row.evidence?.length ?? 0, `accepted row lacks evidence: ${row.id}`).toBeGreaterThan(0)
      } else {
        expect(row.blocker?.length ?? 0, `blocked/descoped row lacks blocker: ${row.id}`).toBeGreaterThan(0)
      }
    }
  })
})
