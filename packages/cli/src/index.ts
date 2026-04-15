#!/usr/bin/env tsx
// packages/cli/src/index.ts — fulcrum CLI entry point

import { runMemoryInit } from '@fulcrum/memory'
import { activateL2 } from '@fulcrum/memory'
import { runDoctor, printDoctorResults } from './doctor.js'
import { globalDataDir } from '@fulcrum/core'
import { discoverPlugins, registerPlugins } from './plugin-discovery.js'

const [, , ...args] = process.argv
const [group, command] = args

function usage(): never {
  console.log(`
fulcrum — local-first agent control plane

USAGE
  fulcrum <group> <command> [options]

CONTROL PLANE
  memory init          Initialize L0 vault + L1 SQLite (+ optional L2)
  memory accelerate    Enable L2 (Kuzu graph + HNSW vector search)
  memory rebuild       Rebuild L1 from L0 vault files
  memory status        Show vault path and layer status

  serve mcp            Start MCP server (stdio JSON-RPC 2.0) — 13 control tools
  serve monitor        Start HTTP monitor + control API (default port 4721)
  serve all            Start both MCP and monitor servers

  hook claude          PreToolUse hook for Claude Code (stdin → policy check)
  hook gemini          BeforeTool hook for Gemini CLI
  hook pi              BeforeTool hook for PI coding agent

DOMAIN
  workspaces list
  workspaces create --name <name> [--id <id>]

  projects list [--workspace-id <id>]
  projects create --name <name> --workspace-id <id> [--type <type>] [--id <id>]

  task list [--workspace-id <id>] [--project-id <id>] [--status <status>] [--limit <n>]
  task get --id <task_id>
  task create --title <title> [--workspace-id <id>] [--project-id <id>] [--description <d>]
  task update --id <task_id> [--status <s>] [--note <n>] [--assigned-to <role>]

  issue list [--workspace-id <id>] [--project-id <id>]
  issue create --title <title> [--workspace-id <id>] [--project-id <id>] [--description <d>]
  issue get --id <issue_id>
  issue update --id <issue_id> [--status <s>]

  epic list [--workspace-id <id>] [--project-id <id>]
  epic create --title <title> [--workspace-id <id>] [--project-id <id>]
  epic get --id <epic_id>

  board show [--workspace-id <id>] [--project-id <id>]
  queue merge list [--workspace-id <id>]
  queue merge process --workspace-id <id> --actor-role integration_worker
  queue review list [--workspace-id <id>]

  sync status [--workspace-id <id>]
  sync push [--workspace-id <id>]
  sync pull [--workspace-id <id>]

TEAMS + WORKFLOWS + AGENTS
  team list [--workspace-id <id>]
  team create --name <name> [--workspace-id <id>]
  team invoke --template-id <id> --workspace-id <id> --caller-role <role> --goal <g>
  team instances [--workspace-id <id>]

  workflow list [--workspace-id <id>]
  workflow start --workflow-name <n> [--workspace-id <id>] [--project-id <id>]
  workflow run --wf-id <id>
  workflow status --wf-id <id>
  workflow resume --wf-id <id> [--step-id <s>]

  agent list [--workspace-id <id>]
  agent status --run-id <id>
  agent spawn --target-role <role> --caller-role <role> --task-id <id> [--adapter <name>]

OPTIONS
  --version, -v        Print the fulcrum version and exit
  --help, -h           Show this help (or <group> --help for group help)
  --json               Output as JSON (for list/get subcommands)
  --vault <path>       Override vault path (default: $FULCRUM_DATA_DIR/vault)
  --port <n>           Override monitor port (default: 4721)

PLUGINS
  plugin list                         List discovered plugins (project + global)
  plugin install <package>            Install plugin from npm registry
  plugin link <path>                  Link a local plugin directory (dev mode)
  plugin remove <package>             Remove a globally-installed plugin

SKILLS
  skills install                      Install bundled skills to ~/.claude/skills/ (Claude Code auto-loads)
  skills install --project            Install to .claude/skills/ (project scope)
  skills list                         List available skills

DIAGNOSTICS
  doctor              Run environment + configuration health checks
  doctor --json       Output checks as JSON

EXAMPLES
  fulcrum memory init
  fulcrum doctor
  fulcrum serve all
  fulcrum task list --json
  fulcrum workflow start --workflow-name implement_feature --workspace-id ws_1
  fulcrum agent spawn --target-role software_engineer --caller-role chief_of_staff --task-id task_123
  fulcrum queue merge process --workspace-id ws_1 --actor-role integration_worker

AUTO-INITIALIZATION
  Every fulcrum command auto-initializes $CWD as a Fulcrum project on first run
  (opens the single global DB at $FULCRUM_DATA_DIR or ~/.local/share/fulcrum/,
  creates a workspace + project with deterministic IDs derived from $CWD).
  No explicit init step required. Nothing is written to your project directory.

GLOBAL INSTALL
  From the repo root: pnpm install && pnpm run setup
  Installs: ~/.local/bin/fulcrum symlink, Claude user-scope MCP server,
  Gemini extension, PI cockpit, and PreToolUse hooks.

DOCS
  README.md               Full user guide
  docs/guides/            Workflow authoring, worker adapters, telemetry
  AGENTS.md               Invariants for contributors (and AI agents)
`)
  process.exit(0)
}

// ── CLI output + arg helpers (J-6) ────────────────────────────────────────────

/**
 * Print rows either as JSON (when --json is in argv) or as a simple
 * tab-separated table. Works with arbitrary record shapes; caller may
 * optionally supply a fixed column order.
 */
export function outputRows<T extends Record<string, unknown>>(
  rows: T[],
  columns?: Array<keyof T>,
): void {
  if (args.includes('--json')) {
    console.log(JSON.stringify(rows, null, 2))
    return
  }
  if (rows.length === 0) {
    console.log('(no rows)')
    return
  }
  const first = rows[0]
  if (!first) {
    console.log('(no rows)')
    return
  }
  const cols = columns ?? (Object.keys(first) as Array<keyof T>)
  console.log(cols.map(c => String(c)).join('\t'))
  for (const row of rows) {
    console.log(
      cols.map(c => {
        const v = row[c]
        if (v === null || v === undefined) return ''
        if (typeof v === 'object') return JSON.stringify(v)
        return String(v)
      }).join('\t'),
    )
  }
}

export function outputObject(obj: Record<string, unknown>): void {
  if (args.includes('--json')) {
    console.log(JSON.stringify(obj, null, 2))
    return
  }
  for (const [k, v] of Object.entries(obj)) {
    const val =
      v === null || v === undefined ? '' :
      typeof v === 'object' ? JSON.stringify(v) :
      String(v)
    console.log(`${k}: ${val}`)
  }
}

export function requireArg(flag: string): string {
  const idx = args.indexOf(flag)
  if (idx < 0 || !args[idx + 1]) {
    console.error(`${flag} is required`)
    process.exit(1)
  }
  return args[idx + 1] as string
}

export function optArg(flag: string): string | undefined {
  const idx = args.indexOf(flag)
  return idx >= 0 ? args[idx + 1] : undefined
}

function optIntArg(flag: string): number | undefined {
  const v = optArg(flag)
  if (v === undefined) return undefined
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : undefined
}

function featureNotImplemented(feature: string): never {
  console.error(`feature not yet implemented: ${feature}`)
  process.exit(1)
}

// ── Memory commands ──────────────────────────────────────────────────────────

async function runMemory(): Promise<void> {
  if (!command || command === '--help' || command === '-h') {
    console.log(`
fulcrum memory — memory vault commands

  init          Initialize vault (L0 + L1), optionally enable L2
  accelerate    Enable L2 graph + vector search on existing vault
  rebuild       Rebuild L1 SQLite from L0 vault files
  status        Show vault info
`)
    process.exit(0)
  }

  if (command === 'init') {
    await runMemoryInit()
    return
  }

  if (command === 'accelerate') {
    console.log('Activating L2 (Kuzu graph + HNSW vector search)...')
    try {
      const result = await activateL2()
      console.log(`✓ L2 active — indexed ${result.l2Count} memories`)
      if (result.errors.length > 0) {
        console.log(`⚠ ${result.errors.length} errors during indexing:`)
        for (const e of result.errors.slice(0, 10)) {
          console.log(`  - ${e}`)
        }
      }
    } catch (err) {
      console.error(`✗ ${(err as Error).message}`)
      process.exit(1)
    }
    return
  }

  if (command === 'rebuild') {
    const { rebuildFromVault } = await import('@fulcrum/memory')
    const { getVaultPath } = await import('@fulcrum/memory')
    const vaultPath = process.env['FULCRUM_VAULT_PATH'] ?? getVaultPath()
    const targetArg = args.find(a => a === '--l1' || a === '--l2' || a === '--both')
    const target = targetArg === '--l2' ? 'l2' : targetArg === '--both' ? 'both' : 'l1'
    console.log(`Rebuilding ${target.toUpperCase()} from vault at ${vaultPath}...`)
    const result = await rebuildFromVault({ vaultPath, target })
    console.log(`✓ L1: ${result.l1Count} memories, L2: ${result.l2Count} memories`)
    if (result.errors.length > 0) {
      console.log(`⚠ ${result.errors.length} errors`)
      for (const e of result.errors.slice(0, 10)) console.log(`  - ${e}`)
    }
    return
  }

  if (command === 'status') {
    const { getVaultPath, vaultExists } = await import('@fulcrum/memory')
    const { readState } = await import('@fulcrum/memory')
    const vaultPath = process.env['FULCRUM_VAULT_PATH'] ?? getVaultPath()
    const exists = vaultExists(vaultPath)
    console.log(`\nFulcrum Memory Status`)
    console.log(`─────────────────────`)
    console.log(`Vault path : ${vaultPath}`)
    console.log(`L0 vault   : ${exists ? '✓ initialized' : '✗ not found — run: fulcrum memory init'}`)
    if (exists) {
      const state = readState(vaultPath)
      const count = Object.keys(state).length
      console.log(`L0 entries : ${count} memories tracked in .state.json`)
      console.log(`L1 SQLite  : ready (FTS5 full-text search)`)
      const kuzuPath = globalDataDir() + '/kuzu'
      const { existsSync } = await import('fs')
      console.log(`L2 Kuzu    : ${existsSync(kuzuPath) ? '✓ initialized' : '○ not enabled — run: fulcrum memory accelerate'}`)
    }
    console.log('')
    return
  }

  console.error(`Unknown memory command: ${command}`)
  console.error('Run `fulcrum memory --help` for available commands.')
  process.exit(1)
}

// ── Hook commands ─────────────────────────────────────────────────────────────
// Types and pre/post handlers live in hooks.ts; re-exported here for backward
// compatibility (tests import these from index.ts via the public barrel).

export type { HookCli, NormalizedHookEvent, HookPhase, HookContext, HookOutput, HookIO } from './hooks.js'
export { normalizeHookEvent, runPreHook, runPostHook } from './hooks.js'

// ── Session lifecycle hooks ───────────────────────────────────────────────────
// These are called by Claude Code's SessionStart / Stop hooks (not PreToolUse).
// They establish the run_id for the session and complete it on stop.

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'

