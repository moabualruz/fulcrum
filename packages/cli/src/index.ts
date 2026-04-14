#!/usr/bin/env tsx
// packages/cli/src/index.ts — fulcrum CLI entry point

import { runMemoryInit } from '@fulcrum/memory'
import { activateL2 } from '@fulcrum/memory'

const [, , ...args] = process.argv
const [group, command] = args

function usage(): never {
  console.log(`
fulcrum — local-first agent control plane

USAGE
  fulcrum <group> <command> [options]

COMMANDS
  memory init          Initialize L0 vault + L1 SQLite, optionally enable L2
  memory accelerate    Enable or rebuild L2 (Kuzu graph + HNSW vector search)
  memory rebuild       Rebuild L1 from L0 vault files
  memory status        Show vault path and layer status

  serve mcp            Start MCP server (stdio, JSON-RPC 2.0) — 13 control-plane tools
  serve monitor        Start monitor + control API server (HTTP, default port 4721)
  serve all            Start both MCP and monitor servers

  hook claude          Run Claude PreToolUse hook (reads JSON from stdin, exits 0 or 2)
  hook gemini          Run Gemini BeforeTool hook (normalises event, same logic)
  hook pi              Run PI BeforeTool hook (normalises PI event, same logic)

  workspaces list
  workspaces create --name <name> [--id <id>]
  projects list --workspace-id <id>
  projects create --name <name> --workspace-id <id> [--id <id>]

Every command auto-initializes $CWD as a Fulcrum project on first run
(creates .fulcrum/fulcrum.db, default workspace + project, and
.fulcrum.json with deterministic IDs derived from the absolute path).
No explicit init step is required.

OPTIONS
  --vault <path>       Override vault path (default: ~/.fulcrum/vault)
  --port <n>           Override monitor port (default: from .fulcrum.json or 4721)
  --help, -h           Show this help

EXAMPLES
  fulcrum memory init
  fulcrum serve mcp
  fulcrum serve monitor --port 4721
  fulcrum hook claude
  fulcrum workspaces create --name myproject
`)
  process.exit(0)
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
      const kuzuPath = `${process.env['HOME']}/.fulcrum/kuzu`
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

export type HookCli = 'claude' | 'gemini' | 'pi'

export interface NormalizedHookEvent {
  toolName: string
  toolInput: Record<string, unknown>
  sessionId: string
  agentRole: string
  runId: string
}

/**
 * Normalize a tool-call event from any of the three supported CLI runtimes
 * (Claude Code PreToolUse, Gemini CLI BeforeTool, PI BeforeTool) into the
 * canonical Fulcrum internal shape. Unknown fields default to empty strings
 * / empty objects so downstream policy and logging code always has defined
 * values to work with.
 */
export function normalizeHookEvent(cliName: HookCli, event: Record<string, unknown>): NormalizedHookEvent {
  let toolName = ''
  let toolInput: Record<string, unknown> = {}
  let sessionId = 'unknown'
  let agentRole = ''
  let runId = ''

  if (cliName === 'claude') {
    toolName = (event['tool_name'] as string) ?? ''
    toolInput = (event['tool_input'] as Record<string, unknown>) ?? {}
    sessionId = (event['session_id'] as string) ?? 'unknown'
  } else if (cliName === 'gemini') {
    toolName = (event['tool_name'] ?? event['toolName']) as string ?? ''
    toolInput = (event['tool_input'] ?? event['toolInput'] ?? event['args'] ?? {}) as Record<string, unknown>
    sessionId = (event['session_id'] ?? event['conversationId']) as string ?? 'unknown'
  } else if (cliName === 'pi') {
    toolName = (event['toolName'] ?? event['tool_name']) as string ?? ''
    toolInput = (event['toolInput'] ?? event['tool_input'] ?? event['args'] ?? {}) as Record<string, unknown>
    sessionId = (event['sessionId'] ?? event['session_id']) as string ?? 'unknown'
    agentRole = (event['role'] as string) ?? ''
    runId = (event['runId'] ?? event['run_id']) as string ?? ''
  }

  return { toolName, toolInput, sessionId, agentRole, runId }
}

async function runHook(cliName: string): Promise<void> {
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
      payload: { tool_name: toolName, tool_input_keys: Object.keys(toolInput), session_id: sessionId, run_id: runId || undefined },
    })
  } catch { /* logging best-effort */ }

  // Policy check — only enforce team-invoke restriction
  const isTeamInvoke = toolName.includes('invoke_team') || toolName.includes('team_invoke')
  if (isTeamInvoke && agentRole) {
    const { canInvokeTeams } = await import('@fulcrum/core')
    type AgentRole = Parameters<typeof canInvokeTeams>[0]
    if (!canInvokeTeams(agentRole as AgentRole)) {
      process.stderr.write(`[fulcrum hook] Tool call denied: role '${agentRole}' lacks can_invoke_teams\n`)
      process.exit(2)
    }
  }

  // Allow
  process.exit(0)
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

