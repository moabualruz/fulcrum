// packages/cli/src/tool-registry.ts
// Unified handler registry — all 23 MCP tool implementations in one place.
//
// Both the MCP server and CLI commands (`fulcrum tool exec`) dispatch through here.
// This eliminates the divergence between runServeMcp() and runServeMcpHttp(),
// and makes every tool independently callable from hooks, CI, and shell scripts
// without a live MCP server.
//
// Pattern: each handler is a pure (args, deps) function.
//   args — raw tool call arguments (caller-supplied; may omit workspace_id / project_id)
//   deps — resolved server context (db, workspace_id, project_id from cwd at startup)
//
// Handlers default workspace_id and project_id from deps when args omit them.

import { getDb } from '@fulcrum/core'
import type { Db } from '@fulcrum/core'
import { TOOL_SCHEMA_MAP } from './mcp-tools.js'
import type { ToolSchema } from './mcp-tools.js'

// ─────────────────────────── Interfaces ────────────────────────────────────

export interface HandlerDeps {
  /** better-sqlite3 Database, initialized once at server startup. */
  db: Db
  /** Workspace ID derived from cwd via projectIdsFromPath() at startup. */
  workspace_id: string
  /** Project ID derived from cwd via projectIdsFromPath() at startup. */
  project_id: string
}

export interface ToolCapabilities {
  /** True if the handler never writes persistent state. Mirrors schema readOnlyHint. */
  readOnly: boolean
  /** True if the operation is hard to reverse (e.g. block_agent_run, invoke_team). */
  destructive: boolean
  /**
   * True if the hook layer already calls this tool's logic directly (in-process).
   * Used by --profile hook-only to subtract these from the MCP tool list.
   * Hook-capable platforms gain nothing from these tools via MCP — hooks handle them.
   */
  hookEquivalent: boolean
  /**
   * Minimum AgentRole slug required to call this tool (undefined = any role).
   * Enforced by --profile <role> filtering via agent_definitions.tools_allow / tools_deny.
   */
  minRole?: string
}

export interface RegistryEntry {
  /**
   * MCP tool schema. Undefined for internal tools not exposed to MCP clients
   * (e.g. get_task — called by the MCP resource handler, not registered as a tool).
   */
  schema: ToolSchema | undefined
  capabilities: ToolCapabilities
  handler: (args: Record<string, unknown>, deps: HandlerDeps) => Promise<unknown>
}

// ─────────────────────────── Registry ────────────────────────────────────────

export const TOOL_REGISTRY = new Map<string, RegistryEntry>()

// ─────────────────────────── Helpers ────────────────────────────────────────

/** Build a HandlerDeps context from the cwd-derived workspace/project IDs. */
export function buildDeps(workspace_id: string, project_id: string): HandlerDeps {
  return { db: getDb(), workspace_id, project_id }
}

function ensureWorkspace(db: Db, wsId: string): void {
  const existing = db.prepare('SELECT workspace_id FROM workspaces WHERE workspace_id = ?').get(wsId)
  if (!existing) {
    const now = new Date().toISOString()
    db.prepare('INSERT OR IGNORE INTO workspaces (workspace_id, name, status, created_at) VALUES (?, ?, ?, ?)').run(wsId, wsId, 'active', now)
  }
}

function ensureProject(db: Db, wsId: string, projId: string): void {
  const existing = db.prepare('SELECT project_id FROM projects WHERE project_id = ?').get(projId)
  if (!existing) {
    const now = new Date().toISOString()
    db.prepare('INSERT OR IGNORE INTO projects (project_id, workspace_id, name, created_at) VALUES (?, ?, ?, ?)').run(projId, wsId, projId, now)
  }
}

// Monitor probe — used by get_current_context. Cached per URL with a 15s TTL.
const _monitorProbeCache = new Map<string, { running: boolean; ts: number }>()
const MONITOR_PROBE_TTL_MS = 15_000
const MONITOR_PROBE_TIMEOUT_MS = 200

export async function probeMonitor(url: string): Promise<boolean> {
  const now = Date.now()
  const cached = _monitorProbeCache.get(url)
  if (cached && (now - cached.ts) < MONITOR_PROBE_TTL_MS) return cached.running

  let running = false
  try {
    const ctrl = new AbortController()
    const timeout = setTimeout(() => ctrl.abort(), MONITOR_PROBE_TIMEOUT_MS)
    const resp = await fetch(`${url}/status`, { signal: ctrl.signal })
    clearTimeout(timeout)
    running = resp.ok
  } catch { /* offline — not an error */ }

  _monitorProbeCache.set(url, { running, ts: now })
  return running
}