// globalDataDir is imported from @fulcrum/core (single canonical implementation)

function getSessionFilePath(sessionId: string): string {
  const dir = join(globalDataDir(), 'sessions')
  mkdirSync(dir, { recursive: true })
  return join(dir, `${sessionId}.json`)
}

/**
 * SessionStart hook: auto-start an agent run and stash the run_id.
 * Claude Code calls this once when a new session opens.
 * Stdin: JSON with { session_id, cwd, model? }
 */
export async function runSessionStartHook(): Promise<void> {
  const chunks: Buffer[] = []
  process.stdin.on('data', (c: Buffer) => chunks.push(c))
  await new Promise<void>(r => process.stdin.on('end', r))
  const raw = Buffer.concat(chunks).toString('utf-8').trim()

  let sessionId = process.env['CLAUDE_SESSION_ID'] ?? ''
  let model: string | undefined

  if (raw) {
    try {
      const evt = JSON.parse(raw) as Record<string, unknown>
      sessionId = (evt['session_id'] as string) || sessionId || `sess_${Date.now()}`
      model = evt['model'] as string | undefined
    } catch { /* use env fallback */ }
  }

  if (!sessionId) sessionId = `sess_${Date.now()}`

  try {
    const { startAgentRun, getDb, runMigrations, loadConfig } = await import('@fulcrum/core')
    const config = loadConfig()
    const db = getDb()
    runMigrations(db)

    const wsId = config.workspace_id ?? 'default'
    const projId = config.project_id ?? wsId

    // Auto-ensure workspace + project exist
    const now = new Date().toISOString()
    db.prepare('INSERT OR IGNORE INTO workspaces (workspace_id, name, status, created_at) VALUES (?, ?, ?, ?)')
      .run(wsId, wsId, 'active', now)
    db.prepare('INSERT OR IGNORE INTO projects (project_id, workspace_id, name, created_at) VALUES (?, ?, ?, ?)')
      .run(projId, wsId, projId, now)

    const run = await startAgentRun({
      role: 'software_engineer',
      workspace_id: wsId,
      agent_id: `claude/${sessionId.slice(0, 12)}`,
      pi_profile: model ?? 'claude',
    })

    const sessionFile = getSessionFilePath(sessionId)
    writeFileSync(sessionFile, JSON.stringify({
      session_id: sessionId,
      run_id: run.run_id,
      workspace_id: wsId,
      project_id: projId,
      started_at: now,
    }, null, 2))

    process.stderr.write(`[fulcrum/session] run started: ${run.run_id}\n`)
  } catch (err) {
    process.stderr.write(`[fulcrum/session-start] error (non-fatal): ${(err as Error).message}\n`)
  }

  // Always exit 0 — never block the session from starting
  process.exit(0)
}

/**
 * Stop hook: mark the run as completed.
 * Claude Code calls this when the session is closing.
 * Stdin: JSON with { session_id }
 */
export async function runSessionStopHook(): Promise<void> {
  const chunks: Buffer[] = []
  process.stdin.on('data', (c: Buffer) => chunks.push(c))
  await new Promise<void>(r => process.stdin.on('end', r))
  const raw = Buffer.concat(chunks).toString('utf-8').trim()

  let sessionId = process.env['CLAUDE_SESSION_ID'] ?? ''
  if (raw) {
    try {
      const evt = JSON.parse(raw) as Record<string, unknown>
      sessionId = (evt['session_id'] as string) || sessionId
    } catch { /* use env fallback */ }
  }

  if (!sessionId) {
    process.exit(0)
    return
  }

  try {
    const sessionFile = getSessionFilePath(sessionId)
    if (!existsSync(sessionFile)) {
      process.exit(0)
      return
    }
    const session = JSON.parse(readFileSync(sessionFile, 'utf-8')) as {
      run_id: string; workspace_id: string
    }

    const { completeAgentRun, getDb, runMigrations, loadConfig } = await import('@fulcrum/core')
    const config = loadConfig()
    const db = getDb()
    runMigrations(db)
    void config // loadConfig used for side effects (db path)

    await completeAgentRun({
      run_id: session.run_id,
      output_summary: 'Claude session ended',
    })
    process.stderr.write(`[fulcrum/session] run completed: ${session.run_id}\n`)
  } catch (err) {
    process.stderr.write(`[fulcrum/session-stop] error (non-fatal): ${(err as Error).message}\n`)
  }

  process.exit(0)
}

/**
 * PreCompact hook: write a memory entry from the compaction summary.
 * Claude Code calls this before context compaction.
 * Stdin: JSON with { session_id, summary }
 */
export async function runPreCompactHook(): Promise<void> {
  const chunks: Buffer[] = []
  process.stdin.on('data', (c: Buffer) => chunks.push(c))
  await new Promise<void>(r => process.stdin.on('end', r))
  const raw = Buffer.concat(chunks).toString('utf-8').trim()

  if (!raw) { process.exit(0); return }

  let sessionId = process.env['CLAUDE_SESSION_ID'] ?? 'unknown'
  let summary = ''

  try {
    const evt = JSON.parse(raw) as Record<string, unknown>
    sessionId = (evt['session_id'] as string) || sessionId
    summary = (evt['summary'] as string) || (evt['compaction_summary'] as string) || ''
  } catch { process.exit(0); return }

  if (!summary) { process.exit(0); return }

  try {
    const { getDb, runMigrations, loadConfig } = await import('@fulcrum/core')
    const { writeMemory } = await import('@fulcrum/memory')
    const config = loadConfig()
    const db = getDb()
    runMigrations(db)
    void db

    const compactTitle = `Session compact — ${new Date().toISOString().slice(0, 10)}`
    await writeMemory({
      title: compactTitle,
      summary: compactTitle,
      content: summary,
      scope: 'project',
      kind: 'session_summary',
      workspace_id: config.workspace_id ?? 'default',
      project_id: config.project_id ?? config.workspace_id ?? 'default',
      tags: ['session-compact', `session:${sessionId.slice(0, 12)}`],
      importance: 0.7,
    } as Parameters<typeof writeMemory>[0])
    process.stderr.write(`[fulcrum/pre-compact] memory saved (${summary.length} chars)\n`)
  } catch (err) {
    process.stderr.write(`[fulcrum/pre-compact] error (non-fatal): ${(err as Error).message}\n`)
  }

  process.exit(0)
}

async function runHook(cliName: string, phase: HookPhase = 'pre'): Promise<void> {
  if (cliName === '--help' || cliName === '-h' || !cliName) {
    console.log(`
fulcrum hook — tool-call policy hooks for coding agents

  fulcrum hook claude [pre|post]           Claude Code PreToolUse / PostToolUse hook
  fulcrum hook claude session-start        Claude Code SessionStart hook
  fulcrum hook claude session-stop         Claude Code Stop hook
  fulcrum hook claude pre-compact          Claude Code PreCompact hook
  fulcrum hook gemini [pre|post]           Gemini CLI BeforeTool / AfterTool hook
  fulcrum hook pi     [pre|post]           PI coding agent BeforeTool / AfterTool hook

Phase defaults to 'pre' when omitted (legacy). The pre hook normalises
the event, scans for secrets, enforces the team-invoke policy, and
recalls relevant task memories (surfaced via stderr). The post hook
writes a tool_trace operational memory for the call.
`)
    process.exit(0)
  }

  // Migrations and workspace/project already set up by ensureProjectInitialized()
  // in main(). We just need the IDs for event logging.
  const { workspace_id } = currentProjectIds()

  // Read stdin
  const chunks: Buffer[] = []
  process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk))
  await new Promise<void>(resolve => process.stdin.on('end', resolve))
  const raw = Buffer.concat(chunks).toString('utf-8').trim()

  if (!raw) process.exit(0)

  let event: Record<string, unknown>
  try {
    event = JSON.parse(raw) as Record<string, unknown>
  } catch {
    // Can't parse hook event — fail open (allow)
    process.exit(0)
  }

  // Normalise to canonical shape based on CLI type
  const { toolName, toolInput, sessionId, agentRole, runId } = normalizeHookEvent(cliName as HookCli, event)

  // Log the tool call (best-effort) — attached to the auto-initialized workspace
  try {
    const { emitEvent } = await import('@fulcrum/core')
    emitEvent({
      workspace_id,
      evt_type: 'hook_executed',
      object_type: 'tool_call',
      object_id: runId || undefined,
      actor_type: 'agent',
      actor_id: `${cliName}/${sessionId.slice(0, 8)}${runId ? ':' + runId.slice(-8) : ''}`,
      payload: {
        tool_name: toolName,
        tool_input_keys: Object.keys(toolInput),
        session_id: sessionId,
        run_id: runId || undefined,
        phase,
      },
    })
  } catch { /* logging best-effort */ }

  const ctx: HookContext = {
    cliName: cliName as HookCli,
    phase,
    toolName,
    toolInput,
    sessionId,
    agentRole,
    runId,
    workspace_id,
  }
  const io: HookIO = {
    stdout: (msg: string) => process.stdout.write(msg + '\n'),
    stderr: (msg: string) => process.stderr.write(msg),
    exit: (code: number) => process.exit(code),
  }

  if (phase === 'pre') {
    await runPreHook(ctx, io)
  } else {
    await runPostHook(ctx, io)
  }
}

// ── Serve commands ────────────────────────────────────────────────────────────

let _embeddingWarmed = false
async function warmEmbedding(): Promise<void> {
  if (_embeddingWarmed) return
  const { initEmbedding, loadConfig } = await import('@fulcrum/core')
  try {
    const config = loadConfig()
    await initEmbedding(config)
    _embeddingWarmed = true
    process.stderr.write('[fulcrum] embedding model ready\n')
  } catch (err) {
    process.stderr.write(`[fulcrum] embedding init failed: ${(err as Error).message}\n`)
    process.exit(1)
  }
}

let _otelWarmed = false
async function warmOtel(): Promise<void> {
  if (_otelWarmed) return
  const { initOtel } = await import('@fulcrum/core')
  try {
    await initOtel()
  } catch (err) {
    process.stderr.write(`[fulcrum] otel init failed: ${(err as Error).message}\n`)
  }
  _otelWarmed = true
}

let _otelShutdownRegistered = false
function registerOtelShutdown(): void {
  if (_otelShutdownRegistered) return
  _otelShutdownRegistered = true
  const handler = async () => {
    try {
      const { shutdownOtel } = await import('@fulcrum/core')
      await shutdownOtel()
    } catch { /* best-effort */ }
    process.exit(0)
  }
  process.once('SIGINT', handler)
  process.once('SIGTERM', handler)
}