async function runServeMcp(): Promise<void> {
  const { getDb, runMigrations, loadConfig, createTask, updateTask, listTasks,
    startAgentRun, heartbeatAgentRun, completeAgentRun, blockAgentRun,
    getAgentRunStatus, writeMemory, recallMemory,
    buildCosContext, getWorkspaceStatus, listAgentProfiles } = await import('@fulcrum/core')

  const config = loadConfig()
  const db = getDb()
  runMigrations(db)

  await warmEmbedding()

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

  // ── MCP Tool definitions ──
  const tools = [
    {
      name: 'list_tasks',
      description: 'List tasks for a project, optionally filtered by status.',
      inputSchema: {
        type: 'object',
        properties: {
          project_id: { type: 'string', description: 'Project ID' },
          workspace_id: { type: 'string', description: 'Workspace ID' },
          status: { type: 'string', description: 'Filter by status (queued, running, blocked, completed)' },
          limit: { type: 'number', description: 'Max results (default 40)' },
        },
        required: ['project_id', 'workspace_id'],
      },
    },
    {
      name: 'create_task',
      description: 'Create a new task in the project.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          project_id: { type: 'string' },
          workspace_id: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'none'] },
          assigned_to: { type: 'string' },
          done_criteria: { type: 'string' },
        },
        required: ['title', 'project_id', 'workspace_id'],
      },
    },
    {
      name: 'update_task',
      description: "Update a task's status, note, or assignment.",
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string' },
          status: { type: 'string' },
          note: { type: 'string' },
          assigned_to: { type: 'string' },
        },
        required: ['task_id'],
      },
    },
    {
      name: 'recall_memory',
      description: 'Recall relevant memories from the project memory store by semantic query.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          workspace_id: { type: 'string' },
          project_id: { type: 'string' },
          limit: { type: 'number' },
        },
        required: ['query', 'workspace_id', 'project_id'],
      },
    },
    {
      name: 'write_memory',
      description: 'Write a memory note to the project memory store.',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string' },
          workspace_id: { type: 'string' },
          project_id: { type: 'string' },
          title: { type: 'string' },
          tags: { type: 'string', description: 'Comma-separated tags' },
        },
        required: ['content', 'workspace_id', 'project_id'],
      },
    },
    {
      name: 'list_agent_profiles',
      description: 'List available agent roles/profiles.',
      inputSchema: { type: 'object', properties: {}, required: [] },
    },
    {
      name: 'get_agent_run_status',
      description: 'Get the live status of a running agent run.',
      inputSchema: {
        type: 'object',
        properties: { run_id: { type: 'string' } },
        required: ['run_id'],
      },
    },
    {
      name: 'start_agent_run',
      description: 'Register a PI agent run starting. Call at task start — returns run_id.',
      inputSchema: {
        type: 'object',
        properties: {
          task_id: { type: 'string', description: 'Task ID (auto-creates stub if not found)' },
          agent_role: { type: 'string' },
          workspace_id: { type: 'string' },
          project_id: { type: 'string' },
          worktree_path: { type: 'string' },
          pi_run_id: { type: 'string', description: 'Optional custom run ID' },
        },
        required: ['agent_role', 'workspace_id'],
      },
    },
    {
      name: 'heartbeat_agent_run',
      description: 'Send a heartbeat for a running agent. Call every ~30s.',
      inputSchema: {
        type: 'object',
        properties: {
          run_id: { type: 'string' },
          workspace_id: { type: 'string' },
          current_step: { type: 'string' },
          progress_pct: { type: 'number' },
        },
        required: ['run_id', 'workspace_id'],
      },
    },
    {
      name: 'complete_agent_run',
      description: 'Mark a PI agent run as completed.',
      inputSchema: {
        type: 'object',
        properties: {
          run_id: { type: 'string' },
          workspace_id: { type: 'string' },
          output_summary: { type: 'string' },
          artifact_paths: { type: 'string', description: 'Comma-separated artifact file paths' },
        },
        required: ['run_id', 'workspace_id'],
      },
    },
    {
      name: 'block_agent_run',
      description: 'Mark a PI agent run as blocked.',
      inputSchema: {
        type: 'object',
        properties: {
          run_id: { type: 'string' },
          workspace_id: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['run_id', 'workspace_id', 'reason'],
      },
    },
    {
      name: 'build_cos_context',
      description: 'Build a world-state snapshot for the Chief of Staff system prompt.',
      inputSchema: {
        type: 'object',
        properties: {
          goal: { type: 'string', description: 'Goal description (informational)' },
          project_id: { type: 'string' },
          workspace_id: { type: 'string' },
          max_tasks: { type: 'number' },
          max_events: { type: 'number' },
        },
        required: ['project_id', 'workspace_id'],
      },
    },
    {
      name: 'get_workspace_status',
      description: 'Get full workspace status: running agents, blockers, WIP count, queue depth.',
      inputSchema: {
        type: 'object',
        properties: { workspace_id: { type: 'string' } },
        required: ['workspace_id'],
      },
    },
  ]

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
      const memories = await recallMemory({
        query: a['query'] as string,
        workspace_id: a['workspace_id'] as string,
        project_id: a['project_id'] as string,
        limit: (a['limit'] as number | undefined) ?? 10,
      })
      return memories.map(m => ({ content: m.content.slice(0, 500), score: 0.0, tags: m.tags }))
    }

    if (name === 'write_memory') {
      ensureWorkspace(a['workspace_id'] as string)
      ensureProject(a['workspace_id'] as string, a['project_id'] as string)
      const tagList = ((a['tags'] as string | undefined) ?? '').split(',').map(t => t.trim()).filter(Boolean)
      const memory = await writeMemory({
        content: a['content'] as string,
        workspace_id: a['workspace_id'] as string,
        project_id: a['project_id'] as string,
        title: (a['title'] as string | undefined) ?? (a['content'] as string).slice(0, 80),
        tags: tagList,
      })
      return { saved: true, memory_id: memory.memory_id, project_id: a['project_id'], tags: tagList }
    }

    if (name === 'list_agent_profiles') {
      return await listAgentProfiles()
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
      const paths = ((a['artifact_paths'] as string | undefined) ?? '').split(',').map(p => p.trim()).filter(Boolean)
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

    throw new Error(`Unknown tool: ${name}`)
  }

  // ── JSON-RPC 2.0 stdio server ──
  const { createInterface } = await import('readline')
  const rl = createInterface({ input: process.stdin, terminal: false })

  function respond(id: number | string | null, result: unknown): void {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n')
  }

  function respondError(id: number | string | null, code: number, message: string): void {
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n')
  }

  process.stderr.write('[fulcrum mcp] fulcrum MCP server started (stdio)\n')

  rl.on('line', async (line: string) => {
    let msg: { jsonrpc: string; method: string; params?: Record<string, unknown>; id?: number | string | null }
    try {
      msg = JSON.parse(line) as typeof msg
    } catch {
      return // Ignore parse errors
    }

    const { method, params, id } = msg

    if (method === 'initialize') {
      respond(id ?? null, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'fulcrum', version: '1.0.0' },
      })
      return
    }

    // Notifications (no response needed)
    if (method === 'notifications/initialized' || id === undefined || id === null) {
      return
    }

    if (method === 'tools/list') {
      respond(id, { tools })
      return
    }

    if (method === 'tools/call') {
      const toolName = (params?.['name'] ?? '') as string
      const toolArgs = ((params?.['arguments'] ?? {}) as Record<string, unknown>)
      try {
        const result = await handleToolCall(toolName, toolArgs)
        respond(id, { content: [{ type: 'text', text: JSON.stringify(result) }] })
      } catch (err) {
        respond(id, {
          content: [{ type: 'text', text: JSON.stringify({ error: (err as Error).message }) }],
          isError: true,
        })
      }
      return
    }

    if (method === 'ping') {
      respond(id, {})
      return
    }

    respondError(id ?? null, -32601, `Method not found: ${method}`)
  })

  // Keep alive
  await new Promise(() => { /* run until killed */ })
}