export function resetMonitorProbeCache(): void {
  _monitorProbeCache.clear()
}

// ─────────────────────────── MCP filtering ────────────────────────────────────

/**
 * Build a filter function for `McpServerOptions.filter` based on a profile string.
 * The predicate receives a ToolSchema and returns true if the tool should be served.
 *
 * Supported profiles:
 *   'hook-only'   — remove tools where hookEquivalent=true (recall_memory, write_memory,
 *                   get_current_context). Recommended for Claude Code which has hooks.
 *   '<role-slug>' — enforce agent_definitions.tools_allow / tools_deny for the role.
 *                   Requires P0-A (CORE-001 fix) to be effective.
 *                   If the role definition is not found, warns loudly and returns no filter.
 *
 * @returns A predicate to pass to McpServerOptions.filter, or undefined (no filter = all tools).
 */
export async function buildProfileFilter(
  profile: string,
): Promise<((schema: import('./mcp-tools.js').ToolSchema) => boolean) | undefined> {
  if (!profile) return undefined

  if (profile === 'hook-only') {
    return (schema: import('./mcp-tools.js').ToolSchema) => {
      const entry = TOOL_REGISTRY.get(schema.name)
      return !entry?.capabilities.hookEquivalent
    }
  }

  // Role-based filter: load tools_allow / tools_deny from agent_definitions
  const { getAgentDefinition } = await import('@fulcrum/core')
  const def = getAgentDefinition(profile)
  if (!def) {
    process.stderr.write(
      `[fulcrum/mcp] WARNING: --profile '${profile}' — no agent definition found for this role.\n` +
      `  Role-based tool filtering is DISABLED; all 23 tools will be served.\n` +
      `  To fix: verify CORE-001 is applied and the role exists in agent_definitions.\n` +
      `  Run: fulcrum agent definition list\n`,
    )
    return undefined
  }

  const allow = def.tools_allow  // null = no restriction
  const deny = new Set(def.tools_deny ?? [])

  return (schema: import('./mcp-tools.js').ToolSchema) => {
    if (deny.has(schema.name)) return false
    if (allow !== null && !allow.includes(schema.name)) return false
    return true
  }
}

// ─────────────────────────── Tool registrations ────────────────────────────

// ── get_task (internal — not in TOOL_SCHEMAS, used by the MCP resource handler) ──
TOOL_REGISTRY.set('get_task', {
  schema: undefined,
  capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
  handler: async (args, deps) => {
    const task = deps.db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(args['task_id'] as string) as Record<string, unknown> | undefined
    if (!task) return { error: 'not_found', task_id: args['task_id'] }
    return {
      task_id: task['task_id'],
      title: task['title'],
      description: task['description'] ?? '',
      status: task['status'],
      priority: task['priority'],
      assigned_to: task['assigned_to'] ?? '',
      done_criteria: task['done_criteria'] ?? '',
    }
  },
})

// ── Task tools ──────────────────────────────────────────────────────────────

TOOL_REGISTRY.set('list_tasks', {
  schema: TOOL_SCHEMA_MAP.get('list_tasks'),
  capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
  handler: async (args, deps) => {
    const { listTasks } = await import('@fulcrum/core')
    const ws = (args['workspace_id'] as string | undefined) ?? deps.workspace_id
    const proj = (args['project_id'] as string | undefined) ?? deps.project_id
    const tasks = await listTasks({
      workspace_id: ws,
      project_id: proj,
      status: args['status'] as Parameters<typeof listTasks>[0]['status'],
    })
    return tasks.slice(0, (args['limit'] as number | undefined) ?? 40).map(t => ({
      task_id: t.task_id,
      title: t.title,
      description: t.description ?? '',
      status: t.status,
      priority: t.priority,
      assigned_to: t.assigned_to ?? '',
      done_criteria: t.done_criteria ?? '',
      blockers: t.blockers,
    }))
  },
})