async function runServeMcp(): Promise<void> {
  const { getDb, runMigrations, loadConfig, createTask, updateTask, listTasks,
    startAgentRun, heartbeatAgentRun, completeAgentRun, blockAgentRun,
    getAgentRunStatus,
    buildCosContext, getWorkspaceStatus, listAgentProfiles,
    createAgentProfile, getTeamOps,
    createAgentDefinition, getAgentDefinition, updateAgentDefinition, listAgentDefinitions,
    startSpan, endSpan } = await import('@fulcrum/core')
  const { writeMemory, recallMemory } = await import('@fulcrum/memory')

  const config = loadConfig()
  const db = getDb()
  runMigrations(db)

  await warmEmbedding()
  await warmOtel()
  registerOtelShutdown()

  // Auto-create workspace/project from config
  function ensureWorkspace(wsId: string, name?: string) {
    const existing = db.prepare('SELECT workspace_id FROM workspaces WHERE workspace_id = ?').get(wsId)
    if (!existing) {
      const now = new Date().toISOString()
      db.prepare('INSERT OR IGNORE INTO workspaces (workspace_id, name, status, created_at) VALUES (?, ?, ?, ?)').run(wsId, name ?? wsId, 'active', now)
    }
  }

  function ensureProject(wsId: string, projId: string, name?: string) {
    const existing = db.prepare('SELECT project_id FROM projects WHERE project_id = ?').get(projId)
    if (!existing) {
      const now = new Date().toISOString()
      db.prepare('INSERT OR IGNORE INTO projects (project_id, workspace_id, name, created_at) VALUES (?, ?, ?, ?)').run(projId, wsId, name ?? projId, now)
    }
  }

  type ToolArgs = Record<string, unknown>

  async function handleToolCall(name: string, toolArgs: ToolArgs): Promise<unknown> {
    const a = toolArgs

    if (name === 'list_tasks') {
      const tasks = await listTasks({
        workspace_id: a['workspace_id'] as string,
        project_id: a['project_id'] as string | undefined,
        status: a['status'] as Parameters<typeof listTasks>[0]['status'],
      })
      const limited = tasks.slice(0, (a['limit'] as number | undefined) ?? 40)
      return limited.map(t => ({
        task_id: t.task_id,
        title: t.title,
        description: t.description ?? '',
        status: t.status,
        priority: t.priority,
        assigned_to: t.assigned_to ?? '',
        done_criteria: t.done_criteria ?? '',
        blockers: t.blockers,
      }))
    }

    if (name === 'create_task') {
      ensureWorkspace(a['workspace_id'] as string)
      ensureProject(a['workspace_id'] as string, a['project_id'] as string)
      const task = await createTask({
        title: a['title'] as string,
        project_id: a['project_id'] as string,
        workspace_id: a['workspace_id'] as string,
        description: a['description'] as string | undefined,
        priority: a['priority'] as Parameters<typeof createTask>[0]['priority'],
        assigned_to: a['assigned_to'] as string | undefined,
        done_criteria: a['done_criteria'] as string | undefined,
      })
      return { task_id: task.task_id, title: task.title, status: task.status, priority: task.priority, assigned_to: task.assigned_to ?? '' }
    }

    if (name === 'update_task') {
      const task = await updateTask({
        task_id: a['task_id'] as string,
        status: a['status'] as Parameters<typeof updateTask>[0]['status'],
        note: a['note'] as string | undefined,
        assigned_to: a['assigned_to'] as string | undefined,
      })
      return { task_id: task.task_id, updated: true, changes: Object.keys(a).filter(k => k !== 'task_id') }
    }

    if (name === 'recall_memory') {
      const maxChars = (a['max_chars'] as number | undefined) ?? 500
      const memories = await recallMemory({
        query: a['query'] as string,
        workspace_id: a['workspace_id'] as string,
        project_id: a['project_id'] as string | undefined,
        limit: (a['limit'] as number | undefined) ?? 10,
        offset: (a['offset'] as number | undefined) ?? 0,
        mode: 'full',
        query_scope: (a['query_scope'] as 'session' | 'project' | 'workspace' | 'global' | undefined),
        session_id: a['session_id'] as string | undefined,
      } as Parameters<typeof recallMemory>[0])
      return (memories as Array<{ id?: string; content?: string; tags?: string[]; recall_score?: number }>)
        .map(m => ({
          id: m.id,
          content: (m.content ?? '').slice(0, maxChars),
          score: m.recall_score ?? 0.0,
          tags: m.tags ?? [],
        }))
    }

    if (name === 'write_memory') {
      ensureWorkspace(a['workspace_id'] as string)
      ensureProject(a['workspace_id'] as string, a['project_id'] as string)
      const rawTags = a['tags']
      const tagList = Array.isArray(rawTags) ? rawTags.map(String).filter(Boolean)
        : ((rawTags as string | undefined) ?? '').split(',').map(t => t.trim()).filter(Boolean)
      const content = a['content'] as string
      const title = (a['title'] as string | undefined) ?? content.slice(0, 80)
      const memory = await writeMemory({
        content,
        workspace_id: a['workspace_id'] as string,
        project_id: a['project_id'] as string,
        title,
        summary: title,
        scope: 'project',
        kind: 'fact',
        tags: tagList,
      } as Parameters<typeof writeMemory>[0])
      return { saved: true, memory_id: memory.memory_id, project_id: a['project_id'], tags: tagList }
    }

    if (name === 'list_agent_profiles') {
      return await listAgentProfiles({
        workspace_id: a['workspace_id'] as string | undefined,
      })
    }

    if (name === 'get_agent_run_status') {
      const run = await getAgentRunStatus({ run_id: a['run_id'] as string })
      return { run_id: run.run_id, status: run.status, role: run.role, current_step: run.current_step, progress_pct: run.progress_pct }
    }

    if (name === 'start_agent_run') {
      const wsId = a['workspace_id'] as string
      const projId = (a['project_id'] as string | undefined) ?? wsId
      ensureWorkspace(wsId)
      ensureProject(wsId, projId)

      // Find or create task
      let task_id = a['task_id'] as string | undefined
      if (!task_id) {
        const stub = await createTask({ title: `[auto] ${a['agent_role']} run`, workspace_id: wsId, project_id: projId })
        task_id = stub.task_id
      } else {
        const existing = db.prepare('SELECT task_id FROM tasks WHERE task_id = ?').get(task_id)
        if (!existing) {
          const stub = await createTask({ title: `[auto] ${a['agent_role']} run`, workspace_id: wsId, project_id: projId })
          task_id = stub.task_id
        }
      }

      const role = a['agent_role'] as string
      const run = await startAgentRun({
        task_id,
        role: role as Parameters<typeof startAgentRun>[0]['role'],
        workspace_id: wsId,
        agent_id: `pi/${role}`,
        pi_profile: role,
      })

      // Dispatch path: spawn a detached Claude Code subprocess when requested
      if (a['dispatch'] === true) {
        const { dispatchClaudeCode } = await import('@fulcrum/worker')
        const { pid } = dispatchClaudeCode({
          run_id: run.run_id,
          task_id,
          workspace_id: wsId,
          project_id: projId,
          agent_role: role,
          model: a['model'] as string | undefined,
        })
        return { run_id: run.run_id, status: run.status, dispatched: true, pid }
      }

      return { run_id: run.run_id, status: run.status }
    }

    if (name === 'heartbeat_agent_run') {
      await heartbeatAgentRun({
        run_id: a['run_id'] as string,
        current_step: (a['current_step'] as string | undefined) ?? '',
        progress_pct: (a['progress_pct'] as number | undefined) ?? 0,
      })
      return { run_id: a['run_id'], ok: true }
    }

    if (name === 'complete_agent_run') {
      const rawPaths = a['artifact_paths']
      const paths = Array.isArray(rawPaths) ? rawPaths.map(String).filter(Boolean)
        : ((rawPaths as string | undefined) ?? '').split(',').map(p => p.trim()).filter(Boolean)
      const run = await completeAgentRun({
        run_id: a['run_id'] as string,
        output_summary: (a['output_summary'] as string | undefined) ?? '',
        artifacts: paths.length > 0 ? { files_changed: paths } : undefined,
      })
      return { run_id: run.run_id, status: run.status }
    }

    if (name === 'block_agent_run') {
      const run = await blockAgentRun({ run_id: a['run_id'] as string, reason: a['reason'] as string })
      return { run_id: run.run_id, status: run.status, reason: run.blocker }
    }

    if (name === 'build_cos_context') {
      const ctx = await buildCosContext({
        workspace_id: a['workspace_id'] as string,
        project_id: a['project_id'] as string,
      })
      return { context_markdown: ctx, project_id: a['project_id'], workspace_id: a['workspace_id'] }
    }

    if (name === 'get_workspace_status') {
      const status = await getWorkspaceStatus({ workspace_id: a['workspace_id'] as string })
      return {
        workspace_id: a['workspace_id'],
        active_runs: status.running_runs.length,
        blocked_runs: status.blocked_runs.length,
        wip_count: status.wip_count,
        queued_tasks: status.queued_tasks,
        runs: status.running_runs.slice(0, 10).map(r => ({ run_id: r.run_id, role: r.role, status: r.status, task_id: r.task_id })),
        blockers: status.blocked_runs.slice(0, 5).map(r => ({ run_id: r.run_id, reason: r.blocker ?? '?' })),
      }
    }

    if (name === 'create_team_template') {
      const ops = getTeamOps()
      const createTeamTemplate = ops['createTeamTemplate'] as (
        input: Record<string, unknown>,
      ) => Promise<unknown>
      const template = await createTeamTemplate({
        name: a['name'] as string,
        description: a['description'] as string | undefined,
        slots: a['slots'] as unknown[],
        policy: a['policy'] as Record<string, unknown> | undefined,
      })
      return template
    }

    if (name === 'invoke_team') {
      const ops = getTeamOps()
      const invokeTeam = ops['invokeTeam'] as (
        input: Record<string, unknown>,
      ) => Promise<unknown>
      const instance = await invokeTeam({
        template_id: a['template_id'] as string,
        workspace_id: a['workspace_id'] as string,
        project_id: a['project_id'] as string | undefined,
        purpose: a['purpose'] as string,
        task_id: a['task_id'] as string | undefined,
        caller_agent_id: a['caller_agent_id'] as string,
        caller_role: a['caller_role'] as string,
        initial_slots: a['initial_slots'] as Record<string, string[]> | undefined,
      })
      return instance
    }

    if (name === 'list_team_templates') {
      const ops = getTeamOps()
      const listTeamTemplates = ops['listTeamTemplates'] as (
        input?: Record<string, unknown>,
      ) => Promise<unknown[]>
      const rows = await listTeamTemplates({
        limit: (a['limit'] as number | undefined) ?? 50,
        offset: (a['offset'] as number | undefined) ?? 0,
      })
      return rows
    }

    if (name === 'list_team_instances') {
      const ops = getTeamOps()
      const listTeamInstances = ops['listTeamInstances'] as (
        input: Record<string, unknown>,
      ) => Promise<unknown[]>
      const rows = await listTeamInstances({
        workspace_id: a['workspace_id'] as string,
        project_id: a['project_id'] as string | undefined,
        status_category: a['status_category'] as string | undefined,
        limit: (a['limit'] as number | undefined) ?? 50,
        offset: (a['offset'] as number | undefined) ?? 0,
      })
      return rows
    }

    if (name === 'create_agent_profile') {
      const profile = await createAgentProfile({
        workspace_id: a['workspace_id'] as string,
        name: a['name'] as string,
        description: a['description'] as string,
        base_role: a['base_role'] as Parameters<typeof createAgentProfile>[0]['base_role'],
        system_prompt: a['system_prompt'] as string | undefined,
        capabilities: a['capabilities'] as Record<string, unknown> | undefined,
        created_by: a['created_by'] as string | undefined,
      })
      return profile
    }

    if (name === 'create_agent_definition') {
      const def = createAgentDefinition({
        role: a['role'] as Parameters<typeof createAgentDefinition>[0]['role'],
        display_name: a['display_name'] as string,
        description: a['description'] as string,
        version: a['version'] as string | undefined,
        stability: a['stability'] as Parameters<typeof createAgentDefinition>[0]['stability'],
        system_prompt: a['system_prompt'] as string | undefined,
        model: a['model'] as string | undefined,
        provider: a['provider'] as string | undefined,
        tools_allow: a['tools_allow'] as string[] | undefined,
        tools_deny: a['tools_deny'] as string[] | undefined,
        capabilities: a['capabilities'] as string[] | undefined,
        executor_uri: a['executor_uri'] as string | undefined,
      })
      return def
    }

    if (name === 'get_agent_definition') {
      const def = getAgentDefinition(a['role'] as string)
      return def ?? { error: `No definition found for role '${a['role'] as string}'` }
    }

    if (name === 'update_agent_definition') {
      const def = updateAgentDefinition({
        role: a['role'] as Parameters<typeof updateAgentDefinition>[0]['role'],
        display_name: a['display_name'] as string | undefined,
        description: a['description'] as string | undefined,
        version: a['version'] as string | undefined,
        stability: a['stability'] as Parameters<typeof updateAgentDefinition>[0]['stability'],
        system_prompt: a['system_prompt'] as string | undefined,
        model: a['model'] as string | undefined,
        executor_uri: a['executor_uri'] as string | undefined,
      })
      return def
    }

    if (name === 'list_agent_definitions') {
      return listAgentDefinitions(
        a['stability'] as Parameters<typeof listAgentDefinitions>[0],
      )
    }

    if (name === 'get_current_context') {
      const ids = currentProjectIds()
      return { workspace_id: ids.workspace_id, project_id: ids.project_id, cwd: process.cwd() }
    }

    throw new Error(`Unknown tool: ${name}`)
  }

  // ── SDK-based MCP server (protocol 2025-11-25) ──
  const { runFulcrumMcpServer } = await import('./mcp-server.js')

  // Wrap handleToolCall with telemetry spans
  async function handleToolCallWithSpan(name: string, toolArgs: Record<string, unknown>): Promise<unknown> {
    const spanWorkspaceId =
      (toolArgs['workspace_id'] as string | undefined) ?? currentProjectIds().workspace_id
    const mcpSpan = await startSpan({
      name: 'mcp.tool',
      workspace_id: spanWorkspaceId,
      payload: { tool_name: name, arg_keys: Object.keys(toolArgs) },
    })
    try {
      const result = await handleToolCall(name, toolArgs)
      await endSpan({ span_id: mcpSpan.span_id, status: 'ok', payload: { tool_name: name } })
      return result
    } catch (err) {
      await endSpan({ span_id: mcpSpan.span_id, status: 'error', payload: { error: (err as Error).message } })
      throw err
    }
  }

  await runFulcrumMcpServer({
    version: '0.0.1',
    handleToolCall: handleToolCallWithSpan,
  })
}

