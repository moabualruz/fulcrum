// v2a PR 6 Tasks 29-32 — typed hook writers.
//
// Extracts real values from tool_input (file_path, content, command) and
// emits kind-specific memories with full provenance. Per-turn dedup via
// sha256(tool_name + normalized_args + cwd) — duplicates bump
// recall_count_within_turn instead of inserting new rows.
//
// Keeping this in a sibling module instead of bloating hooks.ts lets PR 6's
// diff focus on the writer contracts and the per-turn dedup map.

import { createHash } from 'node:crypto'
import type { Db } from 'fulcrum-core'
import type { HookCli, HookContext } from 'fulcrum-core'

export type PrimaryContextType = 'primary' | 'subagent' | 'cron' | 'heartbeat' | 'flush'

export interface TypedWriteResult {
  inserted: boolean
  memoryId?: string
  reason?: 'dup' | 'no-extract' | 'skip-readonly' | 'error'
}

/** Per-process dedup cache. Cleared between tests via clearDedupCache(). */
const _dedupCache = new Map<string, number>()

export function dedupKey(toolName: string, toolInput: Record<string, unknown>, cwd: string): string {
  const normalized = JSON.stringify({ name: toolName, input: toolInput, cwd })
  return createHash('sha256').update(normalized).digest('hex')
}

export function clearDedupCache(): void {
  _dedupCache.clear()
}

export function markSeen(key: string): boolean {
  const was = _dedupCache.has(key)
  _dedupCache.set(key, (_dedupCache.get(key) ?? 0) + 1)
  return !was
}

// ── Task 30 — Bash allowlist of mutating verbs ───────────────────────────────

const MUTATING_VERBS = new Set([
  'rm', 'mv', 'cp', 'mkdir', 'chmod', 'chown',
  'npm', 'pnpm', 'yarn', 'bun',
  'docker', 'kubectl', 'terraform',
])

const GIT_MUTATING_SUBCOMMANDS = new Set([
  'commit', 'push', 'merge', 'rebase', 'checkout', 'reset', 'tag', 'branch',
])

const REDIRECT_TOKENS = new Set(['>', '>>', '|', '&&', ';'])

export function isMutatingBash(command: string): boolean {
  const trimmed = command.trim()
  if (!trimmed) return false

  // Tokenize preserving redirect/pipeline operators.
  const tokens = trimmed.split(/\s+/)

  // Scan every token group — `ls && rm x` is mutating because rm follows &&.
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]
    if (!tok) continue
    // Check for sed -i (in-place edit is mutating).
    if (tok === 'sed') {
      const next = tokens[i + 1]
      if (next && next.startsWith('-i')) return true
    }
    // `tee` without -a is mutating.
    if (tok === 'tee') {
      const next = tokens[i + 1]
      if (!next || !next.startsWith('-a')) return true
    }
    // Plain mutating verb.
    if (MUTATING_VERBS.has(tok)) return true
    // Git subcommand.
    if (tok === 'git' && i + 1 < tokens.length) {
      const sub = tokens[i + 1]
      if (sub && GIT_MUTATING_SUBCOMMANDS.has(sub)) return true
    }
    // Redirect / pipeline → the next chunk may be mutating even if preceding
    // token wasn't. Recurse on the rest of the command.
    if (REDIRECT_TOKENS.has(tok) && i + 1 < tokens.length) {
      const tail = tokens.slice(i + 1).join(' ')
      if (isMutatingBash(tail)) return true
    }
  }
  return false
}

// ── Task 29 — file_patch extraction ─────────────────────────────────────────

export interface FilePatchExtract {
  filePath: string
  diffSummary: string
  operation: 'write' | 'edit' | 'multi-edit' | 'notebook-edit'
}

export function extractFilePatch(toolName: string, toolInput: Record<string, unknown>): FilePatchExtract | null {
  if (toolName === 'Write') {
    const filePath = String(toolInput['file_path'] ?? toolInput['path'] ?? '')
    const content = String(toolInput['content'] ?? '')
    if (!filePath) return null
    return {
      filePath,
      operation: 'write',
      diffSummary: summarizeDiff('', content).slice(0, 800),
    }
  }
  if (toolName === 'Edit') {
    const filePath = String(toolInput['file_path'] ?? toolInput['path'] ?? '')
    const oldString = String(toolInput['old_string'] ?? '')
    const newString = String(toolInput['new_string'] ?? '')
    if (!filePath) return null
    return {
      filePath,
      operation: 'edit',
      diffSummary: summarizeDiff(oldString, newString).slice(0, 800),
    }
  }
  if (toolName === 'MultiEdit') {
    const filePath = String(toolInput['file_path'] ?? toolInput['path'] ?? '')
    const edits = Array.isArray(toolInput['edits']) ? toolInput['edits'] as Array<Record<string, unknown>> : []
    if (!filePath) return null
    const parts: string[] = []
    for (const e of edits) {
      parts.push(summarizeDiff(String(e['old_string'] ?? ''), String(e['new_string'] ?? '')))
    }
    return {
      filePath,
      operation: 'multi-edit',
      diffSummary: parts.join('; ').slice(0, 800),
    }
  }
  if (toolName === 'NotebookEdit') {
    const filePath = String(toolInput['notebook_path'] ?? toolInput['file_path'] ?? toolInput['path'] ?? '')
    const newSource = String(toolInput['new_source'] ?? '')
    if (!filePath) return null
    return {
      filePath,
      operation: 'notebook-edit',
      diffSummary: summarizeDiff('', newSource).slice(0, 800),
    }
  }
  return null
}

export function summarizeDiff(oldStr: string, newStr: string): string {
  const oldLines = oldStr.split('\n').filter(Boolean).length
  const newLines = newStr.split('\n').filter(Boolean).length
  const delta = newLines - oldLines
  const deltaSign = delta >= 0 ? '+' : ''
  const preview = (newStr || oldStr).slice(0, 120).replace(/\n/g, ' ')
  return `${deltaSign}${delta} lines; ${preview}`
}

// ── Provenance ──────────────────────────────────────────────────────────────

export interface WriteProvenance {
  agent_role: string
  run_id: string
  hook_point: 'PostToolUse' | 'Stop' | 'PreCompact' | 'SessionEnd'
  source_kind: HookCli
  parent_memory_id?: string
  context_type: PrimaryContextType
  confidence: number
  [k: string]: unknown
}

export function buildProvenance(ctx: HookContext, hook_point: WriteProvenance['hook_point'], context_type: PrimaryContextType): WriteProvenance {
  return {
    agent_role: ctx.agentRole || 'unknown',
    run_id: ctx.runId,
    hook_point,
    source_kind: ctx.cliName,
    context_type,
    confidence: 1.0,
  }
}

// ── Task 31 — session_summary race-safe insert ───────────────────────────────

export function sessionSummaryUniqueConstraintError(err: unknown): boolean {
  const msg = (err as { message?: string; code?: string } | undefined)?.message ?? ''
  const code = (err as { code?: string } | undefined)?.code ?? ''
  return msg.includes('UNIQUE') || code === 'SQLITE_CONSTRAINT' || msg.includes('SQLITE_CONSTRAINT')
}

export function hasTaskOutcomeForRun(db: Db, runId: string): boolean {
  try {
    const row = db.prepare(
      `SELECT memory_id FROM memories
       WHERE json_extract(COALESCE(provenance, '{}'), '$.run_id') = ?
         AND kind IN ('task_outcome', 'blocker_resolution')
       LIMIT 1`,
    ).get(runId) as { memory_id: string } | undefined
    return !!row
  } catch { return false }
}