TOOL_REGISTRY.set('create_task', {
  schema: TOOL_SCHEMA_MAP.get('create_task'),
  capabilities: { readOnly: false, destructive: false, hookEquivalent: false },
  handler: async (args, deps) => {
    const { createTask } = await import('@fulcrum/core')
    const ws = (args['workspace_id'] as string | undefined) ?? deps.workspace_id
    const proj = (args['project_id'] as string | undefined) ?? deps.project_id
    ensureWorkspace(deps.db, ws)
    ensureProject(deps.db, ws, proj)
    const task = await createTask({
      title: args['title'] as string,
      project_id: proj,
      workspace_id: ws,
      description: args['description'] as string | undefined,
      priority: args['priority'] as Parameters<typeof createTask>[0]['priority'],
      assigned_to: args['assigned_to'] as string | undefined,
      done_criteria: args['done_criteria'] as string | undefined,
    })
    return {
      task_id: task.task_id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      assigned_to: task.assigned_to ?? '',
    }
  },
})

TOOL_REGISTRY.set('update_task', {
  schema: TOOL_SCHEMA_MAP.get('update_task'),
  capabilities: { readOnly: false, destructive: false, hookEquivalent: false },
  handler: async (args) => {
    const { updateTask } = await import('@fulcrum/core')
    // updateTask doesn't need workspace_id — task_id is globally unique in the DB
    const task = await updateTask({
      task_id: args['task_id'] as string,
      status: args['status'] as Parameters<typeof updateTask>[0]['status'],
      note: args['note'] as string | undefined,
      assigned_to: args['assigned_to'] as string | undefined,
    })
    return {
      task_id: task.task_id,
      updated: true,
      changes: Object.keys(args).filter(k => k !== 'task_id'),
    }
  },
})

// ── Memory tools ────────────────────────────────────────────────────────────

TOOL_REGISTRY.set('recall_memory', {
  schema: TOOL_SCHEMA_MAP.get('recall_memory'),
  capabilities: { readOnly: true, destructive: false, hookEquivalent: true },
  handler: async (args, deps) => {
    const { recallMemory } = await import('@fulcrum/memory')
    const ws = (args['workspace_id'] as string | undefined) ?? deps.workspace_id
    const maxChars = (args['max_chars'] as number | undefined) ?? 500
    const memories = await recallMemory({
      query: args['query'] as string,
      workspace_id: ws,
      project_id: args['project_id'] as string | undefined,
      limit: (args['limit'] as number | undefined) ?? 10,
      offset: (args['offset'] as number | undefined) ?? 0,
      mode: 'full',
      query_scope: args['query_scope'] as 'session' | 'project' | 'workspace' | 'global' | undefined,
      session_id: args['session_id'] as string | undefined,
    } as Parameters<typeof recallMemory>[0])
    return (memories as Array<{ id?: string; content?: string; tags?: string[]; recall_score?: number; source?: string }>)
      .map(m => ({
        id: m.id,
        content: (m.content ?? '').slice(0, maxChars),
        score: m.recall_score ?? 0.0,
        tags: m.tags ?? [],
        source: m.source ?? 'manual',
      }))
  },
})

TOOL_REGISTRY.set('write_memory', {
  schema: TOOL_SCHEMA_MAP.get('write_memory'),
  capabilities: { readOnly: false, destructive: false, hookEquivalent: true },
  handler: async (args, deps) => {
    const { writeMemory } = await import('@fulcrum/memory')
    const ws = (args['workspace_id'] as string | undefined) ?? deps.workspace_id
    const proj = (args['project_id'] as string | undefined) ?? deps.project_id
    ensureWorkspace(deps.db, ws)
    ensureProject(deps.db, ws, proj)
    const rawTags = args['tags']
    const tagList = Array.isArray(rawTags)
      ? rawTags.map(String).filter(Boolean)
      : ((rawTags as string | undefined) ?? '').split(',').map(t => t.trim()).filter(Boolean)
    const content = args['content'] as string
    const title = (args['title'] as string | undefined) ?? content.slice(0, 80)
    const memory = await writeMemory({
      content,
      workspace_id: ws,
      project_id: proj,
      title,
      summary: title,
      scope: 'project',
      kind: 'fact',
      tags: tagList,
    } as Parameters<typeof writeMemory>[0])
    return { saved: true, memory_id: memory.memory_id, project_id: proj, tags: tagList }
  },
})

// ── Agent profile tools ─────────────────────────────────────────────────────

TOOL_REGISTRY.set('list_agent_profiles', {
  schema: TOOL_SCHEMA_MAP.get('list_agent_profiles'),
  capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
  handler: async (args) => {
    const { listAgentProfiles } = await import('@fulcrum/core')
    return await listAgentProfiles({ workspace_id: args['workspace_id'] as string | undefined })
  },
})