async function runServeMcpHttp(): Promise<void> {
  const { getDb, runMigrations, loadConfig, createTask, updateTask, listTasks,
    startAgentRun, heartbeatAgentRun, completeAgentRun, blockAgentRun,
    getAgentRunStatus,
    buildCosContext, getWorkspaceStatus, listAgentProfiles,
    createAgentProfile, getTeamOps,
    createAgentDefinition, getAgentDefinition, updateAgentDefinition, listAgentDefinitions,
    startSpan, endSpan } = await import('@fulcrum/core')
  const { writeMemory, recallMemory } = await import('@fulcrum/memory')
  const { runFulcrumMcpHttpServer } = await import('./mcp-server.js')

  const config = loadConfig()
  const db = getDb()
  runMigrations(db)

  await warmEmbedding()
  await warmOtel()
  registerOtelShutdown()

  // Reuse the same tool handler setup as stdio MCP — only transport differs
  function ensureWorkspace(wsId: string, name?: string) {
    const existing = db.prepare('SELECT workspace_id FROM workspaces WHERE workspace_id = ?').get(wsId)
    if (!existing) {
      const now = new Date().toISOString()
      db.prepare('INSERT OR IGNORE INTO workspaces (workspace_id, name, status, created_at) VALUES (?, ?, ?, ?)').run(wsId, name ?? wsId, 'active', now)
    }
  }
  function ensureProject(wsId: string, projId: string, name?: string) {
    const existing = db.prepare('SELECT project_id FROM projects WHERE project_id = ?').get(projId)
    if (!existing) {
      const now = new Date().toISOString()
      db.prepare('INSERT OR IGNORE INTO projects (project_id, workspace_id, name, created_at) VALUES (?, ?, ?, ?)').run(projId, wsId, name ?? projId, now)
    }
  }
  if (config.workspace_id) ensureWorkspace(config.workspace_id)
  if (config.workspace_id && config.project_id) ensureProject(config.workspace_id, config.project_id)

  // Import same handler factory — use an inline import to get handleToolCall
  // (The full handler is too large to duplicate; we reuse it via mcp-server's createFulcrumMcpServer)
  const portArg = args.find(a => a.startsWith('--port'))
  let port = 4722
  if (portArg) {
    const idx = args.indexOf(portArg)
    const val = portArg.includes('=') ? portArg.split('=')[1] : args[idx + 1]
    if (val) port = parseInt(val, 10)
  }

  // Build same handleToolCall (subset — reuse the shared core for brevity)
  async function handleToolCall(name: string, toolArgs: Record<string, unknown>): Promise<unknown> {
    const a = toolArgs
    if (name === 'get_workspace_status') {
      return await getWorkspaceStatus({ workspace_id: a['workspace_id'] as string })
    }
    if (name === 'list_tasks') {
      return await listTasks({
        workspace_id: a['workspace_id'] as string,
        project_id: a['project_id'] as string | undefined,
        status: a['status'] as Parameters<typeof listTasks>[0]['status'],
        limit: (a['limit'] as number | undefined) ?? 20,
      })
    }
    if (name === 'recall_memory') {
      const maxChars = (a['max_chars'] as number | undefined) ?? 500
      const memories = await recallMemory({
        query: a['query'] as string,
        workspace_id: a['workspace_id'] as string,
        project_id: a['project_id'] as string | undefined,
        limit: (a['limit'] as number | undefined) ?? 10,
        offset: (a['offset'] as number | undefined) ?? 0,
        mode: 'full',
      } as Parameters<typeof recallMemory>[0])
      return (memories as Array<{ id?: string; content?: string; tags?: string[]; recall_score?: number }>)
        .map(m => ({ id: m.id, content: (m.content ?? '').slice(0, maxChars), score: m.recall_score ?? 0.0, tags: m.tags ?? [] }))
    }
    if (name === 'build_cos_context') {
      return await buildCosContext({ workspace_id: a['workspace_id'] as string, project_id: a['project_id'] as string })
    }
    // Passthrough for other tools: delegate to core imports
    if (name === 'list_agent_profiles') return await listAgentProfiles()
    if (name === 'get_agent_run_status') return await getAgentRunStatus({ run_id: a['run_id'] as string })
    if (name === 'start_agent_run') {
      ensureWorkspace(a['workspace_id'] as string)
      return await startAgentRun({ task_id: a['task_id'] as string, workspace_id: a['workspace_id'] as string, role: a['agent_role'] as Parameters<typeof startAgentRun>[0]['role'] })
    }
    if (name === 'heartbeat_agent_run') return await heartbeatAgentRun({ run_id: a['run_id'] as string, status: a['status'] as string | undefined })
    if (name === 'complete_agent_run') return await completeAgentRun({ run_id: a['run_id'] as string, summary: a['summary'] as string | undefined })
    if (name === 'block_agent_run') return await blockAgentRun({ run_id: a['run_id'] as string, reason: a['reason'] as string, escalation_reason: a['escalation_reason'] as string | undefined })
    if (name === 'write_memory') {
      return await writeMemory({
        content: a['content'] as string,
        workspace_id: a['workspace_id'] as string,
        project_id: a['project_id'] as string,
        tags: a['tags'] as string[] | undefined,
        importance: a['importance'] as number | undefined,
      } as Parameters<typeof writeMemory>[0])
    }
    if (name === 'create_task') {
      ensureWorkspace(a['workspace_id'] as string)
      if (a['project_id']) ensureProject(a['workspace_id'] as string, a['project_id'] as string)
      return await createTask({ title: a['title'] as string, workspace_id: a['workspace_id'] as string, project_id: a['project_id'] as string })
    }
    if (name === 'update_task') return await updateTask({ task_id: a['task_id'] as string, status: a['status'] as Parameters<typeof updateTask>[0]['status'] })
    if (name === 'list_agent_definitions') return listAgentDefinitions()
    if (name === 'get_agent_definition') return getAgentDefinition(a['role'] as string)
    if (name === 'create_agent_definition') return createAgentDefinition(a as Parameters<typeof createAgentDefinition>[0])
    if (name === 'update_agent_definition') return updateAgentDefinition(a as Parameters<typeof updateAgentDefinition>[0])
    if (name === 'create_agent_profile') return createAgentProfile({ workspace_id: a['workspace_id'] as string, name: a['name'] as string, description: a['description'] as string, base_role: a['base_role'] as Parameters<typeof createAgentProfile>[0]['base_role'] })
    if (name === 'create_team_template' || name === 'list_team_templates' || name === 'invoke_team' || name === 'list_team_instances') {
      const ops = getTeamOps()
      const fn = ops[name.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()) as keyof typeof ops] as ((args: Record<string, unknown>) => Promise<unknown>) | undefined
      if (fn) return await fn(a)
    }
    if (name === 'get_current_context') {
      return { workspace_id: config.workspace_id, project_id: config.project_id, cwd: process.cwd() }
    }
    throw new Error(`Unknown tool: ${name}`)
  }

  async function handleToolCallWithSpan(name: string, toolArgs: Record<string, unknown>): Promise<unknown> {
    const spanWorkspaceId = (toolArgs['workspace_id'] as string | undefined) ?? config.workspace_id ?? ''
    const mcpSpan = await startSpan({ name: 'mcp.tool', workspace_id: spanWorkspaceId, payload: { tool_name: name, arg_keys: Object.keys(toolArgs) } })
    try {
      const result = await handleToolCall(name, toolArgs)
      await endSpan({ span_id: mcpSpan.span_id, status: 'ok', payload: { tool_name: name } })
      return result
    } catch (err) {
      await endSpan({ span_id: mcpSpan.span_id, status: 'error', payload: { error: (err as Error).message } })
      throw err
    }
  }

  await runFulcrumMcpHttpServer({ version: '0.0.1', handleToolCall: handleToolCallWithSpan, port })
}

