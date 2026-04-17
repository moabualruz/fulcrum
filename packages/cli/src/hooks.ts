// packages/cli/src/hooks.ts
// Normalisation logic and pre/post handler implementations.
// Pure hook types have been moved to fulcrum-core (GAP-ARCH-3) and are
// re-exported from here for backward-compat.
//
// Callers:
//   - index.ts re-exports these for backward-compat (tests import from there)
//   - runHook() in index.ts calls normalizeHookEvent / runPreHook / runPostHook

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { HookCli, NormalizedHookEvent, HookPhase, HookContext, HookOutput, HookIO } from 'fulcrum-core'

export type { HookCli, NormalizedHookEvent, HookPhase, HookContext, HookOutput, HookIO }

// ---------- Runtime detection ----------

/**
 * Detect which CLI runtime produced a raw hook event by inspecting the
 * fields present. Field sets are non-overlapping:
 *   Claude:  tool_name  + session_id  (no hook_event_name)
 *   Gemini: (toolName or tool_name) + conversationId
 *   Codex:   hook_event_name field present (OpenAI Codex CLI format)
 *   PI:      role       + runId
 * First match wins. Returns null for unrecognized shapes.
 */
export function detectHookCli(event: Record<string, unknown>): HookCli | null {
  if ('hook_event_name' in event) return 'codex'
  if ('tool_name' in event && 'session_id' in event) return 'claude'
  if (('toolName' in event || 'tool_name' in event) && 'conversationId' in event) return 'gemini'
  if ('role' in event && 'runId' in event) return 'pi'
  return null
}

// ---------- Normalisation ----------

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
    toolInput = (event['tool_input'] as unknown as Record<string, unknown>) ?? {}
    sessionId = (event['session_id'] as string) ?? 'unknown'
  } else if (cliName === 'gemini') {
    toolName = (event['tool_name'] ?? event['toolName']) as string ?? ''
    toolInput = (event['tool_input'] ?? event['toolInput'] ?? event['args'] ?? {}) as unknown as Record<string, unknown>
    sessionId = (event['session_id'] ?? event['conversationId']) as string ?? 'unknown'
  } else if (cliName === 'codex') {
    // Codex CLI hook event shape: { hook_event_name, tool, tool_call_id, input, session_id }
    toolName = (event['tool'] ?? event['tool_name']) as string ?? ''
    toolInput = (event['input'] ?? event['tool_input'] ?? {}) as unknown as Record<string, unknown>
    sessionId = (event['session_id'] as string) ?? process.env['CODEX_SESSION_ID'] ?? 'unknown'
  } else if (cliName === 'pi') {
    toolName = (event['toolName'] ?? event['tool_name']) as string ?? ''
    toolInput = (event['toolInput'] ?? event['tool_input'] ?? event['args'] ?? {}) as unknown as Record<string, unknown>
    sessionId = (event['sessionId'] ?? event['session_id']) as string ?? 'unknown'
    agentRole = (event['role'] as string) ?? ''
    runId = (event['runId'] ?? event['run_id']) as string ?? ''
  }

  return { toolName, toolInput, sessionId, agentRole, runId }
}

// ---------- Pre/Post handlers ----------

const HOOK_WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash'])

/** Rate-limit the hook_events cap warning to once per hour per workspace. */
const _hookCapWarnedAt = new Map<string, number>()

function _emitHookCapWarning(workspaceId: string, io: HookIO): void {
  const key = workspaceId || ''
  const last = _hookCapWarnedAt.get(key) ?? 0
  if (Date.now() - last > 3_600_000) {
    _hookCapWarnedAt.set(key, Date.now())
    io.stderr(`[fulcrum/pre] hook_events cap reached (50000 rows for workspace '${key}') — skipping write until janitor cleans up\n`)
  }
}

/**
 * PreToolUse handler: secret scan, chief-of-staff team-invoke guard, and
 * task-scoped memory recall. Non-blocking for memory recall; hard-denies
 * (exit 2) on secret scan matches or when CoS tries to invoke a team.
 */