TOOL_REGISTRY.set('create_agent_profile', {
  schema: TOOL_SCHEMA_MAP.get('create_agent_profile'),
  capabilities: { readOnly: false, destructive: false, hookEquivalent: false },
  handler: async (args, deps) => {
    const { createAgentProfile } = await import('@fulcrum/core')
    const ws = (args['workspace_id'] as string | undefined) ?? deps.workspace_id
    return await createAgentProfile({
      workspace_id: ws,
      name: args['name'] as string,
      description: args['description'] as string,
      base_role: args['base_role'] as Parameters<typeof createAgentProfile>[0]['base_role'],
      system_prompt: args['system_prompt'] as string | undefined,
      capabilities: args['capabilities'] as Record<string, unknown> | undefined,
      created_by: args['created_by'] as string | undefined,
    })
  },
})

// ── Agent run tools ─────────────────────────────────────────────────────────

TOOL_REGISTRY.set('get_agent_run_status', {
  schema: TOOL_SCHEMA_MAP.get('get_agent_run_status'),
  capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
  handler: async (args) => {
    const { getAgentRunStatus } = await import('@fulcrum/core')
    const run = await getAgentRunStatus({ run_id: args['run_id'] as string })
    return {
      run_id: run.run_id,
      status: run.status,
      role: run.role,
      current_step: run.current_step,
      progress_pct: run.progress_pct,
    }
  },
})

TOOL_REGISTRY.set('start_agent_run', {
  schema: TOOL_SCHEMA_MAP.get('start_agent_run'),
  capabilities: { readOnly: false, destructive: false, hookEquivalent: false },
  handler: async (args, deps) => {
    const { createTask, startAgentRun } = await import('@fulcrum/core')
    const ws = (args['workspace_id'] as string | undefined) ?? deps.workspace_id
    const proj = (args['project_id'] as string | undefined) ?? deps.project_id
    ensureWorkspace(deps.db, ws)
    ensureProject(deps.db, ws, proj)

    let task_id = args['task_id'] as string | undefined
    if (!task_id) {
      const stub = await createTask({ title: `[auto] ${args['agent_role']} run`, workspace_id: ws, project_id: proj })
      task_id = stub.task_id
    } else {
      const existing = deps.db.prepare('SELECT task_id FROM tasks WHERE task_id = ?').get(task_id)
      if (!existing) {
        const stub = await createTask({ title: `[auto] ${args['agent_role']} run`, workspace_id: ws, project_id: proj })
        task_id = stub.task_id
      }
    }

    const role = args['agent_role'] as string
    const run = await startAgentRun({
      task_id,
      role: role as Parameters<typeof startAgentRun>[0]['role'],
      workspace_id: ws,
      agent_id: `pi/${role}`,
      pi_profile: role,
    })

    if (args['dispatch'] === true) {
      const { dispatchClaudeCode } = await import('@fulcrum/worker')
      const { pid } = dispatchClaudeCode({
        run_id: run.run_id,
        task_id,
        workspace_id: ws,
        project_id: proj,
        agent_role: role,
        model: args['model'] as string | undefined,
      })
      return { run_id: run.run_id, status: run.status, dispatched: true, pid }
    }

    return { run_id: run.run_id, status: run.status }
  },
})

TOOL_REGISTRY.set('heartbeat_agent_run', {
  schema: TOOL_SCHEMA_MAP.get('heartbeat_agent_run'),
  capabilities: { readOnly: false, destructive: false, hookEquivalent: false },
  handler: async (args) => {
    const { heartbeatAgentRun } = await import('@fulcrum/core')
    await heartbeatAgentRun({
      run_id: args['run_id'] as string,
      current_step: (args['current_step'] as string | undefined) ?? '',
      progress_pct: (args['progress_pct'] as number | undefined) ?? 0,
    })
    return { run_id: args['run_id'], ok: true }
  },
})

TOOL_REGISTRY.set('complete_agent_run', {
  schema: TOOL_SCHEMA_MAP.get('complete_agent_run'),
  capabilities: { readOnly: false, destructive: true, hookEquivalent: false },
  handler: async (args) => {
    const { completeAgentRun } = await import('@fulcrum/core')
    const rawPaths = args['artifact_paths']
    const paths = Array.isArray(rawPaths)
      ? rawPaths.map(String).filter(Boolean)
      : ((rawPaths as string | undefined) ?? '').split(',').map(p => p.trim()).filter(Boolean)
    const run = await completeAgentRun({
      run_id: args['run_id'] as string,
      output_summary: (args['output_summary'] as string | undefined) ?? '',
      artifacts: paths.length > 0 ? { files_changed: paths } : undefined,
    })
    return { run_id: run.run_id, status: run.status }
  },
})