async function runServeMonitor(): Promise<void> {
  const { startMonitorServer } = await import('@fulcrum/monitor')
  const { getDb, runMigrations, loadConfig } = await import('@fulcrum/core')

  const config = loadConfig()
  const db = getDb()
  runMigrations(db)

  await warmEmbedding()

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

  const server = startMonitorServer({ workspace_id: config.workspace_id || undefined })
  await server.start()
  console.error(`[fulcrum] Monitor running on http://127.0.0.1:${server.port}`)

  await runServeMcp()
}

// ── Workspace/project commands ────────────────────────────────────────────────

async function runWorkspaces(): Promise<void> {
  const { listWorkspaces, createWorkspace } = await import('@fulcrum/core')
  const sub = command // e.g. 'list' or 'create'

  if (!sub || sub === 'list') {
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

  if (!sub || sub === 'list') {
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

// ── Auto project initialization ───────────────────────────────────────────────
//
// Every fulcrum command that touches the DB runs through this first. It:
//   1. creates $CWD/.fulcrum/ and runs migrations on fulcrum.db
//   2. ensures a default workspace + project exist, with deterministic IDs
//      derived from the absolute path of $CWD (so the same project always
//      resolves to the same IDs across sessions, but moving the project
//      starts a clean slate)
//   3. writes $CWD/.fulcrum.json with those IDs + monitor_port so the PI
//      cockpit, Gemini extension, and any child tool can discover them
// Idempotent: safe to call on every invocation. Prints a one-line notice
// on first-time init (to stderr so it never corrupts MCP stdio traffic).

let _projectInitialized = false
let _projectIds: { workspace_id: string; project_id: string } | null = null

function currentProjectIds(): { workspace_id: string; project_id: string } {
  if (!_projectIds) throw new Error('ensureProjectInitialized() must be called before accessing project IDs')
  return _projectIds
}

async function ensureProjectInitialized(opts: { silent?: boolean } = {}): Promise<{ workspace_id: string; project_id: string }> {
  if (_projectIds) return _projectIds
  const path = await import('path')
  const fs = await import('fs')
  const crypto = await import('crypto')
  const { getDb, runMigrations, getWorkspace, getProject, createWorkspace, createProject } = await import('@fulcrum/core')

  const cwd = process.cwd()

  // Ensure .fulcrum/ exists and migrations are current
  fs.mkdirSync(path.join(cwd, '.fulcrum'), { recursive: true })
  const db = getDb()
  runMigrations(db)

  // Deterministic IDs: sha256[:12] of the absolute path, prefixed with a
  // sanitized directory name. Stable across runs, unique across projects.
  const absPath = path.resolve(cwd)
  const hash = crypto.createHash('sha256').update(absPath).digest('hex').slice(0, 12)
  const sanitizedName = path.basename(absPath).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 24) || 'project'
  const workspace_id = `ws_${sanitizedName}_${hash}`
  const project_id = `proj_${sanitizedName}_${hash}`

  // Route workspace/project creation through core CRUD so FK/enum validation
  // runs in one place. Both calls are effectively idempotent: we check
  // existence first, and createWorkspace itself is INSERT OR IGNORE.
  const existingWs = await getWorkspace(workspace_id)
  const existingProj = await getProject(project_id)
  if (!existingWs) await createWorkspace({ workspace_id, name: sanitizedName })
  if (!existingProj) await createProject({ workspace_id, project_id, name: sanitizedName })

  // Write/update .fulcrum.json so PI cockpit and monitor pick up the same IDs
  const configPath = path.join(cwd, '.fulcrum.json')
  let config: Record<string, unknown> = {}
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>
    } catch {
      // malformed — overwrite with a clean one
      config = {}
    }
  }
  const needsWrite =
    config['workspace_id'] !== workspace_id ||
    config['project_id'] !== project_id ||
    typeof config['monitor_port'] !== 'number'
  if (needsWrite) {
    config['workspace_id'] = workspace_id
    config['project_id'] = project_id
    config['monitor_port'] = (typeof config['monitor_port'] === 'number' ? config['monitor_port'] : 4721)
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8')
  }

  // Announce first-time init on stderr (never stdout — MCP stdio is strict)
  const firstRun = !existingWs || !existingProj || needsWrite
  if (firstRun && !opts.silent && !_projectInitialized) {
    process.stderr.write(`[fulcrum] initialized project "${sanitizedName}" (${workspace_id})\n`)
  }
  _projectInitialized = true
  _projectIds = { workspace_id, project_id }
  return _projectIds
}