async function runServeMonitor(): Promise<void> {
  const { startMonitorServer } = await import('@fulcrum/monitor')
  const { getDb, runMigrations, loadConfig } = await import('@fulcrum/core')

  const config = loadConfig()
  const db = getDb()
  runMigrations(db)

  await warmEmbedding()
  await warmOtel()
  registerOtelShutdown()

  const portArg = args.find(a => a.startsWith('--port'))
  let port = config.port ?? 4721
  if (portArg) {
    const idx = args.indexOf(portArg)
    const val = portArg.includes('=') ? portArg.split('=')[1] : args[idx + 1]
    if (val) port = parseInt(val, 10)
  }

  const server = startMonitorServer({ port, workspace_id: config.workspace_id || undefined })
  await server.start()
  console.log(`[fulcrum monitor] Listening on http://127.0.0.1:${port}`)
  console.log(`[fulcrum monitor] API docs: http://127.0.0.1:${port}/status`)

  // Keep alive
  await new Promise(() => {})
}

async function runServeAll(): Promise<void> {
  // Start monitor in background thread, MCP on stdio
  const { startMonitorServer } = await import('@fulcrum/monitor')
  const { getDb, runMigrations, loadConfig } = await import('@fulcrum/core')

  const config = loadConfig()
  const db = getDb()
  runMigrations(db)

  await warmEmbedding()
  await warmOtel()
  registerOtelShutdown()

  const server = startMonitorServer({ workspace_id: config.workspace_id || undefined })
  await server.start()
  console.error(`[fulcrum] Monitor running on http://127.0.0.1:${server.port}`)

  await runServeMcp()
}

// ── Workspace/project commands ────────────────────────────────────────────────

async function runWorkspaces(): Promise<void> {
  const { listWorkspaces, createWorkspace } = await import('@fulcrum/core')
  const sub = command // e.g. 'list' or 'create'

  if (!sub || sub === '--help' || sub === '-h') {
    console.log(`
fulcrum workspaces — workspace CRUD

  fulcrum workspaces list
  fulcrum workspaces create --name <name> [--id <id>]
`)
    process.exit(0)
  }

  if (sub === 'list') {
    const rows = await listWorkspaces()
    if (rows.length === 0) { console.log('No workspaces found.'); return }
    for (const r of rows) console.log(`  ${r.workspace_id}  ${r.name}  (${r.status})`)
    return
  }

  if (sub === 'create') {
    const nameIdx = args.indexOf('--name')
    const idIdx = args.indexOf('--id')
    const name = nameIdx >= 0 ? args[nameIdx + 1] : undefined
    const workspace_id = idIdx >= 0 ? args[idIdx + 1] : undefined
    if (!name) { console.error('--name is required'); process.exit(1) }
    const ws = await createWorkspace({ name, workspace_id })
    console.log(`Created workspace: ${ws.workspace_id}  (${ws.name})`)
    return
  }

  console.error(`Unknown workspaces command: ${sub}`)
  process.exit(1)
}

async function runProjects(): Promise<void> {
  const { listProjects, createProject } = await import('@fulcrum/core')
  const sub = command

  if (!sub || sub === '--help' || sub === '-h') {
    console.log(`
fulcrum projects — project CRUD

  fulcrum projects list [--workspace-id <id>]
  fulcrum projects create --name <name> --workspace-id <id> [--type <type>] [--id <id>]
`)
    process.exit(0)
  }

  if (sub === 'list') {
    const wsIdx = args.indexOf('--workspace-id')
    const workspace_id = wsIdx >= 0 ? args[wsIdx + 1] : undefined
    const rows = await listProjects({ workspace_id })
    if (rows.length === 0) { console.log('No projects found.'); return }
    for (const r of rows) console.log(`  ${r.project_id}  ${r.name}  type:${r.type}  status:${r.status}  ws:${r.workspace_id}`)
    return
  }

  if (sub === 'create') {
    const nameIdx = args.indexOf('--name')
    const wsIdx = args.indexOf('--workspace-id')
    const idIdx = args.indexOf('--id')
    const typeIdx = args.indexOf('--type')
    const name = nameIdx >= 0 ? args[nameIdx + 1] : undefined
    const workspace_id = wsIdx >= 0 ? args[wsIdx + 1] : undefined
    if (!name || !workspace_id) { console.error('--name and --workspace-id are required'); process.exit(1) }
    const project_id = idIdx >= 0 ? args[idIdx + 1] : undefined
    const type = typeIdx >= 0 ? (args[typeIdx + 1] as Parameters<typeof createProject>[0]['type']) : undefined
    const proj = await createProject({ name, workspace_id, project_id, type })
    console.log(`Created project: ${proj.project_id}  (${proj.name}) in workspace ${proj.workspace_id}`)
    return
  }

  console.error(`Unknown projects command: ${sub}`)
  process.exit(1)
}

// ── Task commands (J-6) ───────────────────────────────────────────────────────

export async function runTasks(): Promise<void> {
  const { listTasks, createTask, updateTask } = await import('@fulcrum/core')
  const sub = command

  if (!sub || sub === '--help' || sub === '-h') {
    console.log(`
fulcrum task — task CRUD

  fulcrum task list [--workspace-id <id>] [--project-id <id>] [--status <s>] [--limit <n>] [--json]
  fulcrum task get --id <task_id> [--json]
  fulcrum task create --title <title> [--workspace-id <id>] [--project-id <id>] [--description <d>] [--priority <p>] [--assigned-to <role>]
  fulcrum task update --id <task_id> [--status <s>] [--note <n>] [--assigned-to <role>]
`)
    process.exit(0)
  }

  if (sub === 'list') {
    const workspace_id = optArg('--workspace-id') ?? currentProjectIds().workspace_id
    const project_id = optArg('--project-id')
    const status = optArg('--status') as Parameters<typeof listTasks>[0]['status']
    const limit = optIntArg('--limit') ?? 50
    const rows = await listTasks({ workspace_id, project_id, status })
    const trimmed = rows.slice(0, limit).map(t => ({
      task_id: t.task_id,
      display_id: t.display_id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      assigned_to: t.assigned_to ?? '',
    }))
    outputRows(trimmed)
    return
  }

  if (sub === 'get') {
    const task_id = requireArg('--id')
    const { getDb } = await import('@fulcrum/core')
    const db = getDb()
    const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(task_id) as Record<string, unknown> | undefined
    if (!row) { console.error(`task not found: ${task_id}`); process.exit(1) }
    outputObject(row)
    return
  }

  if (sub === 'create') {
    const title = requireArg('--title')
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const project_id = optArg('--project-id') ?? ids.project_id
    const description = optArg('--description')
    const priority = optArg('--priority') as Parameters<typeof createTask>[0]['priority']
    const assigned_to = optArg('--assigned-to')
    const task = await createTask({ title, workspace_id, project_id, description, priority, assigned_to })
    outputObject({ task_id: task.task_id, display_id: task.display_id, title: task.title, status: task.status, priority: task.priority })
    return
  }

  if (sub === 'update') {
    const task_id = requireArg('--id')
    const status = optArg('--status') as Parameters<typeof updateTask>[0]['status']
    const note = optArg('--note')
    const assigned_to = optArg('--assigned-to')
    const task = await updateTask({ task_id, status, note, assigned_to })
    outputObject({ task_id: task.task_id, status: task.status, note: task.note ?? '', assigned_to: task.assigned_to ?? '' })
    return
  }

  console.error(`Unknown task command: ${sub}`)
  process.exit(1)
}

// ── Issue commands (J-6) ──────────────────────────────────────────────────────

export async function runIssues(): Promise<void> {
  const { createIssue, updateIssue, listIssues } = await import('@fulcrum/planning')
  const sub = command

  if (!sub || sub === '--help' || sub === '-h') {
    console.log(`
fulcrum issue — issue CRUD

  fulcrum issue list [--workspace-id <id>] [--project-id <id>] [--status <s>] [--json]
  fulcrum issue get --id <issue_id> [--json]
  fulcrum issue create --title <title> [--workspace-id <id>] [--project-id <id>] [--description <d>] [--priority <p>]
  fulcrum issue update --id <issue_id> [--status <s>] [--title <t>] [--expected-version <n>]
`)
    process.exit(0)
  }

  if (sub === 'list') {
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const project_id = optArg('--project-id')
    const status = optArg('--status') as Parameters<typeof listIssues>[0]['status']
    const rows = await listIssues({ workspace_id, project_id, status })
    outputRows(rows.map(i => ({
      issue_id: i.issue_id,
      display_id: i.display_id,
      title: i.title,
      status: i.status,
      priority: i.priority,
    })))
    return
  }

  if (sub === 'create') {
    const title = requireArg('--title')
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const project_id = optArg('--project-id') ?? ids.project_id
    const description = optArg('--description')
    const priority = optArg('--priority') as Parameters<typeof createIssue>[0]['priority']
    const issue = await createIssue({ title, workspace_id, project_id, description, priority })
    outputObject({ issue_id: issue.issue_id, display_id: issue.display_id, title: issue.title, status: issue.status })
    return
  }

  if (sub === 'get') {
    const issue_id = requireArg('--id')
    const { getDb } = await import('@fulcrum/core')
    const db = getDb()
    const row = db.prepare('SELECT * FROM issues WHERE issue_id = ?').get(issue_id) as Record<string, unknown> | undefined
    if (!row) { console.error(`issue not found: ${issue_id}`); process.exit(1) }
    outputObject(row)
    return
  }

  if (sub === 'update') {
    const issue_id = requireArg('--id')
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const status = optArg('--status') as Parameters<typeof updateIssue>[0]['status']
    const title = optArg('--title')
    const expected_version = optIntArg('--expected-version') ?? 0
    const issue = await updateIssue({ issue_id, workspace_id, status, title, expected_version })
    outputObject({ issue_id: issue.issue_id, status: issue.status, title: issue.title, version: issue.version })
    return
  }

  console.error(`Unknown issue command: ${sub}`)
  process.exit(1)
}

// ── Epic commands (J-6) ───────────────────────────────────────────────────────

export async function runEpics(): Promise<void> {
  const { createEpic, listEpics } = await import('@fulcrum/planning')
  const sub = command

  if (!sub || sub === '--help' || sub === '-h') {
    console.log(`
fulcrum epic — epic CRUD

  fulcrum epic list [--workspace-id <id>] [--project-id <id>] [--json]
  fulcrum epic get --id <epic_id> [--json]
  fulcrum epic create --title <title> [--workspace-id <id>] [--project-id <id>] [--description <d>] [--priority <p>]
`)
    process.exit(0)
  }

  if (sub === 'list') {
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const project_id = optArg('--project-id')
    const rows = await listEpics({ workspace_id, project_id })
    outputRows(rows.map(e => ({
      epic_id: e.epic_id,
      display_id: e.display_id,
      title: e.title,
      status: e.status,
      priority: e.priority,
    })))
    return
  }

  if (sub === 'create') {
    const title = requireArg('--title')
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const project_id = optArg('--project-id') ?? ids.project_id
    const description = optArg('--description')
    const priority = optArg('--priority') as Parameters<typeof createEpic>[0]['priority']
    const epic = await createEpic({ title, workspace_id, project_id, description, priority })
    outputObject({ epic_id: epic.epic_id, display_id: epic.display_id, title: epic.title, status: epic.status })
    return
  }

  if (sub === 'get') {
    const epic_id = requireArg('--id')
    const { getDb } = await import('@fulcrum/core')
    const db = getDb()
    const row = db.prepare('SELECT * FROM epics WHERE epic_id = ?').get(epic_id) as Record<string, unknown> | undefined
    if (!row) { console.error(`epic not found: ${epic_id}`); process.exit(1) }
    outputObject(row)
    return
  }

  console.error(`Unknown epic command: ${sub}`)
  process.exit(1)
}