TOOL_REGISTRY.set('block_agent_run', {
  schema: TOOL_SCHEMA_MAP.get('block_agent_run'),
  capabilities: { readOnly: false, destructive: true, hookEquivalent: false },
  handler: async (args) => {
    const { blockAgentRun } = await import('@fulcrum/core')
    const run = await blockAgentRun({ run_id: args['run_id'] as string, reason: args['reason'] as string })
    return { run_id: run.run_id, status: run.status, reason: run.blocker }
  },
})

// ── Workspace / context tools ───────────────────────────────────────────────

TOOL_REGISTRY.set('build_cos_context', {
  schema: TOOL_SCHEMA_MAP.get('build_cos_context'),
  capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
  handler: async (args, deps) => {
    const { buildCosContext } = await import('@fulcrum/core')
    const ws = (args['workspace_id'] as string | undefined) ?? deps.workspace_id
    const proj = (args['project_id'] as string | undefined) ?? deps.project_id
    const ctx = await buildCosContext({ workspace_id: ws, project_id: proj })
    return { context_markdown: ctx, project_id: proj, workspace_id: ws }
  },
})

TOOL_REGISTRY.set('get_workspace_status', {
  schema: TOOL_SCHEMA_MAP.get('get_workspace_status'),
  capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
  handler: async (args, deps) => {
    const { getWorkspaceStatus } = await import('@fulcrum/core')
    const ws = (args['workspace_id'] as string | undefined) ?? deps.workspace_id
    const status = await getWorkspaceStatus({ workspace_id: ws })
    return {
      workspace_id: ws,
      active_runs: status.running_runs.length,
      blocked_runs: status.blocked_runs.length,
      wip_count: status.wip_count,
      queued_tasks: status.queued_tasks,
      runs: status.running_runs.slice(0, 10).map(r => ({
        run_id: r.run_id,
        role: r.role,
        status: r.status,
        task_id: r.task_id,
      })),
      blockers: status.blocked_runs.slice(0, 5).map(r => ({
        run_id: r.run_id,
        reason: r.blocker ?? '?',
      })),
    }
  },
})

TOOL_REGISTRY.set('get_current_context', {
  schema: TOOL_SCHEMA_MAP.get('get_current_context'),
  capabilities: { readOnly: true, destructive: false, hookEquivalent: true },
  handler: async (_args, deps) => {
    const { TOOL_SCHEMAS } = await import('./mcp-tools.js')
    const { listTasks } = await import('@fulcrum/core')
    const monitorPort = process.env['FULCRUM_MONITOR_PORT'] ?? '4721'
    const monitorUrl = `http://localhost:${monitorPort}`
    const monitorRunning = await probeMonitor(monitorUrl)

    let suggestedNextCall = 'mcp__fulcrum__list_tasks'
    try {
      const tasks = await listTasks({ workspace_id: deps.workspace_id, limit: 1 })
      if (tasks.length === 0) suggestedNextCall = 'mcp__fulcrum__create_task'
    } catch { /* DB not ready — fall through */ }

    return {
      workspace_id: deps.workspace_id,
      project_id: deps.project_id,
      cwd: process.cwd(),
      readiness: {
        tools_available: TOOL_SCHEMAS.length,
        monitor_url: monitorUrl,
        monitor_running: monitorRunning,
        suggested_next_call: suggestedNextCall,
      },
    }
  },
})

// ── Team tools ──────────────────────────────────────────────────────────────

TOOL_REGISTRY.set('create_team_template', {
  schema: TOOL_SCHEMA_MAP.get('create_team_template'),
  capabilities: { readOnly: false, destructive: false, hookEquivalent: false },
  handler: async (args) => {
    const { getTeamOps } = await import('@fulcrum/core')
    const fn = getTeamOps()['createTeamTemplate'] as (input: Record<string, unknown>) => Promise<unknown>
    return await fn({
      name: args['name'] as string,
      description: args['description'] as string | undefined,
      slots: args['slots'] as unknown[],
      policy: args['policy'] as Record<string, unknown> | undefined,
    })
  },
})