export async function runPreHook(ctx: HookContext, io: HookIO): Promise<void> {
  // 0. Inject pre-fetched workspace snapshot if still fresh (< 5 minutes).
  //    SessionStart hook writes this to the session file alongside run_id.
  //    Injecting here means Claude sees workspace context before its first tool call,
  //    reducing redundant get_workspace_status calls at session start.
  //    Non-blocking — silently skipped on any error or missing file.
  if (ctx.sessionId && ctx.sessionId !== 'unknown') {
    try {
      const { globalDataDir } = await import('fulcrum-core')
      const sessionFile = join(globalDataDir(), 'sessions', `${ctx.sessionId}.json`)
      if (existsSync(sessionFile)) {
        const session = JSON.parse(readFileSync(sessionFile, 'utf-8')) as unknown as Record<string, unknown>
        const fetchedAt = session['fetched_at'] as string | undefined
        const snapshot = session['workspace_snapshot'] as unknown as Record<string, unknown> | undefined
        if (snapshot && fetchedAt) {
          const ageMs = Date.now() - new Date(fetchedAt).getTime()
          if (ageMs < 5 * 60 * 1000) {
            const ageS = Math.round(ageMs / 1000)
            io.stderr(`[fulcrum/pre] workspace context (${ageS}s old): ${JSON.stringify(snapshot).slice(0, 500)}\n`)
          }
        }
      }
    } catch { /* best-effort — never block on snapshot failure */ }
  }

  // 1. Secret scan on tool_input — deny if any pattern matches
  try {
    const { checkSecrets } = await import('fulcrum-policy')
    const inputStr = JSON.stringify(ctx.toolInput)
    const scan = checkSecrets(inputStr)
    if (scan.has_secrets) {
      const patterns = Array.from(new Set(scan.matches.map(m => m.pattern_name)))
      try {
        const { emitEvent } = await import('fulcrum-core')
        emitEvent({
          workspace_id: ctx.workspace_id,
          evt_type: 'policy_denied',
          object_type: 'tool_call',
          object_id: ctx.runId || undefined,
          actor_type: 'agent',
          actor_id: ctx.cliName,
          payload: {
            reason: 'secret_scan_denied',
            tool_name: ctx.toolName,
            patterns,
            phase: 'pre',
          },
          severity: 'warn',
        })
      } catch { /* best-effort */ }
      io.stderr(`[fulcrum/pre] Tool call denied: secret detected in tool_input (${patterns.join(', ')})\n`)
      io.stderr(`[fulcrum/pre] Never include credentials in tool inputs. Use env vars or a secret store.\n`)
      const denyMsg = `Tool call blocked: secret pattern(s) detected in tool input (${patterns.join(', ')}). Use env vars or a secret store instead.`
      if (ctx.cliName === 'codex') {
        io.stdout(JSON.stringify({ decision: 'block', reason: denyMsg }))
      } else {
        io.stdout(JSON.stringify({
          continue: false,
          stopReason: 'secret_detected',
          message: denyMsg,
        } satisfies HookOutput))
      }
      io.exit(2)
      return
    }
  } catch { /* best-effort; secret scan unavailable means we don't block */ }

  // 2. Chief-of-staff no-direct-writes policy (existing behaviour)
  const isTeamInvoke = ctx.toolName.includes('invoke_team') || ctx.toolName.includes('team_invoke')
  if (isTeamInvoke && ctx.agentRole) {
    try {
      const { canInvokeTeams } = await import('fulcrum-core')
      type AgentRole = Parameters<typeof canInvokeTeams>[0]
      if (!canInvokeTeams(ctx.agentRole as AgentRole)) {
        io.stderr(`[fulcrum/pre] Tool call denied: role '${ctx.agentRole}' lacks can_invoke_teams\n`)
        const policyMsg = `Role '${ctx.agentRole}' is not permitted to invoke teams. Only chief_of_staff may use invoke_team.`
        if (ctx.cliName === 'codex') {
          io.stdout(JSON.stringify({ decision: 'block', reason: policyMsg }))
        } else {
          io.stdout(JSON.stringify({
            continue: false,
            stopReason: 'policy_denied',
            message: policyMsg,
          } satisfies HookOutput))
        }
        io.exit(2)
        return
      }
    } catch { /* best-effort */ }
  }

  // 3. Recall relevant task-scoped memories for write-family tools.
  //    Non-blocking — never fail the hook if recall is unavailable.
  if (HOOK_WRITE_TOOLS.has(ctx.toolName) && ctx.runId) {
    try {
      const { getDb } = await import('fulcrum-core')
      const db = getDb()
      const runRow = db.prepare(
        `SELECT task_id, project_id FROM agent_runs WHERE run_id = ? AND workspace_id = ?`
      ).get(ctx.runId, ctx.workspace_id) as { task_id: string | null; project_id: string | null } | undefined
      if (runRow?.task_id) {
        const rows = db.prepare(
          `SELECT memory_id, kind, content FROM memories
           WHERE workspace_id = ? AND task_id = ?
             AND kind IN ('task_goal','task_decision','decision','lesson','task_outcome')
           ORDER BY importance DESC, created_at DESC LIMIT 3`
        ).all(ctx.workspace_id, runRow.task_id) as Array<{ memory_id: string; kind: string; content: string }>
        if (rows.length > 0) {
          io.stderr(`[fulcrum/pre] recalled ${rows.length} task memories:\n`)
          for (const r of rows) {
            const summary = r.content.slice(0, 200).replace(/\s+/g, ' ')
            io.stderr(`[fulcrum/pre]   ${r.kind}: ${summary}\n`)
          }
        }
      }
    } catch { /* best-effort — never block on recall failure */ }
  }

  // 4. Write hook_event row (best-effort, never blocks the hook).
  //    Captures every tool call regardless of run_id — makes normal Claude
  //    sessions visible in the monitor without requiring start_agent_run.
  try {
    const { getDb, newId } = await import('fulcrum-core')
    const db = getDb()
    const wsId = ctx.workspace_id || ''

    // Row-count cap: skip INSERT if workspace has accumulated > 50k rows.
    const countRow = db.prepare(
      `SELECT COUNT(*) AS n FROM hook_events WHERE workspace_id = ?`
    ).get(wsId) as { n: number }

    if (countRow.n < 50_000) {
      db.prepare(`
        INSERT INTO hook_events (hook_event_id, workspace_id, session_id, tool_name, agent_role, run_id, ts, cli_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newId('hook_event'),
        wsId,
        ctx.sessionId,
        ctx.toolName,
        ctx.agentRole || '',
        ctx.runId || null,
        new Date().toISOString(),
        ctx.cliName,
      )
    } else {
      _emitHookCapWarning(wsId, io)
    }
  } catch { /* best-effort — never fail the hook */ }

  // Codex expects { "decision": "approve" } instead of { "continue": true }
  if (ctx.cliName === 'codex') {
    io.stdout(JSON.stringify({ decision: 'approve' }))
  } else {
    io.stdout(JSON.stringify({ continue: true } satisfies HookOutput))
  }
  io.exit(0)
}

/**
 * v2a PR 6 Task 29 — PostToolUse handler rewrite.
 *
 * Emits typed memories per tool:
 *   Write / Edit / MultiEdit / NotebookEdit → kind='file_patch'
 *   Bash (mutating verbs only, Task 30)     → kind='bash_trace'
 *   Read / Glob / Grep / other read-only    → skipped silently
 *
 * Per-turn dedup via sha256(tool_name + normalized_args + cwd) — duplicates
 * bump a counter instead of inserting a new row. Non-blocking: failures log
 * to stderr only.
 */
export async function runPostHook(ctx: HookContext, io: HookIO): Promise<void> {
  if (!ctx.runId) {
    io.stdout(JSON.stringify({ continue: true } satisfies HookOutput))
    io.exit(0)
    return
  }

  try {
    const { getDb } = await import('fulcrum-core')
    const { writeMemory } = await import('fulcrum-memory')
    const { buildProvenance, dedupKey, markSeen, extractFilePatch, isMutatingBash } = await import('./hooks-writers.js')
    const db = getDb()
    const runRow = db.prepare(
      `SELECT task_id, project_id, context_type FROM agent_runs WHERE run_id = ? AND workspace_id = ?`,
    ).get(ctx.runId, ctx.workspace_id) as { task_id: string | null; project_id: string | null; context_type: string | null } | undefined

    const contextType = (runRow?.context_type as 'primary' | 'subagent' | 'cron' | 'heartbeat' | 'flush' | undefined) ?? 'primary'
    // Per-turn dedup key.
    const cwd = String(ctx.toolInput['cwd'] ?? process.cwd())
    const key = dedupKey(ctx.toolName, ctx.toolInput, cwd)
    if (!markSeen(key)) {
      io.stdout(JSON.stringify({ continue: true } satisfies HookOutput))
      io.exit(0)
      return
    }

    // Route by tool_name. Read/Glob/Grep/etc fall through to "no-op".
    const filePatch = extractFilePatch(ctx.toolName, ctx.toolInput)
    if (filePatch) {
      await writeMemory({
        workspace_id: ctx.workspace_id,
        project_id: runRow?.project_id ?? ctx.workspace_id,
        task_id: runRow?.task_id ?? undefined,
        kind: 'file_patch',
        scope: runRow?.task_id ? 'task' : 'project',
        title: `${ctx.toolName}: ${filePatch.filePath}`,
        summary: filePatch.diffSummary.slice(0, 200),
        content: filePatch.diffSummary,
        file_path: filePatch.filePath,
        tags: [ctx.toolName, ctx.cliName, filePatch.operation],
        importance: 0.4,
        provenance: buildProvenance(ctx, 'PostToolUse', contextType),
      } as Parameters<typeof writeMemory>[0])
    } else if (ctx.toolName === 'Bash') {
      const command = String(ctx.toolInput['command'] ?? '')
      if (!isMutatingBash(command)) {
        // Read-only command — skip silently (Task 30 allowlist invert).
        io.stdout(JSON.stringify({ continue: true } satisfies HookOutput))
        io.exit(0)
        return
      }
      const exitStatus = (ctx.toolInput['exit_status'] as number | undefined) ?? 0
      await writeMemory({
        workspace_id: ctx.workspace_id,
        project_id: runRow?.project_id ?? ctx.workspace_id,
        task_id: runRow?.task_id ?? undefined,
        kind: 'bash_trace',
        scope: runRow?.task_id ? 'task' : 'project',
        title: `Bash: ${command.slice(0, 80)}`,
        summary: `exit=${exitStatus}; cwd=${cwd}`,
        content: command.slice(0, 400),
        tags: ['Bash', ctx.cliName],
        importance: 0.3,
        provenance: buildProvenance(ctx, 'PostToolUse', contextType),
      } as Parameters<typeof writeMemory>[0])
    }
    // else: read-only tool; no write.
  } catch (err) {
    io.stderr(`[fulcrum/post] typed-write failed: ${(err as Error).message}\n`)
    // Non-blocking.
  }
  io.stdout(JSON.stringify({ continue: true } satisfies HookOutput))
  io.exit(0)
}