// ── Board commands (J-6) ──────────────────────────────────────────────────────

export async function runBoard(): Promise<void> {
  const { listTasks } = await import('@fulcrum/core')
  const sub = command ?? 'show'

  if (sub === '--help' || sub === '-h') {
    console.log(`
fulcrum board — kanban-style task board view

  fulcrum board show [--workspace-id <id>] [--project-id <id>] [--json]

Groups tasks by status_category (backlog, active, blocked, done).
`)
    process.exit(0)
  }

  if (sub === 'show') {
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const project_id = optArg('--project-id')
    const tasks = await listTasks({ workspace_id, project_id })
    const groups: Record<string, typeof tasks> = { backlog: [], active: [], blocked: [], done: [] }
    for (const t of tasks) {
      const cat = t.status_category as keyof typeof groups
      if (groups[cat]) groups[cat].push(t)
    }
    if (args.includes('--json')) {
      console.log(JSON.stringify(groups, null, 2))
      return
    }
    for (const [cat, rows] of Object.entries(groups)) {
      console.log(`\n== ${cat.toUpperCase()} (${rows.length}) ==`)
      for (const t of rows) {
        console.log(`  ${t.display_id}  ${t.status.padEnd(10)}  ${t.title}`)
      }
    }
    console.log('')
    return
  }

  console.error(`Unknown board command: ${sub}`)
  process.exit(1)
}

// ── Queue commands (J-6) ──────────────────────────────────────────────────────

export async function runQueue(): Promise<void> {
  // Arg layout: `fulcrum queue merge list` → args[0]='queue', args[1]='merge',
  // args[2]='list'.
  const sub = command
  const sub2 = args[2]

  if (!sub || sub === '--help' || sub === '-h') {
    console.log(`
fulcrum queue — integration and review queues

  fulcrum queue merge list [--workspace-id <id>]
  fulcrum queue merge process --workspace-id <id> --actor-role <role> [--project-id <id>]
  fulcrum queue review list [--workspace-id <id>] [--project-id <id>]
`)
    process.exit(0)
  }

  if (sub === 'merge' && sub2 === 'list') {
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const { getDb } = await import('@fulcrum/core')
    const db = getDb()
    const rows = db.prepare(
      `SELECT worktree_id, branch_name, status, project_id, updated_at
       FROM worktrees
       WHERE workspace_id = ? AND status IN ('ready_for_merge','conflict')
       ORDER BY updated_at ASC`,
    ).all(workspace_id) as Record<string, unknown>[]
    outputRows(rows)
    return
  }

  if (sub === 'merge' && sub2 === 'process') {
    const { processMergeQueue } = await import('@fulcrum/worktrees')
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const project_id = optArg('--project-id') ?? ids.project_id
    const actor_role = requireArg('--actor-role')
    const result = await processMergeQueue({ workspace_id, project_id, actor_role })
    outputObject({
      merged: result.merged.length,
      skipped: result.skipped.length,
      conflicts: result.conflicts.length,
      results: result.results,
    })
    return
  }

  if (sub === 'review' && sub2 === 'list') {
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const project_id = optArg('--project-id')
    const { getDb } = await import('@fulcrum/core')
    const db = getDb()
    let sql = `SELECT artifact_id, display_id, title, artifact_type, status, file_path, updated_at
               FROM artifacts
               WHERE workspace_id = ? AND artifact_type = 'review_summary'`
    const params: unknown[] = [workspace_id]
    if (project_id) { sql += ' AND project_id = ?'; params.push(project_id) }
    sql += ' ORDER BY updated_at DESC LIMIT 50'
    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[]
    outputRows(rows)
    return
  }

  console.error(`Unknown queue command: ${sub} ${sub2 ?? ''}`)
  console.error('Usage: fulcrum queue merge list|process | fulcrum queue review list')
  process.exit(1)
}

// ── Sync commands (J-6) ───────────────────────────────────────────────────────

export async function runSync(): Promise<void> {
  const sub = command

  if (!sub || sub === '--help' || sub === '-h') {
    console.log(`
fulcrum sync — plane sync (push/pull to remote adapter)

  fulcrum sync status [--workspace-id <id>] [--json]
  fulcrum sync push [--workspace-id <id>] [--object-type <type>]
  fulcrum sync pull [--workspace-id <id>]
`)
    process.exit(0)
  }

  const { syncAll, listConflicts } = await import('@fulcrum/sync')

  if (sub === 'status') {
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const { getDb } = await import('@fulcrum/core')
    const db = getDb()
    const state = db.prepare(
      `SELECT object_type, sync_status, COUNT(*) as count
       FROM sync_states WHERE workspace_id = ?
       GROUP BY object_type, sync_status
       ORDER BY object_type, sync_status`,
    ).all(workspace_id) as Record<string, unknown>[]
    const conflicts = await listConflicts({ workspace_id, unresolved_only: true })
    if (args.includes('--json')) {
      console.log(JSON.stringify({ state, conflicts }, null, 2))
      return
    }
    console.log('\nSync state:')
    outputRows(state)
    console.log(`\nUnresolved conflicts: ${conflicts.length}`)
    return
  }

  if (sub === 'push') {
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const object_type = optArg('--object-type') as Parameters<typeof syncAll>[0]['object_type']
    try {
      const result = await syncAll({ workspace_id, object_type })
      outputObject(result as unknown as Record<string, unknown>)
    } catch (err) {
      console.error(`sync push failed: ${(err as Error).message}`)
      process.exit(1)
    }
    return
  }

  if (sub === 'pull') {
    // Plane sync is push-based by design; pulling happens inside adapter on
    // conflict detection. Expose as a no-op that runs syncAll (which will
    // reconcile both directions for the queued objects).
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    try {
      const result = await syncAll({ workspace_id })
      outputObject(result as unknown as Record<string, unknown>)
    } catch (err) {
      console.error(`sync pull failed: ${(err as Error).message}`)
      process.exit(1)
    }
    return
  }

  console.error(`Unknown sync command: ${sub}`)
  console.error('Usage: fulcrum sync status|push|pull')
  process.exit(1)
}

// ── Team commands (J-6) ───────────────────────────────────────────────────────

export async function runTeams(): Promise<void> {
  const sub = command

  if (!sub || sub === '--help' || sub === '-h') {
    console.log(`
fulcrum team — team templates and instances

  fulcrum team list [--workspace-id <id>]
  fulcrum team create --name <name> [--description <d>] [--workspace-id <id>]
  fulcrum team invoke --template-id <id> --workspace-id <id> --caller-role <role> [--goal <g> | --purpose <p>] [--project-id <id>] [--caller-agent-id <id>]
  fulcrum team instances [--workspace-id <id>] [--project-id <id>]
`)
    process.exit(0)
  }

  const { getTeamOps: _getTeamOpsForCli } = await import('@fulcrum/core')
  const _cliTeamOps = _getTeamOpsForCli()
  if (!_cliTeamOps) {
    console.error('team: @fulcrum/teams is not available')
    process.exit(1)
  }

  if (sub === 'list') {
    const { getDb } = await import('@fulcrum/core')
    const db = getDb()
    const rows = db.prepare(
      `SELECT template_id, name, description, created_at FROM team_templates ORDER BY created_at DESC`,
    ).all() as Record<string, unknown>[]
    outputRows(rows)
    return
  }

  if (sub === 'create') {
    const name = requireArg('--name')
    const description = optArg('--description')
    const template = await _cliTeamOps.createTeamTemplate({ name, description, slots: [] })
    outputObject({ template_id: template.template_id, name: template.name })
    return
  }

  if (sub === 'invoke') {
    const template_id = requireArg('--template-id')
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const project_id = optArg('--project-id')
    const caller_role = requireArg('--caller-role')
    const purpose = optArg('--purpose') ?? optArg('--goal') ?? 'cli-invoked'
    const caller_agent_id = optArg('--caller-agent-id') ?? `cli/${caller_role}`
    try {
      const inst = await _cliTeamOps.invokeTeam({
        template_id,
        workspace_id,
        project_id,
        purpose,
        caller_agent_id,
        caller_role,
      })
      outputObject({ instance_id: inst.instance_id, display_id: inst.display_id, status: inst.status })
    } catch (err) {
      console.error(`team invoke failed: ${(err as Error).message}`)
      process.exit(1)
    }
    return
  }

  if (sub === 'instances') {
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const project_id = optArg('--project-id')
    const rows = await _cliTeamOps.listTeamInstances({ workspace_id, project_id })
    outputRows(rows.map(r => ({
      instance_id: r.instance_id,
      display_id: r.display_id,
      template_id: r.template_id,
      status: r.status,
      purpose: r.purpose,
    })))
    return
  }

  console.error(`Unknown team command: ${sub}`)
  process.exit(1)
}

// ── Workflow commands (J-6) ───────────────────────────────────────────────────

export async function runWorkflows(): Promise<void> {
  const sub = command

  if (!sub || sub === '--help' || sub === '-h') {
    console.log(`
fulcrum workflow — durable multi-step workflows

  fulcrum workflow list [--workspace-id <id>]
  fulcrum workflow start --workflow-name <name> [--workspace-id <id>] [--project-id <id>]
  fulcrum workflow run --wf-id <id> [--workspace-id <id>]
  fulcrum workflow status --wf-id <id> [--workspace-id <id>]
  fulcrum workflow resume --wf-id <id> [--workspace-id <id>]
`)
    process.exit(0)
  }

  if (sub === 'list') {
    const { listWorkflows } = await import('@fulcrum/workflows')
    const defs = await listWorkflows()
    outputRows(defs.map(d => ({ name: d.name, version: d.version, steps: d.steps.length, description: d.description ?? '' })))
    return
  }

  if (sub === 'start') {
    const { startWorkflow } = await import('@fulcrum/workflows')
    const workflow_name = requireArg('--workflow-name')
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const project_id = optArg('--project-id')
    try {
      const run = await startWorkflow({ workflow_name, workspace_id, project_id })
      outputObject({ wf_id: run.wf_id, display_id: run.display_id, status: run.status })
    } catch (err) {
      console.error(`workflow start failed: ${(err as Error).message}`)
      process.exit(1)
    }
    return
  }

  if (sub === 'run') {
    const { runWorkflow } = await import('@fulcrum/workflows')
    const wf_id = requireArg('--wf-id')
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    try {
      const result = await runWorkflow({ wf_id, workspace_id })
      outputObject(result as unknown as Record<string, unknown>)
    } catch (err) {
      console.error(`workflow run failed: ${(err as Error).message}`)
      process.exit(1)
    }
    return
  }

  if (sub === 'status') {
    const { getWorkflowRun } = await import('@fulcrum/workflows')
    const wf_id = requireArg('--wf-id')
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    try {
      const run = await getWorkflowRun({ wf_id, workspace_id })
      outputObject({
        wf_id: run.wf_id,
        display_id: run.display_id,
        status: run.status,
        current_step: run.current_step_id ?? '',
        workflow_name: run.workflow_name,
      })
    } catch (err) {
      console.error(`workflow status failed: ${(err as Error).message}`)
      process.exit(1)
    }
    return
  }

  if (sub === 'resume') {
    const { resumeWorkflow } = await import('@fulcrum/workflows')
    const wf_id = requireArg('--wf-id')
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    try {
      const run = await resumeWorkflow({ wf_id, workspace_id })
      outputObject({ wf_id: run.wf_id, status: run.status })
    } catch (err) {
      console.error(`workflow resume failed: ${(err as Error).message}`)
      process.exit(1)
    }
    return
  }

  console.error(`Unknown workflow command: ${sub}`)
  process.exit(1)
}

