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

import { getDb } from 'fulcrum-agent-core'
import type { Db } from 'fulcrum-agent-core'
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
  /**
   * Trusted caller identity resolved from the server session, NOT from tool
   * args. See CRIT-1: accepting caller_role from args lets any MCP client
   * claim chief_of_staff and bypass the global-scope policy gate. The server
   * resolves this once at startup via resolveTrustedCaller() from
   * process.env['FULCRUM_RUN_ID'] → agent_runs.role, or falls back to
   * 'software_engineer' for stdio callers that have no run context.
   */
  trusted_caller_role?: string
  trusted_caller_run_id?: string
}

/**
 * Resolve the trusted caller identity from the server environment. Looks at
 * FULCRUM_RUN_ID in env, reads agent_runs.role for that run, returns both.
 * Tool-supplied caller_role is NEVER used — that is the CRIT-1 vulnerability.
 */
export function resolveTrustedCaller(db: Db): { role?: string; run_id?: string } {
  const runId = process.env['FULCRUM_RUN_ID']
  if (!runId) return {}
  try {
    const row = db.prepare('SELECT role FROM agent_runs WHERE run_id = ?').get(runId) as { role: string } | undefined
    return { role: row?.role, run_id: runId }
  } catch { return {} }
}

// MED-14: lightweight input-validation helpers for MCP tool handlers.
// Rejects oversized strings (>10 KiB for content, >256 for identifiers),
// non-string types, and unsafe identifier patterns before the handler runs.
const SAFE_ID_RE = /^[A-Za-z0-9_-]+$/
const MAX_ID_LEN = 256
const MAX_CONTENT_LEN = 1024 * 1024 // 1 MiB

export function assertString(val: unknown, field: string, maxLen: number): string {
  if (typeof val !== 'string') {
    throw Object.assign(new Error(`${field} must be a string`), { code: 'invalid_input' })
  }
  if (val.length > maxLen) {
    throw Object.assign(new Error(`${field} exceeds max length ${maxLen} chars`), { code: 'invalid_input' })
  }
  return val
}

export function assertIdentifier(val: unknown, field: string): string {
  const s = assertString(val, field, MAX_ID_LEN)
  if (!SAFE_ID_RE.test(s)) {
    throw Object.assign(new Error(`${field} must match ${SAFE_ID_RE}`), { code: 'invalid_input' })
  }
  return s
}

export function assertOptionalIdentifier(val: unknown, field: string): string | undefined {
  if (val === undefined || val === null) return undefined
  return assertIdentifier(val, field)
}

