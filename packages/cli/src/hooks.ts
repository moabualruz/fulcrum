// packages/cli/src/hooks.ts
// Normalisation logic and pre/post handler implementations.
// Pure hook types have been moved to fulcrum-agent-core (GAP-ARCH-3) and are
// re-exported from here for backward-compat.
//
// Callers:
//   - index.ts re-exports these for backward-compat (tests import from there)
//   - runHook() in index.ts calls normalizeHookEvent / runPreHook / runPostHook

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { HookCli, NormalizedHookEvent, HookPhase, HookContext, HookOutput, HookIO } from 'fulcrum-agent-core'

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
  } else if (cliName === 'opencode' || cliName === 'cursor' || cliName === 'windsurf') {
    // Same event shape as Claude Code (tool_name / tool_input / session_id)
    toolName = (event['tool_name'] ?? event['tool'] ?? event['toolName']) as string ?? ''
    toolInput = (event['tool_input'] ?? event['input'] ?? event['toolInput'] ?? {}) as unknown as Record<string, unknown>
    sessionId = (event['session_id'] ?? event['sessionId']) as string ?? 'unknown'
  }

  return { toolName, toolInput, sessionId, agentRole, runId }
}

// ---------- Pre/Post handlers ----------

const HOOK_WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash'])

// PR 3 R1: tools that search the filesystem when the user might be better
// served by a Fulcrum recall. Tracked per session by `recall_turn_state`.
const HOOK_SEARCH_TOOLS = new Set(['Grep', 'Glob', 'Read'])

// PR 3 R1: Variant B timeout. Passive-injection must not slow the hook above
// the p95 < 20ms budget materially; we cap the recall call at 500ms wall-clock
// and fall through to the rule-only nudge on timeout.
const BIAS_RECALL_TIMEOUT_MS = 500
const BIAS_RECALL_LIMIT = 3

function extractRecallQuery(toolName: string, toolInput: Record<string, unknown>): string {
  if (toolName === 'Grep' || toolName === 'Glob') {
    const p = toolInput['pattern']
    return typeof p === 'string' ? p : ''
  }
  if (toolName === 'Read') {
    const f = toolInput['file_path']
    if (typeof f !== 'string') return ''
    // Reduce a filesystem path to a search-friendly query: trailing segment
    // without extension (e.g. "/a/b/recall-measurement.ts" → "recall measurement").
    const parts = f.split(/[\\/]/).filter(Boolean)
    const last = parts[parts.length - 1] ?? ''
    return last.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()
  }
  return ''
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let handle: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race<T | 'timeout'>([
      p,
      new Promise<'timeout'>((resolve) => {
        handle = setTimeout(() => resolve('timeout'), ms)
      }),
    ])
  } finally {
    if (handle) clearTimeout(handle)
  }
}