// ── Main dispatch ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
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

  // Auto-initialize the project in $CWD (creates .fulcrum/fulcrum.db,
  // default workspace + project, and .fulcrum.json) before dispatching
  // any command that touches the DB. The user never needs an explicit
  // init step. `hook` and `serve mcp` ask for silent mode so the init
  // notice doesn't spam stderr on every Claude/Gemini tool call.
  const silentInit = group === 'hook' || (group === 'serve' && command === 'mcp')
  await ensureProjectInitialized({ silent: silentInit })

  if (group === 'memory') { await runMemory(); return }

  if (group === 'serve') {
    if (command === 'mcp') { await runServeMcp(); return }
    if (command === 'monitor') { await runServeMonitor(); return }
    if (command === 'all') { await runServeAll(); return }
    console.error(`Unknown serve command: ${command}`)
    console.error('Usage: fulcrum serve mcp | monitor | all')
    process.exit(1)
  }

  if (group === 'hook') {
    const cli = command // 'claude' | 'gemini' | 'pi'
    if (cli === 'claude' || cli === 'gemini' || cli === 'pi') {
      await runHook(cli)
      return
    }
    console.error(`Unknown hook: ${cli}`)
    console.error('Usage: fulcrum hook claude | gemini | pi')
    process.exit(1)
  }

  if (group === 'workspaces') { await runWorkspaces(); return }
  if (group === 'projects') { await runProjects(); return }

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