export function assertContent(val: unknown, field: string): string {
  return assertString(val, field, MAX_CONTENT_LEN)
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

export interface ActionCliContract {
  /** Generic CLI execution path — stable for scripts, hooks, and automation. */
  primaryCommand: string[]
  /** Legacy compatibility path retained while `tool exec` remains supported. */
  compatibilityCommand?: string[]
  stdinJson: boolean
}

export interface ActionMcpContract {
  /** MCP tool name exposed to compatibility clients. */
  toolName?: string
  /** True when MCP is a compatibility transport rather than the preferred path. */
  compatibilityOnly: boolean
}

export interface ActionHookContract {
  coverage: 'none' | 'partial' | 'full'
  nativePoints: string[]
  nativePlatforms: string[]
  cliSubstitutable: boolean
}

export interface ActionAvailability {
  platforms: string[]
  agentTypes?: string[]
  runtimeCapabilities: string[]
}

export interface ActionObservability {
  traceName: string
  eventName: string
}

export interface ActionDefinition {
  action_name: string
  cli: ActionCliContract
  mcp: ActionMcpContract
  hooks: ActionHookContract
  availability: ActionAvailability
  fallbackOrder: Array<'hook' | 'cli' | 'mcp'>
  observability: ActionObservability
}

export type McpExposureMode = 'full' | 'filtered' | 'minimal'

export interface McpExposureRequest {
  mode?: McpExposureMode
  profile?: string
  agentType?: string
  platform?: string
  runtimeCapabilities?: string[]
  includeActions?: string[]
  excludeActions?: string[]
}

export interface McpExposureDecision {
  toolName: string
  actionName: string
  exposed: boolean
  reasons: string[]
}

export interface McpExposurePlan {
  mode: McpExposureMode
  decisions: McpExposureDecision[]
  filter: (schema: import('./mcp-tools.js').ToolSchema) => boolean
}

export interface AdditionalActionDefinitionInput {
  action_name: string
  mcp: ToolSchema
}

// ─────────────────────────── Registry ────────────────────────────────────────

export const TOOL_REGISTRY = new Map<string, RegistryEntry>()
const ADDITIONAL_ACTIONS: AdditionalActionDefinitionInput[] = []

// MED-18: ActionHookContract requires `coverage` and `cliSubstitutable` on
// every override. Prior entries had only `nativePoints`/`nativePlatforms`,
// which failed strict typecheck (TS2739). Adding the missing fields with the
// correct defaults — full coverage + CLI substitutable for these three tools.
const ACTION_PLATFORM_OVERRIDES: Record<string, Partial<Pick<ActionDefinition, 'hooks' | 'availability'>>> = {
  recall_memory: {
    hooks: {
      coverage: 'full',
      nativePoints: ['claude.pre_tool_use', 'gemini.before_tool', 'pi.before_tool'],
      nativePlatforms: ['claude', 'gemini', 'pi'],
      cliSubstitutable: true,
    },
  },
  write_memory: {
    hooks: {
      coverage: 'full',
      nativePoints: ['claude.post_tool_use', 'claude.pre_compact', 'gemini.after_tool', 'pi.after_tool'],
      nativePlatforms: ['claude', 'gemini', 'pi'],
      cliSubstitutable: true,
    },
  },
  get_current_context: {
    hooks: {
      coverage: 'full',
      nativePoints: ['claude.session_start', 'claude.pre_tool_use'],
      nativePlatforms: ['claude'],
      cliSubstitutable: true,
    },
  },
}

function normalizeActionName(name: string): string {
  return name.replace(/^mcp__fulcrum__/, '')
}

function buildActionDefinition(name: string, entry: RegistryEntry): ActionDefinition {
  const actionName = normalizeActionName(name)
  const hookCoverage = entry.capabilities.hookEquivalent ? 'full' : 'none'
  const overrides = ACTION_PLATFORM_OVERRIDES[actionName]
  return {
    action_name: actionName,
    cli: {
      primaryCommand: ['action', 'exec', actionName],
      compatibilityCommand: ['tool', 'exec', entry.schema?.name ?? actionName],
      stdinJson: true,
    },
    mcp: {
      toolName: entry.schema?.name,
      compatibilityOnly: entry.schema !== undefined,
    },
    hooks: {
      coverage: overrides?.hooks?.coverage ?? hookCoverage,
      nativePoints: overrides?.hooks?.nativePoints ?? (entry.capabilities.hookEquivalent ? ['fulcrum-hook'] : []),
      nativePlatforms: overrides?.hooks?.nativePlatforms ?? (entry.capabilities.hookEquivalent ? ['any'] : []),
      cliSubstitutable: true,
    },
    availability: {
      platforms: overrides?.availability?.platforms ?? ['any'],
      agentTypes: overrides?.availability?.agentTypes ?? (entry.capabilities.minRole ? [entry.capabilities.minRole] : undefined),
      runtimeCapabilities: overrides?.availability?.runtimeCapabilities ?? [],
    },
    fallbackOrder: entry.capabilities.hookEquivalent ? ['hook', 'cli', 'mcp'] : ['cli', 'mcp'],
    observability: {
      traceName: `action.${actionName}`,
      eventName: `${actionName}.executed`,
    },
  }
}

function buildAdditionalActionDefinition(action: AdditionalActionDefinitionInput): ActionDefinition {
  const actionName = normalizeActionName(action.action_name)
  return {
    action_name: actionName,
    cli: {
      primaryCommand: ['action', 'exec', actionName],
      compatibilityCommand: ['tool', 'exec', action.mcp.name],
      stdinJson: true,
    },
    mcp: {
      toolName: action.mcp.name,
      compatibilityOnly: true,
    },
    hooks: {
      coverage: 'none',
      nativePoints: [],
      nativePlatforms: [],
      cliSubstitutable: true,
    },
    availability: {
      platforms: ['any'],
      runtimeCapabilities: [],
    },
    fallbackOrder: ['cli', 'mcp'],
    observability: {
      traceName: `action.${actionName}`,
      eventName: `${actionName}.executed`,
    },
  }
}

export function getActionDefinition(name: string): ActionDefinition | undefined {
  const actionName = normalizeActionName(name)
  const entry = TOOL_REGISTRY.get(actionName)
  if (entry) return buildActionDefinition(actionName, entry)
  const additional = ADDITIONAL_ACTIONS.find(action => normalizeActionName(action.action_name) === actionName)
  return additional ? buildAdditionalActionDefinition(additional) : undefined
}

export function getRegistryEntry(name: string): RegistryEntry | undefined {
  return TOOL_REGISTRY.get(normalizeActionName(name))
}

export function listActionDefinitions(): ActionDefinition[] {
  const builtIns = Array.from(TOOL_REGISTRY.entries())
    .map(([name, entry]) => buildActionDefinition(name, entry))
    .filter(action => action.mcp.toolName !== undefined)
  const additional = ADDITIONAL_ACTIONS.map(action => buildAdditionalActionDefinition(action))
  return [...builtIns, ...additional]
}

export function setAdditionalActionDefinitions(actions: AdditionalActionDefinitionInput[]): void {
  ADDITIONAL_ACTIONS.length = 0
  ADDITIONAL_ACTIONS.push(...actions)
}

function matchesPlatform(action: ActionDefinition, platform?: string): boolean {
  if (!platform) return true
  return action.availability.platforms.includes('any') || action.availability.platforms.includes(platform)
}

function matchesAgentType(action: ActionDefinition, agentType?: string): boolean {
  if (!agentType) return true
  if (!action.availability.agentTypes || action.availability.agentTypes.length === 0) return true
  return action.availability.agentTypes.includes(agentType)
}

function matchesRuntimeCapabilities(
  action: ActionDefinition,
  platform: string | undefined,
  mode: McpExposureMode,
  runtimeCapabilities: Set<string>,
): boolean {
  if (mode === 'full') return true
  if (runtimeCapabilities.has('hooks') && action.hooks.coverage === 'full') {
    if (!platform) return false
    if (
      action.hooks.nativePlatforms.includes('any') ||
      action.hooks.nativePlatforms.includes(platform)
    ) {
      return false
    }
  }
  if (action.availability.runtimeCapabilities.length === 0) return true
  return action.availability.runtimeCapabilities.every(cap => runtimeCapabilities.has(cap))
}

function matchesExplicitSets(actionName: string, includeActions: Set<string>, excludeActions: Set<string>): boolean {
  if (excludeActions.has(actionName)) return false
  if (includeActions.size === 0) return true
  return includeActions.has(actionName)
}

async function resolveRolePolicy(profile?: string): Promise<{ allow: string[] | null; deny: Set<string>; warning?: string }> {
  if (!profile) return { allow: null, deny: new Set<string>() }

  const { getAgentDefinition } = await import('fulcrum-agent-core')
  const def = getAgentDefinition(profile)
  if (!def) {
    return {
      allow: null,
      deny: new Set<string>(),
      warning:
        `[fulcrum/mcp] WARNING: --profile '${profile}' — no agent definition found for this role.\n` +
        `  Role-based tool filtering is DISABLED; all tools matching other filters will be served.\n` +
        `  Run: fulcrum agent definition list\n`,
    }
  }

  return {
    allow: def.tools_allow === null ? null : def.tools_allow.map(name => normalizeActionName(name)),
    deny: new Set((def.tools_deny ?? []).map(name => normalizeActionName(name))),
  }
}

export async function buildMcpExposurePlan(
  request: McpExposureRequest = {},
): Promise<McpExposurePlan> {
  const mode = request.mode ?? 'filtered'
  const runtimeCapabilities = new Set(request.runtimeCapabilities ?? [])
  const includeActions = new Set((request.includeActions ?? []).map(name => normalizeActionName(name)))
  const excludeActions = new Set((request.excludeActions ?? []).map(name => normalizeActionName(name)))
  const rolePolicy = await resolveRolePolicy(request.profile ?? request.agentType)
  if (rolePolicy.warning) process.stderr.write(rolePolicy.warning)

  const decisions = listActionDefinitions().map((action): McpExposureDecision => {
    const reasons: string[] = []
    let exposed = true

    if (!matchesExplicitSets(action.action_name, includeActions, excludeActions)) {
      exposed = false
      reasons.push(includeActions.size > 0 ? 'not_in_explicit_include_set' : 'explicitly_excluded')
    }

    if (exposed && !matchesPlatform(action, request.platform)) {
      exposed = false
      reasons.push(`platform_filtered:${request.platform}`)
    }

    if (exposed && !matchesAgentType(action, request.agentType)) {
      exposed = false
      reasons.push(`agent_type_filtered:${request.agentType}`)
    }

    if (exposed && !matchesRuntimeCapabilities(action, request.platform, mode, runtimeCapabilities)) {
      exposed = false
      reasons.push(runtimeCapabilities.has('hooks') && action.hooks.coverage === 'full'
        ? 'hook_covered'
        : 'runtime_capability_filtered')
    }

    if (exposed && rolePolicy.deny.has(action.action_name)) {
      exposed = false
      reasons.push('policy_deny')
    }

    if (exposed && rolePolicy.allow !== null && !rolePolicy.allow.includes(action.action_name)) {
      exposed = false
      reasons.push('policy_not_allowed')
    }

    if (exposed && mode === 'minimal' && includeActions.size === 0 && action.hooks.coverage === 'full') {
      exposed = false
      reasons.push('minimal_mode_prefers_hook_or_cli')
    }

    if (reasons.length === 0) reasons.push('exposed')

    return {
      toolName: action.mcp.toolName ?? action.action_name,
      actionName: action.action_name,
      exposed,
      reasons,
    }
  })

  const allowedToolNames = new Set(decisions.filter(decision => decision.exposed).map(decision => decision.toolName))
  return {
    mode,
    decisions,
    filter: (schema: import('./mcp-tools.js').ToolSchema) => allowedToolNames.has(schema.name),
  }
}

// ─────────────────────────── Helpers ────────────────────────────────────────

/** Build a HandlerDeps context from the cwd-derived workspace/project IDs. */
export function buildDeps(workspace_id: string, project_id: string): HandlerDeps {
  const db = getDb()
  const trusted = resolveTrustedCaller(db)
  return {
    db,
    workspace_id,
    project_id,
    trusted_caller_role: trusted.role,
    trusted_caller_run_id: trusted.run_id,
  }
}

function ensureWorkspace(db: Db, wsId: string): void {
  const existing = db.prepare('SELECT workspace_id FROM workspaces WHERE workspace_id = ?').get(wsId)
  if (!existing) {
    const now = new Date().toISOString()
    db.prepare('INSERT OR IGNORE INTO workspaces (workspace_id, name, status, created_at) VALUES (?, ?, ?, ?)').run(wsId, wsId, 'active', now)
  }
}

function ensureProject(db: Db, wsId: string, projId: string): void {
  const existing = db.prepare('SELECT project_id, root_realpath FROM projects WHERE project_id = ?').get(projId) as { project_id: string; root_realpath: string | null } | undefined
  const cwd = process.cwd()
  let rootRealpath: string | null = cwd
  try { const { realpathSync } = require('fs') as typeof import('fs'); rootRealpath = realpathSync(cwd) } catch {}
  if (!existing) {
    const now = new Date().toISOString()
    db.prepare(`INSERT OR IGNORE INTO projects (project_id, workspace_id, name, created_at, root_path, root_realpath) VALUES (?, ?, ?, ?, ?, ?)`).run(projId, wsId, projId, now, cwd, rootRealpath)
    return
  }
  // Back-fill root_realpath for projects created before the indexing fix.
  if (!existing.root_realpath) {
    try {
      db.prepare(`UPDATE projects SET root_path = ?, root_realpath = ? WHERE project_id = ?`).run(cwd, rootRealpath, projId)
    } catch { /* UNIQUE conflict — another project with same realpath already owns it */ }
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
  const plan = await buildMcpExposurePlan(
    profile === 'hook-only'
      ? { mode: 'filtered', runtimeCapabilities: ['hooks'] }
      : { mode: 'filtered', profile, agentType: profile },
  )
  return plan.filter
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
    const { listTasks } = await import('fulcrum-agent-core')
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
    const { createTask } = await import('fulcrum-agent-core')
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
    const { updateTask } = await import('fulcrum-agent-core')
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

// Memory v3 PR 5 unit 5.4 — inspection + correction surface (MCP parity).
TOOL_REGISTRY.set('get_memory_sources', {
  schema: TOOL_SCHEMA_MAP.get('get_memory_sources'),
  capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
  handler: async (args) => {
    const { sources } = await import('./commands/memory-inspection.js')
    return sources(args['page_id'] as string)
  },
})

TOOL_REGISTRY.set('inspect_memory', {
  schema: TOOL_SCHEMA_MAP.get('inspect_memory'),
  capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
  handler: async (args) => {
    const { inspect } = await import('./commands/memory-inspection.js')
    return inspect(args['page_id'] as string)
  },
})

TOOL_REGISTRY.set('read_raw_source', {
  schema: TOOL_SCHEMA_MAP.get('read_raw_source'),
  capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
  handler: async (args) => {
    const { readRaw } = await import('./commands/memory-inspection.js')
    return readRaw(args['l0_id'] as string)
  },
})

TOOL_REGISTRY.set('trace_claim', {
  schema: TOOL_SCHEMA_MAP.get('trace_claim'),
  capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
  handler: async (args, deps) => {
    const { trace } = await import('./commands/memory-inspection.js')
    const opts: Parameters<typeof trace>[1] = {}
    const ws = (args['workspace_id'] as string | undefined) ?? deps.workspace_id
    if (ws) opts.workspace_id = ws
    if (args['project_id'] !== undefined) opts.project_id = args['project_id'] as string
    if (args['limit'] !== undefined) opts.limit = args['limit'] as number
    return trace(args['claim'] as string, opts)
  },
})

TOOL_REGISTRY.set('mark_memory_wrong', {
  schema: TOOL_SCHEMA_MAP.get('mark_memory_wrong'),
  capabilities: { readOnly: false, destructive: false, hookEquivalent: false },
  handler: async (args, deps) => {
    const { markWrong } = await import('./commands/memory-inspection.js')
    const ws = (args['workspace_id'] as string | undefined) ?? deps.workspace_id
    const input: Parameters<typeof markWrong>[0] = {
      page_id: args['page_id'] as string,
      reason: args['reason'] as string,
      workspace_id: ws,
    }
    if (args['correction_body'] !== undefined) input.correction_body = args['correction_body'] as string
    if (args['project_id'] !== undefined) input.project_id = args['project_id'] as string
    return markWrong(input)
  },
})

TOOL_REGISTRY.set('recall_knowledge', {
  schema: TOOL_SCHEMA_MAP.get('recall_knowledge'),
  capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
  handler: async (args, deps) => {
    const { recallKnowledge } = await import('./commands/memory-recall.js')
    const { getTextEmbedder, initEmbedding, loadConfig } = await import('fulcrum-agent-core')
    if (!getTextEmbedder()) {
      try { await initEmbedding(loadConfig()) } catch { /* FTS5 + graph still work */ }
    }
    const ws = (args['workspace_id'] as string | undefined) ?? deps.workspace_id
    const input: Parameters<typeof recallKnowledge>[0] = {
      workspace_id: ws,
      query: args['query'] as string,
    }
    if (args['project_id'] !== undefined) input.project_id = args['project_id'] as string | null
    if (args['limit'] !== undefined) input.limit = args['limit'] as number
    if (args['offset'] !== undefined) input.offset = args['offset'] as number
    if (args['max_chars'] !== undefined) input.max_chars = args['max_chars'] as number
    if (args['confidence_floor'] !== undefined) input.confidence_floor = args['confidence_floor'] as number
    if (args['graph_hops'] !== undefined) input.graph_hops = args['graph_hops'] as number
    if (args['include_superseded'] !== undefined) input.include_superseded = Boolean(args['include_superseded'])
    return recallKnowledge(input)
  },
})

TOOL_REGISTRY.set('recall_memory', {
  schema: TOOL_SCHEMA_MAP.get('recall_memory'),
  capabilities: { readOnly: true, destructive: false, hookEquivalent: true },
  handler: async (args, deps) => {
    // PR 5 unit 5.5 — when v3 is enabled (default on), delegate to the new
    // pipeline. FULCRUM_MEMORY_V3=0 reverts to the v2a runStagedSearch path.
    const { isMemoryV3Enabled } = await import('fulcrum-memory')
    if (isMemoryV3Enabled()) {
      const registryEntry = TOOL_REGISTRY.get('recall_knowledge')
      if (registryEntry) return registryEntry.handler(args, deps)
    }
    // v2a PR 2 Task 11: route through runStagedSearch so the response carries
    // the {results, reason?} envelope and recall_events are inserted 1:1 with
    // returned rows. min_score has a v2a-default of 0.35 for multi-token
    // queries / 0 for single-token queries; callers can override via args.
    const { runStagedSearch } = await import('fulcrum-memory')
    const { getTextEmbedder, initEmbedding, loadConfig } = await import('fulcrum-agent-core')
    if (!getTextEmbedder()) {
      try {
        const config = loadConfig()
        await initEmbedding(config)
      } catch { /* embedding init failures degrade gracefully to FTS5-only */ }
    }
    const ws = (args['workspace_id'] as string | undefined) ?? deps.workspace_id
    const maxChars = (args['max_chars'] as number | undefined) ?? 500
    const envelope = await runStagedSearch({
      query: args['query'] as string,
      workspace_id: ws,
      project_id: args['project_id'] as string | undefined,
      limit: (args['limit'] as number | undefined) ?? 10,
      offset: (args['offset'] as number | undefined) ?? 0,
      mode: 'full',
      query_scope: args['query_scope'] as 'session' | 'project' | 'workspace' | 'global' | undefined,
      session_id: args['session_id'] as string | undefined,
      min_score: args['min_score'] as number | undefined,
      caller_run_id: deps.trusted_caller_run_id,
      caller_role: deps.trusted_caller_role,
      recall_source: 'recall_memory',
    } as unknown as Parameters<typeof runStagedSearch>[0])
    const results = (envelope.results as Array<{ memory_id?: string; content?: string; summary?: string; tags?: string[]; recall_score?: number; source?: string }>)
      .map(m => ({
        id: m.memory_id,
        content: ((m.content ?? m.summary) ?? '').slice(0, maxChars),
        score: m.recall_score ?? 0.0,
        tags: m.tags ?? [],
        source: m.source ?? 'manual',
      }))
    return envelope.reason ? { results, reason: envelope.reason } : { results }
  },
})

TOOL_REGISTRY.set('write_memory', {
  schema: TOOL_SCHEMA_MAP.get('write_memory'),
  capabilities: { readOnly: false, destructive: false, hookEquivalent: true },
  handler: async (args, deps) => {
    const { writeMemory } = await import('fulcrum-memory')
    // Warm up embedding so vec_memories gets populated for future recall
    const { getTextEmbedder: _gte, initEmbedding: _ie, loadConfig: _lc } = await import('fulcrum-agent-core')
    if (!_gte()) {
      try { await _ie(_lc()) } catch { /* non-fatal */ }
    }
    // MED-14: validate identifiers + content BEFORE they reach the handler.
    // Guards against path-traversal via workspace_id/project_id, oversized
    // content DoS, non-string type confusion, and shell-chars in tags.
    const ws = assertIdentifier(args['workspace_id'] ?? deps.workspace_id, 'workspace_id')
    const proj = assertIdentifier(args['project_id'] ?? deps.project_id, 'project_id')
    const content = assertContent(args['content'], 'content')
    ensureWorkspace(deps.db, ws)
    ensureProject(deps.db, ws, proj)
    const rawTags = args['tags']
    const tagList = Array.isArray(rawTags)
      ? rawTags.map(String).filter(Boolean).slice(0, 32)
      : ((rawTags as string | undefined) ?? '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 32)
    const title = typeof args['title'] === 'string'
      ? assertString(args['title'], 'title', 512)
      : content.slice(0, 80)
    // Accept caller-provided kind + summary + scope when present; fall back to
    // sensible defaults. Prior version hardcoded kind='fact' which forced
    // canonical_text = content (no FTS5 identifier tokenization) and locked
    // MCP callers out of symbol/code/doc/decision/etc. writes.
    const kindArg = typeof args['kind'] === 'string' ? args['kind'] : 'fact'
    const summaryArg = typeof args['summary'] === 'string' ? args['summary'] : title
    const scopeArg = typeof args['scope'] === 'string' ? args['scope'] : 'project'
    const memory = await writeMemory({
      content,
      workspace_id: ws,
      project_id: proj,
      title,
      summary: summaryArg,
      scope: scopeArg,
      kind: kindArg,
      tags: tagList,
    } as Parameters<typeof writeMemory>[0])
    return { saved: true, memory_id: memory.memory_id, project_id: proj, tags: tagList }
  },
})

// v2b PR 13 Task 4.3 — code_context and project_context graduate from v2b-deferred stubs
TOOL_REGISTRY.set('code_context', {
  schema: TOOL_SCHEMA_MAP.get('code_context'),
  capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
  handler: async (args, deps) => {
    const { runCodeContext } = await import('fulcrum-memory')
    const ws = (args['workspace_id'] as string | undefined) ?? deps.workspace_id
    return runCodeContext({
      symbol: args['symbol'] as string | undefined,
      file: args['file'] as string | undefined,
      workspace_id: ws,
      project_id: (args['project_id'] as string | undefined) ?? deps.project_id,
      limit: args['limit'] as number | undefined,
    })
  },
})

TOOL_REGISTRY.set('project_context', {
  schema: TOOL_SCHEMA_MAP.get('project_context'),
  capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
  handler: async (args, deps) => {
    const { runProjectContext } = await import('fulcrum-memory')
    const ws = (args['workspace_id'] as string | undefined) ?? deps.workspace_id
    return runProjectContext({
      task_id: args['task_id'] as string | undefined,
      run_id: args['run_id'] as string | undefined,
      file: args['file'] as string | undefined,
      symbol: args['symbol'] as string | undefined,
      workspace_id: ws,
      project_id: (args['project_id'] as string | undefined) ?? deps.project_id,
      limit: args['limit'] as number | undefined,
    })
  },
})

// v2a PR 2 Task 12 — query_memory action.
TOOL_REGISTRY.set('query_memory', {
  schema: TOOL_SCHEMA_MAP.get('query_memory'),
  capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
  handler: async (args, deps) => {
    const { queryMemory } = await import('fulcrum-memory')
    const ws = (args['workspace_id'] as string | undefined) ?? deps.workspace_id
    const envelope = await queryMemory({
      workspace_id: ws,
      project_id: args['project_id'] as string | undefined,
      scope: args['scope'] as 'session' | 'project' | 'workspace' | 'global' | undefined,
      text: args['text'] as string | undefined,
      tags: args['tags'] as string[] | undefined,
      linked_to: args['linked_to'] as string | undefined,
      file_paths: args['file_paths'] as string[] | undefined,
      kind: args['kind'] as string | undefined,
      date_range: args['date_range'] as { from?: string; to?: string } | undefined,
      limit: args['limit'] as number | undefined,
      caller_run_id: deps.trusted_caller_run_id,
      caller_role: deps.trusted_caller_role,
    })
    return envelope.reason ? envelope : { results: envelope.results }
  },
})

// v2a PR 2 Task 13 — search_code action.
TOOL_REGISTRY.set('search_code', {
  schema: TOOL_SCHEMA_MAP.get('search_code'),
  capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
  handler: async (args, deps) => {
    const { searchCode } = await import('fulcrum-memory')
    const ws = (args['workspace_id'] as string | undefined) ?? deps.workspace_id
    const envelope = await searchCode({
      workspace_id: ws,
      project_id: args['project_id'] as string | undefined,
      text: args['text'] as string | undefined,
      symbol: args['symbol'] as string | undefined,
      lang: args['lang'] as string | undefined,
      path: args['path'] as string | undefined,
      scope: args['scope'] as 'session' | 'project' | 'workspace' | 'global' | undefined,
      min_score: args['min_score'] as number | undefined,
      limit: args['limit'] as number | undefined,
      caller_run_id: deps.trusted_caller_run_id,
      caller_role: deps.trusted_caller_role,
    })
    return envelope.reason ? envelope : { results: envelope.results }
  },
})

// ── Agent profile tools ─────────────────────────────────────────────────────

TOOL_REGISTRY.set('list_agent_profiles', {
  schema: TOOL_SCHEMA_MAP.get('list_agent_profiles'),
  capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
  handler: async (args) => {
    const { listAgentProfiles } = await import('fulcrum-agent-core')
    return await listAgentProfiles({ workspace_id: args['workspace_id'] as string | undefined })
  },
})

TOOL_REGISTRY.set('create_agent_profile', {
  schema: TOOL_SCHEMA_MAP.get('create_agent_profile'),
  capabilities: { readOnly: false, destructive: false, hookEquivalent: false },
  handler: async (args, deps) => {
    const { createAgentProfile } = await import('fulcrum-agent-core')
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
    const { getAgentRunStatus } = await import('fulcrum-agent-core')
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
    const { createTask, startAgentRun } = await import('fulcrum-agent-core')
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
      context_type: (args['context_type'] as Parameters<typeof startAgentRun>[0]['context_type']) ?? 'subagent',
    })

    if (args['dispatch'] === true) {
      const { dispatchClaudeCode } = await import('fulcrum-worker')
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
    const { heartbeatAgentRun } = await import('fulcrum-agent-core')
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
    const { completeAgentRun } = await import('fulcrum-agent-core')
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
    const { blockAgentRun } = await import('fulcrum-agent-core')
    const run = await blockAgentRun({ run_id: args['run_id'] as string, reason: args['reason'] as string })
    return { run_id: run.run_id, status: run.status, reason: run.blocker }
  },
})

TOOL_REGISTRY.set('sweep_stale_runs', {
  schema: TOOL_SCHEMA_MAP.get('sweep_stale_runs'),
  capabilities: { readOnly: false, destructive: true, hookEquivalent: false },
  handler: async (args, deps) => {
    const { sweepStaleRuns } = await import('fulcrum-agent-core')
    const ws = args['workspace_id'] as string | undefined ?? deps.workspace_id
    const stale_minutes = args['stale_minutes'] as number | undefined
    return sweepStaleRuns({ workspace_id: ws || undefined, stale_minutes }, deps.db)
  },
})

// ── Workspace / context tools ───────────────────────────────────────────────

TOOL_REGISTRY.set('build_cos_context', {
  schema: TOOL_SCHEMA_MAP.get('build_cos_context'),
  capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
  handler: async (args, deps) => {
    const { buildCosContext } = await import('fulcrum-agent-core')
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
    const { getWorkspaceStatus } = await import('fulcrum-agent-core')
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
    const { listTasks } = await import('fulcrum-agent-core')
    const monitorPort = process.env['FULCRUM_MONITOR_PORT'] ?? '4721'
    const monitorUrl = `http://localhost:${monitorPort}`
    const monitorRunning = await probeMonitor(monitorUrl)

    let suggestedNextCall = 'list_tasks'
    try {
      const tasks = await listTasks({ workspace_id: deps.workspace_id, limit: 1 })
      if (tasks.length === 0) suggestedNextCall = 'create_task'
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
    const { getTeamOps } = await import('fulcrum-agent-core')
    const ops = getTeamOps(); if (!ops) throw Object.assign(new Error('team-ops not registered'), { code: 'invalid_state' }); const fn = ops['createTeamTemplate'] as (input: Record<string, unknown>) => Promise<unknown>
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
  handler: async (args, deps) => {
    // CRIT-1: caller_role and caller_agent_id MUST come from trusted session
    // state, not from tool args. A tool-arg-supplied caller_role lets any MCP
    // client claim chief_of_staff and spawn teams they shouldn't be allowed to.
    const callerRole = deps.trusted_caller_role
    if (!callerRole) {
      throw Object.assign(
        new Error('invoke_team requires a trusted caller session; FULCRUM_RUN_ID env var is missing or invalid.'),
        { code: 'invalid_state' },
      )
    }
    const { getTeamOps } = await import('fulcrum-agent-core')
    const ops = getTeamOps(); if (!ops) throw Object.assign(new Error('team-ops not registered'), { code: 'invalid_state' }); const fn = ops['invokeTeam'] as (input: Record<string, unknown>) => Promise<unknown>
    return await fn({
      template_id: args['template_id'] as string,
      workspace_id: args['workspace_id'] as string,
      project_id: args['project_id'] as string | undefined,
      purpose: args['purpose'] as string,
      task_id: args['task_id'] as string | undefined,
      caller_agent_id: deps.trusted_caller_run_id ?? '',
      caller_role: callerRole,
      initial_slots: args['initial_slots'] as Record<string, string[]> | undefined,
    })
  },
})

TOOL_REGISTRY.set('list_team_templates', {
  schema: TOOL_SCHEMA_MAP.get('list_team_templates'),
  capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
  handler: async (args) => {
    const { getTeamOps } = await import('fulcrum-agent-core')
    const ops = getTeamOps(); if (!ops) throw Object.assign(new Error('team-ops not registered'), { code: 'invalid_state' }); const fn = ops['listTeamTemplates'] as (input?: Record<string, unknown>) => Promise<unknown[]>
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
    const { getTeamOps } = await import('fulcrum-agent-core')
    const ops = getTeamOps(); if (!ops) throw Object.assign(new Error('team-ops not registered'), { code: 'invalid_state' }); const fn = ops['listTeamInstances'] as (input: Record<string, unknown>) => Promise<unknown[]>
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
    const { createAgentDefinition } = await import('fulcrum-agent-core')
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
    const { getAgentDefinition } = await import('fulcrum-agent-core')
    const def = getAgentDefinition(args['role'] as string)
    return def ?? { error: `No definition found for role '${args['role'] as string}'` }
  },
})

TOOL_REGISTRY.set('update_agent_definition', {
  schema: TOOL_SCHEMA_MAP.get('update_agent_definition'),
  capabilities: { readOnly: false, destructive: false, hookEquivalent: false },
  handler: async (args) => {
    const { updateAgentDefinition } = await import('fulcrum-agent-core')
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

// v2b PR 12 Task 3.5 — list_activations: read-only workspace activation snapshot
TOOL_REGISTRY.set('list_activations', {
  schema: TOOL_SCHEMA_MAP.get('list_activations'),
  capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
  handler: async (args, deps) => {
    const { listActivations } = await import('fulcrum-memory')
    const ws = (args['workspace_id'] as string | undefined) ?? deps.workspace_id
    const proj = (args['project_id'] as string | undefined) ?? deps.project_id
    return listActivations({ workspace_id: ws, project_id: proj })
  },
})

TOOL_REGISTRY.set('list_agent_definitions', {
  schema: TOOL_SCHEMA_MAP.get('list_agent_definitions'),
  capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
  handler: async (args) => {
    const { listAgentDefinitions } = await import('fulcrum-agent-core')
    return listAgentDefinitions(args['stability'] as Parameters<typeof listAgentDefinitions>[0])
  },
})

// v2b PR 10 Fix #24 — graph consistency check: SQLite ↔ Kuzu cross-store divergence report.
TOOL_REGISTRY.set('graph_consistency_check', {
  schema: undefined, // internal action, not exposed to MCP clients
  capabilities: { readOnly: true, destructive: false, hookEquivalent: false },
  handler: async (args, deps) => {
    const { checkDivergence, getKuzuClient } = await import('fulcrum-memory')
    const sampleSize = typeof args['sample_size'] === 'number' ? args['sample_size'] : 100
    const alertThreshold = typeof args['alert_threshold'] === 'number' ? args['alert_threshold'] : 0.001
    const db = deps.db

    const sampler = {
      sampleIds(sqliteTable: string, limit: number): string[] {
        try {
          const idCol = sqliteTable === 'memories' ? 'memory_id'
            : sqliteTable === 'tasks' ? 'task_id'
            : sqliteTable === 'agent_runs' ? 'run_id'
            : 'id'
          const rows = db.prepare(`SELECT ${idCol} AS id FROM ${sqliteTable} ORDER BY rowid DESC LIMIT ?`).all(limit) as Array<{ id: string }>
          return rows.map(r => r.id)
        } catch { return [] }
      },
    }

    const kuzuClient = getKuzuClient()
    if (!kuzuClient?.isReady) {
      return { error: 'Kuzu not ready — run `fulcrum memory accelerate` first', totalChecked: 0, missingInKuzu: 0, driftPct: 0, isDrifting: false, missing: [] }
    }

    const checker = {
      async hasNode(table: string, id: string): Promise<boolean> {
        try {
          const rows = await kuzuClient.query<{ found: number }>(`MATCH (n:${table} {id: $id}) RETURN count(n) AS found`, { id })
          return (rows[0]?.found ?? 0) > 0
        } catch { return false }
      },
    }

    const tables = [
      { table: 'Memory', sqliteTable: 'memories' },
      { table: 'Task', sqliteTable: 'tasks' },
      { table: 'AgentRun', sqliteTable: 'agent_runs' },
    ]

    return checkDivergence(tables, sampler, checker, { sampleSize, alertThreshold })
  },
})