// Claude-Code session_id (UUID) → Fulcrum agent_runs.run_id (ULID). The
// SessionStart hook writes a session file at
// ${globalDataDir()}/sessions/<safe_session_id>.json containing both. This
// helper reads that file so the bias nudge / passive injection path can
// authenticate against agent_runs instead of the untrusted Claude session_id.
// Returns null if no session file exists (pre-SessionStart window, non-Claude
// caller, or session not wired) — callers must fall through silently.
async function resolveFulcrumRunId(sessionId: string): Promise<string | null> {
  if (!sessionId || sessionId === 'unknown') return null
  try {
    const { globalDataDir } = await import('fulcrum-agent-core')
    const safeId = sessionId.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128)
    const path = join(globalDataDir(), 'sessions', `${safeId}.json`)
    if (!existsSync(path)) return null
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as { run_id?: string }
    return typeof parsed.run_id === 'string' && parsed.run_id ? parsed.run_id : null
  } catch {
    return null
  }
}

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
      const { globalDataDir } = await import('fulcrum-agent-core')
      const safeSessionId = ctx.sessionId.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 128)
      const sessionFile = join(globalDataDir(), 'sessions', `${safeSessionId}.json`)
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

  // 1. Secret scan on tool_input — opt-in via FULCRUM_SECRET_SCAN=1.
  //    Off by default: the patterns are heuristic and have a high false-positive rate
  //    (e.g. bootstrap scripts with `password=` lines, CI env snippets, test fixtures).
  //    Users who want scanning can set FULCRUM_SECRET_SCAN=1 in their shell or settings.
  if (process.env['FULCRUM_SECRET_SCAN'] === '1') {
    try {
      const { checkSecrets } = await import('fulcrum-policy')
      const inputStr = JSON.stringify(ctx.toolInput)
      const scan = checkSecrets(inputStr)
      if (scan.has_secrets) {
        const patterns = Array.from(new Set(scan.matches.map(m => m.pattern_name)))
        try {
          const { emitEvent } = await import('fulcrum-agent-core')
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
        io.stderr(`[fulcrum/pre] Never include credentials in tool inputs. Use env vars or a secret store. Set FULCRUM_SECRET_SCAN=0 to disable this check.\n`)
        const denyMsg = `Tool call blocked: secret pattern(s) detected in tool input (${patterns.join(', ')}). Use env vars or a secret store, or set FULCRUM_SECRET_SCAN=0 to disable.`
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
  }

  // 2. Chief-of-staff no-direct-writes policy (existing behaviour)
  const isTeamInvoke = ctx.toolName.includes('invoke_team') || ctx.toolName.includes('team_invoke')
  if (isTeamInvoke && ctx.agentRole) {
    try {
      const { canInvokeTeams } = await import('fulcrum-agent-core')
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
      const { getDb } = await import('fulcrum-agent-core')
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
          // Wrap recalled content in an untrusted fence so the agent treats
          // it as data, not instructions (prompt-injection mitigation).
          io.stderr(`<fulcrum-recall trust="untrusted">\n`)
          for (const r of rows) {
            const summary = r.content.slice(0, 200).replace(/\s+/g, ' ')
            io.stderr(`  ${r.kind}: ${summary}\n`)
          }
          io.stderr(`</fulcrum-recall>\n`)
        }
      }
    } catch { /* best-effort — never block on recall failure */ }
  }

  // 3a. PR 3 R1 — reset grep-without-recall counter on recall tool calls.
  //     Any tool name containing "recall" (MCP `mcp__fulcrum__recall_knowledge`,
  //     `recall_memory`, `recall_turn_state`, etc.) signals an explicit recall
  //     happened — reset the counter so the next grep does not re-nudge.
  //     Claude `session_id` (UUID) is resolved to Fulcrum `run_id` (ULID) via
  //     the session file written by SessionStart hook before any SQLite write.
  if (
    ctx.cliName === 'claude'
    && /recall/i.test(ctx.toolName)
  ) {
    try {
      const runId = await resolveFulcrumRunId(ctx.sessionId)
      if (runId) {
        const { getDb, recordRecall, isTrustedSession, logRecallEvent } =
          await import('fulcrum-agent-core')
        const db = getDb()
        if (isTrustedSession(db, runId)) {
          recordRecall(db, { sessionId: runId, agentType: 'claude' })
          logRecallEvent({
            kind: 'recall_called',
            agent_type: 'claude',
            session_id: ctx.sessionId,
            tool_name: ctx.toolName,
          })
        }
      }
    } catch { /* best-effort */ }
  }

  // 3b. PR 3 R1 — Fulcrum-first bias nudge for search tools. Variant A: when
  //     a session has called Grep/Glob/Read without a prior `recall_knowledge`,
  //     emit an advisory stderr nudge. Never blocks. Opt out with
  //     FULCRUM_NO_RECALL_NUDGE=1. Session_id is validated against agent_runs
  //     before any SQLite write (AD-9b trust boundary). Telemetry appends to
  //     ${globalDataDir()}/telemetry/recall_bias.jsonl for the 2-week
  //     measurement gate.
  if (
    HOOK_SEARCH_TOOLS.has(ctx.toolName)
    && ctx.cliName === 'claude'
    && process.env['FULCRUM_NO_RECALL_NUDGE'] !== '1'
  ) {
    try {
      const runId = await resolveFulcrumRunId(ctx.sessionId)
      const { getDb, recordGrepWithoutRecall, isTrustedSession, logRecallEvent } =
        await import('fulcrum-agent-core')
      const db = getDb()
      if (runId && isTrustedSession(db, runId)) {
        const count = recordGrepWithoutRecall(db, {
          sessionId: runId,
          agentType: 'claude',
        })
        logRecallEvent({
          kind: 'grep_called_without_recall',
          agent_type: 'claude',
          session_id: ctx.sessionId,
          tool_name: ctx.toolName,
          grep_count_without_recall: count,
          extra: { run_id: runId },
        })
        if (count >= 1) {
          // Bias mode selection:
          //   auto (default) — try passive injection (B) first; on miss /
          //                    timeout / empty query, fall through to the
          //                    rule-nudge (A). Explicit model-initiated
          //                    recall_knowledge calls reset the counter in
          //                    section 3a above, so a recall-aware turn
          //                    produces no nudge at all.
          //   A              — rule-nudge only; never call recallMemory from
          //                    the hook.
          //   B              — alias for auto (kept for back-compat with the
          //                    measurement-window env flag).
          const mode = (process.env['FULCRUM_BIAS_VARIANT'] ?? 'auto').toUpperCase()
          const tryPassive = mode === 'AUTO' || mode === 'B'
          let variantBInjected = false
          if (tryPassive && ctx.workspace_id) {
            // Variant B (passive injection): call recallMemory silently with
            // the extracted query, prepend top results to stderr so Claude
            // sees them before the tool executes. Falls back to Variant A
            // on timeout, empty result, or empty query.
            const query = extractRecallQuery(ctx.toolName, ctx.toolInput)
            if (query) {
              try {
                const { recallMemory } = await import('fulcrum-memory')
                const recallPromise = recallMemory(
                  { workspace_id: ctx.workspace_id, query, limit: BIAS_RECALL_LIMIT },
                  db,
                )
                const result = await withTimeout(recallPromise, BIAS_RECALL_TIMEOUT_MS)
                if (result !== 'timeout' && Array.isArray(result) && result.length > 0) {
                  io.stderr(
                    `[fulcrum/pre] fulcrum-first (passive injection) — top ${result.length} recall hits for "${query.slice(0, 80)}":\n`,
                  )
                  io.stderr(`<fulcrum-recall trust="untrusted">\n`)
                  for (const row of result) {
                    const title = 'title' in row ? row.title : ''
                    const summary = ('summary' in row ? row.summary : '') ?? ''
                    const kind = 'kind' in row ? row.kind : ''
                    const snip = `${title || kind}: ${summary}`.slice(0, 240).replace(/\s+/g, ' ')
                    io.stderr(`  - ${snip}\n`)
                  }
                  io.stderr(`</fulcrum-recall>\n`)
                  logRecallEvent({
                    kind: 'passive_injection',
                    agent_type: 'claude',
                    session_id: ctx.sessionId,
                    variant: 'B',
                    tool_name: ctx.toolName,
                    grep_count_without_recall: count,
                    extra: { hit_count: result.length, query_length: query.length, mode },
                  })
                  variantBInjected = true
                }
              } catch { /* best-effort; fall through to Variant A nudge */ }
            }
          }
          if (!variantBInjected) {
            io.stderr(
              `[fulcrum/pre] fulcrum-first: you called ${ctx.toolName} without a recall this session. ` +
                `Try \`fulcrum action exec recall_knowledge\` with your question first — ` +
                `Fulcrum stores prior decisions and code relationships grep cannot see. ` +
                `Set FULCRUM_NO_RECALL_NUDGE=1 to suppress.\n`,
            )
            logRecallEvent({
              kind: 'nudge_emitted',
              agent_type: 'claude',
              session_id: ctx.sessionId,
              variant: 'A',
              tool_name: ctx.toolName,
              grep_count_without_recall: count,
              extra: { mode, auto_fallback: mode === 'AUTO' && tryPassive },
            })
          }
        }
      }
    } catch { /* best-effort — never block on nudge failure */ }
  } else if (
    HOOK_SEARCH_TOOLS.has(ctx.toolName)
    && ctx.cliName === 'claude'
    && process.env['FULCRUM_NO_RECALL_NUDGE'] === '1'
  ) {
    try {
      const { logRecallEvent } = await import('fulcrum-agent-core')
      logRecallEvent({
        kind: 'nudge_opt_out',
        agent_type: 'claude',
        session_id: ctx.sessionId,
        tool_name: ctx.toolName,
      })
    } catch { /* best-effort */ }
  }

  // 4. Write hook_event row (best-effort, never blocks the hook).
  //    Captures every tool call regardless of run_id — makes normal Claude
  //    sessions visible in the monitor without requiring start_agent_run.
  try {
    const { getDb, newId } = await import('fulcrum-agent-core')
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
  try {
    const { getDb, projectIdsFromPath, getTextEmbedder, initEmbedding, loadConfig } = await import('fulcrum-agent-core')
    const { writeMemory } = await import('fulcrum-memory')
    const { buildProvenance, dedupKey, markSeen, extractFilePatch, isMutatingBash } = await import('./hooks-writers.js')
    const db = getDb()
    // Warm the embedder so writeMemory's enqueued vec_memories embed actually
    // runs before flushPendingMemoryWrites drains below. Without this, hook
    // writes commit L0 + L1 but leave vec_memories empty — breaking recall.
    if (!getTextEmbedder()) {
      try { await initEmbedding(loadConfig()) } catch { /* non-fatal */ }
    }
    // runId may be absent (raw Claude Code sessions, opencode, etc). In that
    // case we still want file-patch memories and code-index refresh to fire —
    // fall back to project_id derived from cwd.
    const runRow = ctx.runId
      ? db.prepare(
          `SELECT task_id, project_id, context_type FROM agent_runs WHERE run_id = ? AND workspace_id = ?`,
        ).get(ctx.runId, ctx.workspace_id) as { task_id: string | null; project_id: string | null; context_type: string | null } | undefined
      : undefined
    const cwdForResolve = String(ctx.toolInput['cwd'] ?? process.cwd())
    const resolvedProjectId = runRow?.project_id ?? projectIdsFromPath(cwdForResolve).project_id

    const contextType = (runRow?.context_type as 'primary' | 'subagent' | 'cron' | 'heartbeat' | 'flush' | undefined) ?? 'primary'
    // Per-turn dedup key.
    const cwd = String(ctx.toolInput['cwd'] ?? process.cwd())
    const key = dedupKey(ctx.toolName, ctx.toolInput, cwd)
    if (!markSeen(key)) {
      io.stdout(JSON.stringify({ continue: true } satisfies HookOutput))
      io.exit(0)
      return
    }

    // Memory v3 L0 ingest — FULCRUM_MEMORY_V3 flag retired in PR 9.5.
    // Every hook-side write now goes through ingestRawSource; the v2a
    // writeMemory fallback has been removed.
    const filePatch = extractFilePatch(ctx.toolName, ctx.toolInput)
    if (filePatch) {
      const { ingestRawSource } = await import('fulcrum-memory')
      ingestRawSource({
        source_type: 'file_patch',
        body: filePatch.diffSummary,
        meta: {
          workspace_id: ctx.workspace_id,
          project_id: resolvedProjectId,
          session_id: ctx.runId ?? null,
          cwd,
        },
      })

      // Refresh the code index for the changed file. Hook-driven indexing is
      // the primary mechanism (MCP's server watcher is just a fallback for
      // hook-less clients). No-op when the file is outside the project root
      // or the extension isn't in the ingest list.
      try {
        const { ingestFile } = await import('fulcrum-memory')
        const { readFileSync, statSync } = await import('node:fs')
        const { extname, isAbsolute, relative } = await import('node:path')
        const abs = isAbsolute(filePatch.filePath) ? filePatch.filePath : `${process.cwd()}/${filePatch.filePath}`
        const ext = extname(abs).toLowerCase()
        if (new Set(['.ts', '.tsx', '.js', '.jsx', '.py', '.md']).has(ext)) {
          const st = statSync(abs)
          if (st.isFile() && st.size < 5_000_000) {
            const content = readFileSync(abs, 'utf8')
            const relPath = relative(process.cwd(), abs)
            await ingestFile({
              workspace_id: ctx.workspace_id,
              project_id:   resolvedProjectId,
              file_path:    relPath,
              content,
              language:     ext === '.ts' || ext === '.tsx' ? 'typescript'
                          : ext === '.js' || ext === '.jsx' ? 'javascript'
                          : ext === '.py'                    ? 'python'
                          : ext === '.md'                    ? 'markdown'
                          : undefined,
            })
          }
        }
      } catch (err) {
        process.stderr.write(`[fulcrum hook] code-index refresh failed for ${filePatch.filePath}: ${(err as Error).message}\n`)
      }
    } else if (ctx.toolName === 'Bash') {
      const command = String(ctx.toolInput['command'] ?? '')
      if (!isMutatingBash(command)) {
        // Read-only command — skip silently (Task 30 allowlist invert).
        io.stdout(JSON.stringify({ continue: true } satisfies HookOutput))
        io.exit(0)
        return
      }
      const exitStatus = (ctx.toolInput['exit_status'] as number | undefined) ?? 0
      const { ingestRawSource } = await import('fulcrum-memory')
      // Plan §PR 1 unit 1.4: full body, no slice — L0 captures verbatim.
      ingestRawSource({
        source_type: 'bash_trace',
        body: `$ ${command}\nexit: ${exitStatus}\ncwd: ${cwd}\n`,
        meta: {
          workspace_id: ctx.workspace_id,
          project_id: resolvedProjectId,
          session_id: ctx.runId ?? null,
          cwd,
        },
      })
    }
    // else: read-only tool; no write.
  } catch (err) {
    io.stderr(`[fulcrum/post] typed-write failed: ${(err as Error).message}\n`)
    // Non-blocking.
  }
  // Drain fire-and-forget embed/extract work before process exits so the
  // short-lived hook CLI doesn't leave rows committed without embeddings.
  try {
    const { flushPendingMemoryWrites } = await import('fulcrum-memory')
    await flushPendingMemoryWrites(8_000)
  } catch { /* non-fatal — flush is best-effort */ }
  io.stdout(JSON.stringify({ continue: true } satisfies HookOutput))
  io.exit(0)
}