// ── Agent commands (J-6) ──────────────────────────────────────────────────────

export async function runAgent(): Promise<void> {
  const sub = command

  if (!sub || sub === '--help' || sub === '-h') {
    console.log(`
fulcrum agent — agent runs and spawning

  fulcrum agent list [--workspace-id <id>] [--json]
  fulcrum agent status --run-id <id> [--json]
  fulcrum agent spawn --target-role <role> --caller-role <role> --task-id <id> [--workspace-id <id>] [--project-id <id>] [--adapter <name>]
  fulcrum agent versions <role>
`)
    process.exit(0)
  }

  if (sub === 'list') {
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const { getDb } = await import('@fulcrum/core')
    const db = getDb()
    const rows = db.prepare(
      `SELECT run_id, role, status, task_id, current_step, progress_pct, started_at
       FROM agent_runs
       WHERE workspace_id = ?
       ORDER BY started_at DESC LIMIT 50`,
    ).all(workspace_id) as Record<string, unknown>[]
    outputRows(rows)
    return
  }

  if (sub === 'status') {
    const run_id = requireArg('--run-id')
    const { getAgentRunStatus } = await import('@fulcrum/core')
    try {
      const run = await getAgentRunStatus({ run_id })
      outputObject({
        run_id: run.run_id,
        status: run.status,
        role: run.role,
        task_id: run.task_id,
        current_step: run.current_step ?? '',
        progress_pct: run.progress_pct ?? 0,
      })
    } catch (err) {
      console.error(`agent status failed: ${(err as Error).message}`)
      process.exit(1)
    }
    return
  }

  if (sub === 'spawn') {
    const { spawnAgent } = await import('@fulcrum/worker')
    const ids = currentProjectIds()
    const workspace_id = optArg('--workspace-id') ?? ids.workspace_id
    const project_id = optArg('--project-id') ?? ids.project_id
    const target_role = requireArg('--target-role')
    const caller_role = requireArg('--caller-role')
    const task_id = requireArg('--task-id')
    const adapter = optArg('--adapter')
    try {
      const result = await spawnAgent({
        workspace_id,
        project_id,
        task_id,
        target_role: target_role as Parameters<typeof spawnAgent>[0]['target_role'],
        caller_role: caller_role as Parameters<typeof spawnAgent>[0]['caller_role'],
        adapter,
      })
      outputObject({
        run_id: result.run_id,
        status: result.result.status,
        summary: result.result.summary ?? '',
      })
    } catch (err) {
      console.error(`agent spawn failed: ${(err as Error).message}`)
      process.exit(1)
    }
    return
  }

  if (sub === 'versions') {
    const role = args[2]
    if (!role) {
      console.error('Usage: fulcrum agent versions <role>')
      process.exit(1)
    }
    const { getAgentDefinition } = await import('@fulcrum/core')
    const def = getAgentDefinition(role)
    if (!def) {
      console.error(`No agent definition found for role: ${role}`)
      process.exit(1)
    }
    outputObject({
      role: def.role,
      display_name: def.display_name,
      version: def.version,
      stability: def.stability,
      updated_at: def.updated_at,
    })
    return
  }

  console.error(`Unknown agent command: ${sub}`)
  process.exit(1)
}

// ── Auto project initialization ───────────────────────────────────────────────
//
// Every fulcrum command that touches the DB runs through this first. It:
//   1. opens the single GLOBAL DB at globalDataDir()/fulcrum.db — NEVER in $CWD
//      and runs migrations (idempotent)
//   2. ensures a workspace + project exist, with deterministic IDs derived from
//      the absolute $CWD path — logical isolation inside the one global DB,
//      not physical separation
// Idempotent: safe to call on every invocation. Prints a one-line notice
// on first-time init (to stderr so it never corrupts MCP stdio traffic).
// NEVER writes any files to $CWD or any project directory.

let _projectInitialized = false
let _projectIds: { workspace_id: string; project_id: string } | null = null

function currentProjectIds(): { workspace_id: string; project_id: string } {
  if (!_projectIds) throw new Error('ensureProjectInitialized() must be called before accessing project IDs')
  return _projectIds
}

async function ensureProjectInitialized(opts: { silent?: boolean } = {}): Promise<{ workspace_id: string; project_id: string }> {
  if (_projectIds) return _projectIds
  const { getDb, runMigrations, getWorkspace, getProject, createWorkspace, createProject, projectIdsFromPath } = await import('@fulcrum/core')

  // Initialize the global DB (data lives in globalDataDir(), NEVER in $CWD)
  const db = getDb()
  runMigrations(db)

  // Deterministic IDs: sha256[:12] of the absolute CWD path, prefixed with a
  // sanitized directory name. Stable across runs, unique across projects.
  // No file is written to the project directory.
  const { workspace_id, project_id } = projectIdsFromPath(process.cwd())
  const sanitizedName = workspace_id.replace(/^ws_/, '').replace(/_[a-f0-9]{12}$/, '')

  // Route workspace/project creation through core CRUD so FK/enum validation
  // runs in one place. Both calls are effectively idempotent: we check
  // existence first, and createWorkspace itself is INSERT OR IGNORE.
  const existingWs = await getWorkspace(workspace_id)
  const existingProj = await getProject(project_id)
  if (!existingWs) await createWorkspace({ workspace_id, name: sanitizedName })
  if (!existingProj) await createProject({ workspace_id, project_id, name: sanitizedName })

  // Announce first-time init on stderr (never stdout — MCP stdio is strict)
  const firstRun = !existingWs || !existingProj
  if (firstRun && !opts.silent && !_projectInitialized) {
    process.stderr.write(`[fulcrum] initialized project "${sanitizedName}" (${workspace_id})\n`)
  }
  _projectInitialized = true
  _projectIds = { workspace_id, project_id }
  return _projectIds
}

// ── Plugin management ────────────────────────────────────────────────────────

async function runPlugin(): Promise<void> {
  const { execSync } = await import('child_process')
  const { existsSync, mkdirSync } = await import('fs')
  const { join } = await import('path')

  switch (command) {
    case 'list': {
      const plugins = discoverPlugins(process.cwd())
      if (plugins.length === 0) {
        console.log('No Fulcrum plugins found.')
        console.log(`(searched project node_modules and ${globalDataDir()}/plugins/)`)
        return
      }
      const rows = plugins.map(p => ({
        name: p.name,
        root: p.root,
        hooks: p.manifest.hooks ?? '',
        skills: p.manifest.skills ?? '',
        agents: p.manifest.agents ?? '',
      }))
      outputRows(rows, ['name', 'root', 'hooks', 'skills', 'agents'])
      return
    }

    case 'install': {
      // Install an npm package as a globally-available Fulcrum plugin
      const pkgArg = args.find(a => !a.startsWith('--') && a !== 'plugin' && a !== 'install')
      if (!pkgArg) {
        console.error('Usage: fulcrum plugin install <package-name-or-path>')
        process.exit(1)
      }
      const pluginsDir = join(globalDataDir(), 'plugins')
      mkdirSync(pluginsDir, { recursive: true })
      console.log(`Installing ${pkgArg} into ${pluginsDir}...`)
      execSync(`npm install --prefix ${pluginsDir} ${pkgArg}`, { stdio: 'inherit' })
      console.log(`Plugin installed. Run 'fulcrum plugin list' to verify.`)
      return
    }

    case 'link': {
      // Link a local plugin directory (development mode)
      const dirArg = args.find(a => !a.startsWith('--') && a !== 'plugin' && a !== 'link')
      if (!dirArg) {
        console.error('Usage: fulcrum plugin link <path-to-plugin-dir>')
        process.exit(1)
      }
      const pluginsDir = join(globalDataDir(), 'plugins')
      mkdirSync(pluginsDir, { recursive: true })
      const absPath = join(process.cwd(), dirArg)
      if (!existsSync(absPath)) {
        console.error(`Directory not found: ${absPath}`)
        process.exit(1)
      }
      execSync(`npm install --prefix ${pluginsDir} ${absPath}`, { stdio: 'inherit' })
      console.log(`Plugin linked from ${absPath}. Run 'fulcrum plugin list' to verify.`)
      return
    }

    case 'remove':
    case 'uninstall': {
      const pkgArg = args.find(a => !a.startsWith('--') && a !== 'plugin' && a !== command)
      if (!pkgArg) {
        console.error(`Usage: fulcrum plugin ${command} <package-name>`)
        process.exit(1)
      }
      const pluginsDir = join(globalDataDir(), 'plugins')
      console.log(`Removing ${pkgArg} from ${pluginsDir}...`)
      execSync(`npm uninstall --prefix ${pluginsDir} ${pkgArg}`, { stdio: 'inherit' })
      console.log(`Plugin removed.`)
      return
    }

    default:
      console.log(`
fulcrum plugin — manage Fulcrum plugins

USAGE
  fulcrum plugin list                         List discovered plugins
  fulcrum plugin install <package>            Install plugin from npm
  fulcrum plugin link <path>                  Link a local plugin (dev mode)
  fulcrum plugin remove <package>             Remove a globally-installed plugin

PLUGIN FORMAT
  A Fulcrum plugin is any npm package with a "fulcrum" key in package.json:
    {
      "fulcrum": {
        "type": "plugin",
        "hooks": "dist/hooks.js",   // optional: hook handler module
        "skills": "skills/",        // optional: directory of SKILL.md files
        "agents": "agents/"         // optional: directory of agent .md files
      }
    }

PLUGIN SEARCH PATH
  1. Closest project node_modules (walking up from CWD)
  2. ${globalDataDir()}/plugins/  (globally installed)
`)
      process.exit(0)
  }
}

// ── Skills management ────────────────────────────────────────────────────────
// GAP-SKILLS-9: Install skills to the Claude Code load path.
// Claude Code reads skills from ~/.claude/skills/ (user scope) or
// <project>/.claude/skills/ (project scope). `fulcrum skills install` creates
// a symlink so the bundled skills are discoverable without manual copying.