TOOL_REGISTRY.set('invoke_team', {
  schema: TOOL_SCHEMA_MAP.get('invoke_team'),
  capabilities: { readOnly: false, destructive: true, hookEquivalent: false, minRole: 'chief_of_staff' },
  handler: async (args) => {
    const { getTeamOps } = await import('@fulcrum/core')
    const fn = getTeamOps()['invokeTeam'] as (input: Record<string, unknown>) => Promise<unknown>
    return await fn({
      template_id: args['template_id'] as string,
      workspace_id: args['workspace_id'] as string,
      project_id: args['project_id'] as string | undefined,
      purpose: args['purpose'] as string,
      task_id: args['task_id'] as string | undefined,
      caller_agent_id: args['caller_agent_id'] as string,
      caller_role: args['caller_role'] as string,
      initial_slots: args['initial_slots'] as Record<string, string[]> | undefined,
    })
  },
})

TOOL_REGISTRY.set('list_team_templates', {
  schema: TOOL_SCHEMA_MAP.get('list_team_templates'),
  capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
  handler: async (args) => {
    const { getTeamOps } = await import('@fulcrum/core')
    const fn = getTeamOps()['listTeamTemplates'] as (input?: Record<string, unknown>) => Promise<unknown[]>
    return await fn({
      limit: (args['limit'] as number | undefined) ?? 50,
      offset: (args['offset'] as number | undefined) ?? 0,
    })
  },
})

TOOL_REGISTRY.set('list_team_instances', {
  schema: TOOL_SCHEMA_MAP.get('list_team_instances'),
  capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
  handler: async (args, deps) => {
    const { getTeamOps } = await import('@fulcrum/core')
    const fn = getTeamOps()['listTeamInstances'] as (input: Record<string, unknown>) => Promise<unknown[]>
    const ws = (args['workspace_id'] as string | undefined) ?? deps.workspace_id
    return await fn({
      workspace_id: ws,
      project_id: args['project_id'] as string | undefined,
      status_category: args['status_category'] as string | undefined,
      limit: (args['limit'] as number | undefined) ?? 50,
      offset: (args['offset'] as number | undefined) ?? 0,
    })
  },
})

// ── Agent definition tools ──────────────────────────────────────────────────

TOOL_REGISTRY.set('create_agent_definition', {
  schema: TOOL_SCHEMA_MAP.get('create_agent_definition'),
  capabilities: { readOnly: false, destructive: false, hookEquivalent: false },
  handler: async (args) => {
    const { createAgentDefinition } = await import('@fulcrum/core')
    return createAgentDefinition({
      role: args['role'] as Parameters<typeof createAgentDefinition>[0]['role'],
      display_name: args['display_name'] as string,
      description: args['description'] as string,
      version: args['version'] as string | undefined,
      stability: args['stability'] as Parameters<typeof createAgentDefinition>[0]['stability'],
      system_prompt: args['system_prompt'] as string | undefined,
      model: args['model'] as string | undefined,
      provider: args['provider'] as string | undefined,
      tools_allow: args['tools_allow'] as string[] | undefined,
      tools_deny: args['tools_deny'] as string[] | undefined,
      capabilities: args['capabilities'] as string[] | undefined,
      executor_uri: args['executor_uri'] as string | undefined,
    })
  },
})

TOOL_REGISTRY.set('get_agent_definition', {
  schema: TOOL_SCHEMA_MAP.get('get_agent_definition'),
  capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
  handler: async (args) => {
    const { getAgentDefinition } = await import('@fulcrum/core')
    const def = getAgentDefinition(args['role'] as string)
    return def ?? { error: `No definition found for role '${args['role'] as string}'` }
  },
})

TOOL_REGISTRY.set('update_agent_definition', {
  schema: TOOL_SCHEMA_MAP.get('update_agent_definition'),
  capabilities: { readOnly: false, destructive: false, hookEquivalent: false },
  handler: async (args) => {
    const { updateAgentDefinition } = await import('@fulcrum/core')
    return updateAgentDefinition({
      role: args['role'] as Parameters<typeof updateAgentDefinition>[0]['role'],
      display_name: args['display_name'] as string | undefined,
      description: args['description'] as string | undefined,
      version: args['version'] as string | undefined,
      stability: args['stability'] as Parameters<typeof updateAgentDefinition>[0]['stability'],
      system_prompt: args['system_prompt'] as string | undefined,
      model: args['model'] as string | undefined,
      executor_uri: args['executor_uri'] as string | undefined,
    })
  },
})

TOOL_REGISTRY.set('list_agent_definitions', {
  schema: TOOL_SCHEMA_MAP.get('list_agent_definitions'),
  capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
  handler: async (args) => {
    const { listAgentDefinitions } = await import('@fulcrum/core')
    return listAgentDefinitions(args['stability'] as Parameters<typeof listAgentDefinitions>[0])
  },
})