async function runSkills(): Promise<void> {
  const { symlinkSync, existsSync, mkdirSync, readdirSync, statSync } = await import('fs')
  const { join, resolve } = await import('path')

  // Locate the bundled skills directory inside the Fulcrum repo.
  // Priority: CWD/agent-integration/skills (repo context) → globalDataDir()/skills (installed context)
  function findSourceDir(): string | null {
    const cwdSource = join(process.cwd(), 'agent-integration', 'skills')
    if (existsSync(cwdSource)) return cwdSource
    const globalSource = join(globalDataDir(), 'agent-integration', 'skills')
    if (existsSync(globalSource)) return globalSource
    return null
  }

  switch (command) {
    case 'install': {
      const sourceDir = findSourceDir()
      if (!sourceDir) {
        console.error('Cannot find agent-integration/skills/ in CWD or global data dir.')
        console.error('Run this command from the Fulcrum repo root, or install Fulcrum globally first.')
        process.exit(1)
      }

      // Destination: ~/.claude/skills/ (user-scoped, always loaded by Claude Code)
      const homeDir = process.env['HOME'] ?? process.env['USERPROFILE'] ?? ''
      const destParent = join(homeDir, '.claude')
      const destLink = join(destParent, 'skills')

      // Also support project scope: <cwd>/.claude/skills/
      const projectScope = args.includes('--project')
      const targetDir = projectScope ? join(process.cwd(), '.claude') : destParent
      const targetLink = projectScope ? join(process.cwd(), '.claude', 'skills') : destLink

      if (existsSync(targetLink)) {
        const stat = statSync(targetLink, { bigint: false })
        if ((stat as unknown as { isSymbolicLink?: () => boolean }).isSymbolicLink?.()) {
          console.log(`Skills already installed at ${targetLink} (symlink).`)
          console.log(`  → ${resolve(sourceDir)}`)
        } else {
          console.log(`${targetLink} exists but is not a symlink — skipping.`)
          console.log('Remove it manually and re-run to install the skills symlink.')
        }
        return
      }

      mkdirSync(targetDir, { recursive: true })
      symlinkSync(resolve(sourceDir), targetLink)
      const count = readdirSync(sourceDir).filter(d => existsSync(join(sourceDir, d, 'SKILL.md'))).length
      console.log(`Installed ${count} Fulcrum skills → ${targetLink}`)
      console.log(`  Symlinked from: ${resolve(sourceDir)}`)
      console.log(`  Claude Code will load these skills automatically.`)
      return
    }

    case 'list': {
      const sourceDir = findSourceDir()
      if (!sourceDir) {
        console.log('No bundled skills found. Run this command from the Fulcrum repo root.')
        return
      }
      const skillDirs = readdirSync(sourceDir).filter(d => existsSync(join(sourceDir, d, 'SKILL.md')))
      console.log(`Fulcrum skills (${skillDirs.length}) — source: ${sourceDir}`)
      for (const dir of skillDirs) {
        const skillPath = join(sourceDir, dir, 'SKILL.md')
        // Extract name and description from frontmatter
        const raw = (await import('fs')).readFileSync(skillPath, 'utf8').split('\n')
        const nameLine = raw.find(l => l.startsWith('name:'))
        const descLine = raw.find(l => l.startsWith('description:'))
        const name = nameLine?.replace('name:', '').trim() ?? dir
        const desc = descLine?.replace('description:', '').trim() ?? ''
        const invocable = raw.some(l => l.includes('user-invocable: true')) ? '✓' : '○'
        console.log(`  ${invocable} ${name.padEnd(30)} ${desc.slice(0, 60)}`)
      }
      console.log('\n  ✓ = user-invocable  ○ = auto-trigger only')
      return
    }

    default:
      console.log(`
fulcrum skills — manage Fulcrum skills for Claude Code

USAGE
  fulcrum skills install             Install bundled skills to ~/.claude/skills/ (user scope)
  fulcrum skills install --project   Install to .claude/skills/ (project scope)
  fulcrum skills list                List available bundled skills

ABOUT
  Skills teach Claude Code agents how to use Fulcrum's MCP tools correctly.
  They are loaded by Claude Code from ~/.claude/skills/ or .claude/skills/.
  Run 'fulcrum skills install' once after setup to activate them.

  Source: agent-integration/skills/ in the Fulcrum repo
  Docs:   agent-integration/skills/index.md
`)
      process.exit(0)
  }
}

// ── Main dispatch ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Discover and wire plugins from project node_modules + globalDataDir()/plugins/
  // GAP-PLUGIN-1 fix: plugin-discovery.ts was fully implemented but never called.
  try {
    const plugins = discoverPlugins(process.cwd())
    const registration = registerPlugins(plugins)
    for (const hookModulePath of registration.hookModules) {
      await import(hookModulePath)
    }
  } catch {
    // Plugin discovery failure is non-fatal — continue without plugins
  }

  // Sync file-based agent definitions (GAP-AGENTDEF-5).
  // Reads .fulcrum/agent-defs/*.agent.json and globalDataDir()/agent-defs/*.agent.json.
  // Non-fatal — a missing directory or malformed file is silently skipped.
  try {
    const { loadAgentDefsFromDir } = await import('@fulcrum/core')
    loadAgentDefsFromDir(process.cwd())
  } catch {
    // DB not initialised yet at this point in some sub-commands — ignore
  }

  // Wire @fulcrum/teams implementation into core's TeamOps registry.
  // GAP-ARCH-1 fix: breaks the core ↔ teams circular dependency — core never
  // imports teams; the CLI (which depends on both) registers the impl once.
  try {
    const { createTeamOps } = await import('@fulcrum/teams')
    const { setTeamOps } = await import('@fulcrum/core')
    setTeamOps(createTeamOps())
  } catch {
    // @fulcrum/teams may not be installed — team operations will return null
  }

  if (!group || group === '--help' || group === '-h') usage()

  if (group === '--version' || group === '-v' || group === 'version') {
    const { readFileSync } = await import('fs')
    const { fileURLToPath } = await import('url')
    const path = await import('path')
    const cliPath = fileURLToPath(import.meta.url)
    const pkgPath = path.resolve(path.dirname(cliPath), '..', 'package.json')
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string }
      console.log(pkg.version)
    } catch {
      console.log('unknown')
    }
    return
  }

  // Auto-initialize the project in $CWD (opens global DB, ensures workspace +
  // project exist) before dispatching any command that touches the DB.
  // Nothing is written to $CWD. workspace_id/project_id are computed
  // deterministically from the abs path. `hook` and `serve mcp` use silent
  // mode so the init notice doesn't spam stderr on every tool call.
  const silentInit = group === 'hook' || (group === 'serve' && command === 'mcp')
  await ensureProjectInitialized({ silent: silentInit })

  if (group === 'memory') { await runMemory(); return }

  if (group === 'serve') {
    if (!command || command === '--help' || command === '-h') {
      console.log(`
fulcrum serve — long-running servers

  fulcrum serve mcp          Start MCP server (stdio JSON-RPC 2.0) — 22 control tools
  fulcrum serve mcp-http     Start MCP server (StreamableHTTP, default port 4722) [--port <n>]
  fulcrum serve monitor      Start HTTP monitor + control API [--port <n>]
  fulcrum serve all          Start both MCP and monitor servers
`)
      process.exit(0)
    }
    if (command === 'mcp') { await runServeMcp(); return }
    if (command === 'mcp-http') { await runServeMcpHttp(); return }
    if (command === 'monitor') { await runServeMonitor(); return }
    if (command === 'all') { await runServeAll(); return }
    console.error(`Unknown serve command: ${command}`)
    console.error('Usage: fulcrum serve mcp | mcp-http | monitor | all')
    process.exit(1)
  }

  if (group === 'hook') {
    const cli = command // 'claude' | 'gemini' | 'pi' | '--help' | '-h' | undefined
    if (!cli || cli === '--help' || cli === '-h') {
      await runHook(cli ?? '--help')
      return
    }
    if (cli === 'claude' || cli === 'gemini' || cli === 'pi') {
      // Optional second-level arg: 'pre' | 'post' | 'session-start' | 'session-stop' | 'pre-compact'
      // Default 'pre' for backward compatibility with existing settings.json entries.
      const phaseArg = args[2] as string | undefined

      // Session lifecycle hooks (claude-only)
      if (cli === 'claude') {
        if (phaseArg === 'session-start') { await runSessionStartHook(); return }
        if (phaseArg === 'session-stop')  { await runSessionStopHook();  return }
        if (phaseArg === 'pre-compact')   { await runPreCompactHook();   return }
      }

      const phase: HookPhase = phaseArg === 'post' ? 'post' : 'pre'
      if (phaseArg && phaseArg !== 'pre' && phaseArg !== 'post') {
        console.error(`Unknown hook phase: ${phaseArg}`)
        console.error('Usage: fulcrum hook claude|gemini|pi [pre|post|session-start|session-stop|pre-compact]')
        process.exit(1)
      }
      await runHook(cli, phase)
      return
    }
    console.error(`Unknown hook: ${cli}`)
    console.error('Usage: fulcrum hook claude|gemini|pi [pre|post]')
    process.exit(1)
  }

  if (group === 'workspaces') { await runWorkspaces(); return }
  if (group === 'projects') { await runProjects(); return }

  // J-6: 10 top-level command groups mirroring the Python reference CLI.
  // Each delegates to existing @fulcrum/* package APIs via dynamic imports
  // so we don't pay the module load cost for unused groups.
  if (group === 'task' || group === 'tasks') { await runTasks(); return }
  if (group === 'issue' || group === 'issues') { await runIssues(); return }
  if (group === 'epic' || group === 'epics') { await runEpics(); return }
  if (group === 'board') { await runBoard(); return }
  if (group === 'queue') { await runQueue(); return }
  if (group === 'sync') { await runSync(); return }
  if (group === 'team' || group === 'teams') { await runTeams(); return }
  if (group === 'workflow' || group === 'workflows') { await runWorkflows(); return }
  if (group === 'agent' || group === 'agents') { await runAgent(); return }

  if (group === 'plugin' || group === 'plugins') { await runPlugin(); return }

  if (group === 'skills' || group === 'skill') { await runSkills(); return }

  if (group === 'doctor') {
    const { results, exitCode } = runDoctor({ cwd: process.cwd(), json: args.includes('--json') })
    printDoctorResults(results, args.includes('--json'))
    process.exit(exitCode)
  }

  console.error(`Unknown group: ${group}`)
  usage()
}

// Only auto-run main() when executed as a script, not when imported as a
// module (e.g. from unit tests importing `normalizeHookEvent`). import.meta.url
// will equal the process entry path when run via `node --import tsx/esm src/index.ts`.
const isEntry = (() => {
  try {
    const entry = process.argv[1]
    if (!entry) return false
    const entryUrl = new URL(`file://${entry}`).href
    return import.meta.url === entryUrl
  } catch {
    return false
  }
})()

if (isEntry) {
  main().catch(err => {
    console.error((err as Error).message)
    process.exit(1)
  })
}
