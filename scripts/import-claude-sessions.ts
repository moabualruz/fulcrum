#!/usr/bin/env node
/**
 * scripts/import-claude-sessions.ts
 *
 * Imports agent CLI session histories into the Fulcrum vault:
 *   - Claude Code: ~/.claude/projects/<project>/<session>.jsonl
 *   - Codex:       ~/.codex/sessions/<yyyy>/<mm>/<dd>/<session>.jsonl
 *   - Qwen Code:   ~/.qwen/tmp/<session>/logs.json
 *
 * Claude vault IDs are intentionally unchanged from the original importer so
 * re-runs skip previously imported Claude memories instead of duplicating them.
 * New agent sources prefix the deterministic ID seed with the source name.
 *
 * Handles three session patterns:
 *   1. Summary sessions   — small sessions that just generate a <summary> block
 *   2. Interactive sessions — normal Claude Code conversations with real user messages
 *   3. Agentic sessions   — orchestrator sessions started from @prompt.md, no direct user input
 *
 * Per-session vault entries:
 *   task_goal    — first real user request or initial prompt attachment
 *   summary      — <summary>…</summary> blocks in assistant responses
 *   task_outcome — significant final assistant responses (when no summary block exists)
 *
 * Canonical order preservation:
 *   - Memories sort globally by event_time before write, so FTS5 rowid order
 *     matches temporal order.
 *   - Vault filenames are prefixed with ISO timestamp so filesystem `ls` shows
 *     conversations in the order they happened.
 *   - Vault subdirs are yyyy/mm/dd for finer temporal partitioning.
 *   - DB created_at is set from each memory's event_time (insertMemoryDirect
 *     reads it from frontmatter and passes it to the INSERT, not datetime('now')).
 *
 * Usage:
 *   npx tsx scripts/import-claude-sessions.ts [--dry-run] [--limit N] [--project DIR] [--source all|claude,codex,qwen] [--skip-embed]
 *     --dry-run    : parse + print breakdown, don't write vault files or rebuild
 *     --limit N    : cap sessions per project/source (testing)
 *     --project D  : restrict to one ~/.claude/projects/<D> directory
 *     --source S   : import all sources by default; accepts comma-separated values
 *     --skip-embed : rebuild L1 after writes but do not run vector embedding
 */

import { createReadStream, mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { createInterface } from 'readline'
import { join, dirname, basename, resolve as resolvePath } from 'path'
import { homedir } from 'os'
import { createHash } from 'crypto'
import { readdirSync, statSync } from 'fs'
import { execFileSync, execSync } from 'child_process'

// ── Config ────────────────────────────────────────────────────────────────────

const CLAUDE_PROJECTS_ROOT = join(homedir(), '.claude', 'projects')
const CODEX_SESSIONS_ROOT = join(homedir(), '.codex', 'sessions')
const QWEN_TMP_ROOT = join(homedir(), '.qwen', 'tmp')
const GEMINI_TMP_ROOT = join(homedir(), '.gemini', 'tmp')
const PI_SESSIONS_ROOT = join(homedir(), '.pi', 'agent', 'sessions')
// Vault = L0 markdown store. Kept at ~/.fulcrum/vault (NOT globalDataDir) to
// match getVaultPath() in fulcrum-memory. Override via FULCRUM_VAULT_PATH.
const VAULT_PATH = process.env['FULCRUM_VAULT_PATH'] ?? join(homedir(), '.fulcrum', 'vault')

const DRY_RUN = process.argv.includes('--dry-run')
const LIMIT_IDX = process.argv.indexOf('--limit')
const LIMIT = LIMIT_IDX >= 0 ? parseInt(process.argv[LIMIT_IDX + 1] ?? '10', 10) : Infinity
const PROJECT_IDX = process.argv.indexOf('--project')
const ONLY_PROJECT = PROJECT_IDX >= 0 ? process.argv[PROJECT_IDX + 1] : null
const SOURCE_IDX = process.argv.findIndex(arg => arg === '--source' || arg === '--sources')
const SOURCE_ARG = SOURCE_IDX >= 0 ? process.argv[SOURCE_IDX + 1] : 'all'
const SKIP_EMBED = process.argv.includes('--skip-embed')
const FULCRUM_CLI = process.env['FULCRUM_CLI'] ?? './fulcrum'

type SourceAgent = 'claude' | 'codex' | 'gemini' | 'opencode' | 'pi' | 'qwen' | 'copilot'
const ALL_SOURCES: SourceAgent[] = ['claude', 'codex', 'gemini', 'opencode', 'pi', 'qwen', 'copilot']

function parseSources(raw: string | undefined): SourceAgent[] {
  if (!raw || raw === 'all') return ALL_SOURCES
  const values = raw.split(',').map(s => s.trim()).filter(Boolean)
  const invalid = values.filter(s => !ALL_SOURCES.includes(s as SourceAgent))
  if (invalid.length > 0) {
    console.error(`Unknown source(s): ${invalid.join(', ')}. Expected all, ${ALL_SOURCES.join(', ')}, or comma list.`)
    process.exit(1)
  }
  return values as SourceAgent[]
}

const SOURCES = parseSources(SOURCE_ARG)

// ── Types ─────────────────────────────────────────────────────────────────────

interface RawMessage {
  type: string
  uuid?: string
  parentUuid?: string | null
  timestamp?: string
  sessionId?: string
  slug?: string
  message?: {
    role?: string
    content?: string | Array<{ type: string; text?: string; name?: string; input?: unknown } | string>
  }
  toolUseResult?: string
  content?: string       // queue-operation content
  attachment?: string | Record<string, unknown>  // attachment data (stringified or object)
  lastPrompt?: string
  operation?: string     // queue-operation: enqueue/dequeue
}

interface ExtractedMemory {
  memory_id: string
  source_agent?: SourceAgent
  kind: 'task_goal' | 'summary' | 'task_outcome'
  scope: 'project'
  title: string
  summary: string
  content: string
  tags: string[]
  importance: number
  confidence: number
  event_time: string
  created_at: string
  session_id: string
  workspace_id: string
  project_id: string
  project_root: string
}

/**
 * Read the first RawMessage that carries `cwd` and return that directory.
 * Synchronous read to avoid an observed tsx/ESM race where readline's
 * 'close' event can resolve the Promise with null before a 'line' event's
 * resolve() is observed. The cwd is always within the first handful of
 * lines (Claude Code's first user-bounded message), so reading a 64KB
 * prefix is plenty and avoids loading multi-MB files.
 */
function readSessionCwd(filePath: string): string | null {
  let buf: Buffer
  try {
    buf = readFileSync(filePath)
  } catch {
    return null
  }
  // Only scan the prefix — cwd always lands in the first few KB.
  const prefix = buf.slice(0, Math.min(buf.length, 64 * 1024)).toString('utf-8')
  for (const line of prefix.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const msg = JSON.parse(trimmed) as { cwd?: string }
      if (typeof msg.cwd === 'string' && msg.cwd.length > 0) return msg.cwd
    } catch { /* skip malformed */ }
  }
  return null
}

/**
 * Replicates fulcrum-agent-core's projectIdsFromPath inline so this script
 * runs without resolving workspace packages (scripts/ doesn't link to core).
 * Keep in lockstep with packages/core/src/ids.ts.
 */
function getProjectIds(cwd: string): { workspace_id: string; project_id: string } {
  const resolved = resolvePath(cwd)
  const hash = createHash('sha256').update(resolved).digest('hex').slice(0, 12)
  const sanitizedName = basename(resolved).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 24) || 'project'
  return {
    workspace_id: `ws_${sanitizedName}_${hash}`,
    project_id: `proj_${sanitizedName}_${hash}`,
  }
}

// ── ID generation (deterministic from session + kind + index) ─────────────────

function deterministicMemoryId(sessionId: string, kind: string, index: number): string {
  const hash = createHash('sha256')
    .update(`${sessionId}:${kind}:${index}`)
    .digest('hex')
    .slice(0, 26)
    .toUpperCase()
  const prefix = kind === 'task_goal' ? 'mem_tg_' :
                 kind === 'summary' ? 'mem_su_' : 'mem_to_'
  return prefix + hash
}

function sourceScopedSessionId(source: SourceAgent, sessionId: string): string {
  // Preserve historical Claude IDs; scope every newer source to avoid collisions.
  return source === 'claude' ? sessionId : `${source}:${sessionId}`
}

// ── Text extraction helpers ───────────────────────────────────────────────────

function extractTextFromContent(content: RawMessage['message']): string {
  if (!content?.content) return ''
  // content.content may be a plain string or an array of content blocks
  if (typeof content.content === 'string') return content.content.trim()
  const parts: string[] = []
  for (const c of content.content) {
    if (typeof c === 'string') {
      parts.push(c)
    } else if (c.type === 'text' && c.text) {
      parts.push(c.text)
    }
  }
  return parts.join('\n').trim()
}

function extractTextFromBlocks(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  const parts: string[] = []
  for (const c of content) {
    if (typeof c === 'string') {
      parts.push(c)
      continue
    }
    if (!c || typeof c !== 'object') continue
    const block = c as Record<string, unknown>
    const text = block['text']
    const type = block['type']
    if (typeof text === 'string' && (type === 'text' || type === 'input_text' || type === 'output_text' || !type)) {
      parts.push(text)
    }
  }
  return parts.join('\n').trim()
}

/** Extract <summary>…</summary> block from text */
function extractSummaryBlock(text: string): string | null {
  const m = text.match(/<summary>([\s\S]*?)<\/summary>/i)
  return m ? m[1].trim() : null
}

/** True if the user message is Claude Code's auto-summary generation template */
function isSummaryRequest(text: string): boolean {
  return text.includes('Context: This summary will be shown in a list') ||
    text.includes('Please write a concise, factual summary of this conversation')
}

/** True if the user message is injected skill/system context (not a real human message) */
function isInjectedContext(text: string): boolean {
  if (text === '[Request interrupted by user]') return true
  if (text === '[Request interrupted by user for tool use]') return true
  if (text.startsWith('# AGENTS.md instructions for')) return true
  if (text.startsWith('<INSTRUCTIONS>') || text.includes('\n<INSTRUCTIONS>')) return true
  if (text.startsWith('<environment_context>')) return true
  if (text.startsWith('Base directory for this skill:')) return true
  if (text.startsWith('<command-name>')) return true
  if (text.startsWith('<system-reminder>')) return true
  if (text.startsWith('<local-command-')) return true  // <local-command-caveat>, <local-command-stdout>, etc.
  if (text.startsWith('<task-notification>')) return true
  if (text.startsWith('use the Bash tool to run:')) return true
  if (text.startsWith('<')) return true  // Any XML-like system injection
  if (text.startsWith('This session is being continued from a previous conversation')) return true
  if (text.startsWith('This is the summarized conversation state:')) return true
  if (text.startsWith('Note: /home/')) return true  // system-reminder notes
  if (text.startsWith('/') && !text.includes(' ')) return true // slash-only CLI control command
  if (text.length < 25) return true
  return false
}

function sourceTag(source: SourceAgent): string {
  return `agent:${source}`
}

function normalizeMemorySource(memory: ExtractedMemory): void {
  const source = memory.source_agent ?? 'claude'
  memory.source_agent = source
  const tag = sourceTag(source)
  if (!memory.tags.includes(tag)) memory.tags.push(tag)
}

function makeSessionMemory(input: {
  source: SourceAgent
  session_id: string
  kind: ExtractedMemory['kind']
  index: number
  ctx: SessionContext
  titlePrefix: string
  text: string
  event_time: string
  tags: string[]
  importance: number
  confidence: number
}): ExtractedMemory {
  const title = input.text.slice(0, 80).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
  return {
    memory_id: deterministicMemoryId(sourceScopedSessionId(input.source, input.session_id), input.kind, input.index),
    source_agent: input.source,
    kind: input.kind,
    scope: 'project',
    title: `${input.titlePrefix}: ${title}`,
    summary: title,
    content: input.text.slice(0, 4000),
    tags: input.tags,
    importance: input.importance,
    confidence: input.confidence,
    event_time: input.event_time,
    created_at: input.event_time,
    session_id: input.session_id,
    workspace_id: input.ctx.workspace_id,
    project_id: input.ctx.project_id,
    project_root: input.ctx.project_root,
  }
}

function runFulcrum(args: string): void {
  execSync(`${FULCRUM_CLI} ${args}`, { stdio: 'inherit', cwd: process.cwd() })
}

/** True if the assistant text is substantive (not a navigation one-liner) */
function isSubstantive(text: string): boolean {
  if (text.length < 100) return false
  const boring = [
    /^let me (check|look|find|read|examine|search)/i,
    /^i('ll| will) (check|look|find|read|examine|search)/i,
    /^now (let me|i'll)/i,
    /^(checking|looking at|reading|examining)/i,
  ]
  return !boring.some(r => r.test(text.slice(0, 60)))
}

/** Parse attachment — may be a stringified Python dict or a plain object */
function parseAttachment(raw: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof raw === 'object') return raw
  try {
    // Claude stores attachments as stringified Python-style dicts; JSON is close enough for our purposes
    // Replace Python single-quotes conservatively for the parts we care about
    return JSON.parse(raw.replace(/'/g, '"').replace(/True/g, 'true').replace(/False/g, 'false').replace(/None/g, 'null'))
  } catch {
    return {}
  }
}

// ── Stream-parse one session file and extract memories ───────────────────────

interface SessionContext {
  source_agent: SourceAgent
  workspace_id: string
  project_id: string
  project_root: string
}

async function parseSession(filePath: string, ctx: SessionContext): Promise<ExtractedMemory[]> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity })
    const messages: RawMessage[] = []

    rl.on('line', (line) => {
      const trimmed = line.trim()
      if (!trimmed) return
      try {
        messages.push(JSON.parse(trimmed) as RawMessage)
      } catch {
        // skip malformed lines
      }
    })

    rl.on('close', () => resolve(extractMemoriesFromMessages(messages, ctx)))
    rl.on('error', reject)
  })
}

function extractMemoriesFromMessages(messages: RawMessage[], ctx: SessionContext): ExtractedMemory[] {
  const memories: ExtractedMemory[] = []

  // Sort by timestamp for within-session canonical order; skip messages without timestamps
  const dated = messages.filter(m => m.timestamp)
  dated.sort((a, b) => (a.timestamp! < b.timestamp! ? -1 : 1))

  const sessionId = dated.find(m => m.sessionId)?.sessionId ?? 'unknown'
  const firstTs = dated[0]?.timestamp ?? new Date().toISOString()

  // ── 1. Summary blocks in assistant responses ────────────────────────────────
  let summaryIdx = 0
  for (const msg of dated) {
    if (msg.type !== 'assistant') continue
    const text = extractTextFromContent(msg.message)
    if (!text) continue
    const block = extractSummaryBlock(text)
    if (block && block.length > 50) {
      const title = block.slice(0, 80).replace(/\n/g, ' ').trim()
      memories.push({
        memory_id: deterministicMemoryId(sessionId, 'summary', summaryIdx++),
        kind: 'summary',
        scope: 'project',
        title: `Summary: ${title}`,
        summary: title,
        content: block.slice(0, 4000),
        tags: ['session', 'summary'],
        importance: 0.8,
        confidence: 1.0,
        event_time: msg.timestamp!,
        created_at: msg.timestamp!,
        session_id: sessionId,
        workspace_id: ctx.workspace_id,
        project_id: ctx.project_id,
        project_root: ctx.project_root,
      })
    }
  }

  // ── 2. Real user task goals ────────────────────────────────────────────────
  // Look for genuine human messages that aren't templates/system injections
  let foundGoal = false
  for (const msg of dated) {
    if (msg.type !== 'user') continue
    const text = extractTextFromContent(msg.message)
    if (!text || isSummaryRequest(text) || isInjectedContext(text)) continue
    foundGoal = true
    const title = text.slice(0, 80).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
    memories.push({
      memory_id: deterministicMemoryId(sessionId, 'task_goal', 0),
      kind: 'task_goal',
      scope: 'project',
      title: `Goal: ${title}`,
      summary: title,
      content: text.slice(0, 4000),
      tags: ['session', 'user-request'],
      importance: 0.7,
      confidence: 1.0,
      event_time: msg.timestamp!,
      created_at: msg.timestamp!,
      session_id: sessionId,
      workspace_id: ctx.workspace_id,
      project_id: ctx.project_id,
      project_root: ctx.project_root,
    })
    break
  }

  // ── 3. Agentic sessions: extract prompt from file attachments ──────────────
  // When no real user message exists, look for the initial @prompt.md attachment
  if (!foundGoal) {
    for (const msg of dated) {
      if (msg.type !== 'attachment') continue
      let att: Record<string, unknown> = {}
      if (msg.attachment) {
        att = parseAttachment(msg.attachment as string | Record<string, unknown>)
      }
      const attType = att['type'] as string | undefined
      const filename = att['filename'] as string | undefined
      // Only use the first "file" attachment with .md or prompt-looking name
      if (attType === 'file' && filename) {
        const bn = basename(filename).toLowerCase()
        if (bn.includes('prompt') || bn === 'claude.md' || bn === 'spec.md' || bn.endsWith('.md')) {
          const contentObj = att['content'] as Record<string, unknown> | undefined
          const fileObj = contentObj?.['file'] as Record<string, unknown> | undefined
          const fileContent = fileObj?.['content'] as string | undefined
          if (fileContent && fileContent.length > 50) {
            const text = fileContent.slice(0, 2000)
            const title = text.slice(0, 80).replace(/\n/g, ' ').trim()
            memories.push({
              memory_id: deterministicMemoryId(sessionId, 'task_goal', 0),
              kind: 'task_goal',
              scope: 'project',
              title: `Prompt: ${title}`,
              summary: title,
              content: text,
              tags: ['session', 'agentic', 'prompt'],
              importance: 0.65,
              confidence: 0.9,
              event_time: msg.timestamp ?? firstTs,
              created_at: msg.timestamp ?? firstTs,
              session_id: sessionId,
              workspace_id: ctx.workspace_id,
              project_id: ctx.project_id,
              project_root: ctx.project_root,
            })
            break
          }
        }
      }
    }
  }

  // ── 4. Queue-operation task notification summaries ─────────────────────────
  // When an agentic task completes, a <summary>…</summary> is in the queue-operation content
  let queueSummaryIdx = 0
  for (const msg of dated) {
    if (msg.type !== 'queue-operation') continue
    if (msg.operation !== 'enqueue') continue
    const content = msg.content ?? ''
    if (!content) continue
    const taskSummaryMatch = content.match(/<summary>([\s\S]*?)<\/summary>/i)
    if (taskSummaryMatch) {
      const block = taskSummaryMatch[1].trim()
      if (block.length > 30) {
        const title = block.slice(0, 80).replace(/\n/g, ' ').trim()
        memories.push({
          memory_id: deterministicMemoryId(sessionId, 'task_outcome', queueSummaryIdx++),
          kind: 'task_outcome',
          scope: 'project',
          title: `Task: ${title}`,
          summary: title,
          content: block.slice(0, 3000),
          tags: ['session', 'task-outcome', 'agentic'],
          importance: 0.65,
          confidence: 0.9,
          event_time: msg.timestamp ?? firstTs,
          created_at: msg.timestamp ?? firstTs,
          session_id: sessionId,
          workspace_id: ctx.workspace_id,
          project_id: ctx.project_id,
          project_root: ctx.project_root,
        })
      }
    }
  }

  // ── 5. Final substantive assistant outcome (fallback) ─────────────────────
  // Only add when there's no summary and no queue summary, to avoid noise
  if (summaryIdx === 0 && queueSummaryIdx === 0) {
    const assistantMessages = dated.filter(m => m.type === 'assistant')
    for (let i = assistantMessages.length - 1; i >= 0; i--) {
      const msg = assistantMessages[i]
      const text = extractTextFromContent(msg.message)
      if (!text || !isSubstantive(text)) continue
      const title = text.slice(0, 80).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
      memories.push({
        memory_id: deterministicMemoryId(sessionId, 'task_outcome', 0),
        kind: 'task_outcome',
        scope: 'project',
        title: `Outcome: ${title}`,
        summary: title,
        content: text.slice(0, 4000),
        tags: ['session', 'outcome'],
        importance: 0.55,
        confidence: 0.85,
        event_time: msg.timestamp!,
        created_at: msg.timestamp!,
        session_id: sessionId,
        workspace_id: ctx.workspace_id,
        project_id: ctx.project_id,
        project_root: ctx.project_root,
      })
      break
    }
  }

  return memories
}

// ── Codex / Qwen session importers ───────────────────────────────────────────

interface CodexRecord {
  timestamp?: string
  type?: string
  payload?: Record<string, unknown>
}

interface QwenRecord {
  timestamp?: string
  sessionId?: string
  type?: string
  role?: string
  message?: unknown
  content?: unknown
  cwd?: string
}

interface ParsedSession {
  ctx: SessionContext
  session_id: string
  memories: ExtractedMemory[]
}

async function readJsonlRecords(filePath: string): Promise<CodexRecord[]> {
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity })
    const records: CodexRecord[] = []
    rl.on('line', (line) => {
      const trimmed = line.trim()
      if (!trimmed) return
      try {
        records.push(JSON.parse(trimmed) as CodexRecord)
      } catch {
        // skip malformed lines
      }
    })
    rl.on('close', () => resolve(records))
    rl.on('error', reject)
  })
}

function codexPayloadText(payload: Record<string, unknown> | undefined): string {
  if (!payload) return ''
  const fromContent = extractTextFromBlocks(payload['content'])
  if (fromContent) return fromContent
  if (typeof payload['message'] === 'string') return payload['message'].trim()
  const item = payload['item']
  if (item && typeof item === 'object') {
    const itemRecord = item as Record<string, unknown>
    const fromItem = extractTextFromBlocks(itemRecord['content'])
    if (fromItem) return fromItem
  }
  return ''
}

function firstPayloadString(records: CodexRecord[], keys: string[]): string | null {
  for (const record of records) {
    const payload = record.payload
    if (!payload) continue
    for (const key of keys) {
      const value = payload[key]
      if (typeof value === 'string' && value.length > 0) return value
    }
  }
  return null
}

async function parseCodexSession(filePath: string): Promise<ParsedSession | null> {
  const records = await readJsonlRecords(filePath)
  if (records.length === 0) return null

  const dated = records.filter(r => r.timestamp)
  dated.sort((a, b) => (a.timestamp! < b.timestamp! ? -1 : 1))
  const firstTs = dated[0]?.timestamp ?? new Date().toISOString()

  const sessionId =
    firstPayloadString(records.filter(r => r.type === 'session_meta'), ['id']) ??
    basename(filePath).replace(/\.jsonl$/, '')
  const cwd = firstPayloadString(records, ['cwd']) ?? process.cwd()
  const { workspace_id, project_id } = getProjectIds(cwd)
  const ctx: SessionContext = { source_agent: 'codex', workspace_id, project_id, project_root: cwd }
  const seed = sourceScopedSessionId('codex', sessionId)
  const memories: ExtractedMemory[] = []

  let summaryIdx = 0
  for (const record of dated) {
    const payload = record.payload
    if (!payload) continue

    const summary = typeof payload['summary'] === 'string' ? payload['summary'].trim() : ''
    if (summary.length > 100 && !isInjectedContext(summary)) {
      const title = summary.slice(0, 80).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
      memories.push({
        memory_id: deterministicMemoryId(seed, 'summary', summaryIdx++),
        source_agent: 'codex',
        kind: 'summary',
        scope: 'project',
        title: `Codex Summary: ${title}`,
        summary: title,
        content: summary.slice(0, 4000),
        tags: ['session', 'summary'],
        importance: 0.75,
        confidence: 0.9,
        event_time: record.timestamp!,
        created_at: record.timestamp!,
        session_id: sessionId,
        workspace_id,
        project_id,
        project_root: cwd,
      })
    }

    if (payload['role'] !== 'assistant') continue
    const block = extractSummaryBlock(codexPayloadText(payload))
    if (block && block.length > 50) {
      const title = block.slice(0, 80).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
      memories.push({
        memory_id: deterministicMemoryId(seed, 'summary', summaryIdx++),
        source_agent: 'codex',
        kind: 'summary',
        scope: 'project',
        title: `Codex Summary: ${title}`,
        summary: title,
        content: block.slice(0, 4000),
        tags: ['session', 'summary'],
        importance: 0.8,
        confidence: 1.0,
        event_time: record.timestamp!,
        created_at: record.timestamp!,
        session_id: sessionId,
        workspace_id,
        project_id,
        project_root: cwd,
      })
    }
  }

  for (const record of dated) {
    const payload = record.payload
    if (!payload || payload['role'] !== 'user') continue
    const text = codexPayloadText(payload)
    if (!text || isSummaryRequest(text) || isInjectedContext(text)) continue
    const title = text.slice(0, 80).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
    memories.push({
      memory_id: deterministicMemoryId(seed, 'task_goal', 0),
      source_agent: 'codex',
      kind: 'task_goal',
      scope: 'project',
      title: `Codex Goal: ${title}`,
      summary: title,
      content: text.slice(0, 4000),
      tags: ['session', 'user-request'],
      importance: 0.7,
      confidence: 0.95,
      event_time: record.timestamp!,
      created_at: record.timestamp!,
      session_id: sessionId,
      workspace_id,
      project_id,
      project_root: cwd,
    })
    break
  }

  if (summaryIdx === 0) {
    const assistantRecords = dated.filter(r => r.payload?.['role'] === 'assistant')
    for (let i = assistantRecords.length - 1; i >= 0; i--) {
      const record = assistantRecords[i]
      const text = codexPayloadText(record.payload)
      if (!text || !isSubstantive(text)) continue
      const title = text.slice(0, 80).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
      memories.push({
        memory_id: deterministicMemoryId(seed, 'task_outcome', 0),
        source_agent: 'codex',
        kind: 'task_outcome',
        scope: 'project',
        title: `Codex Outcome: ${title}`,
        summary: title,
        content: text.slice(0, 4000),
        tags: ['session', 'outcome'],
        importance: 0.55,
        confidence: 0.85,
        event_time: record.timestamp!,
        created_at: record.timestamp!,
        session_id: sessionId,
        workspace_id,
        project_id,
        project_root: cwd,
      })
      break
    }
  }

  return { ctx, session_id: sessionId, memories }
}

function qwenRecordText(record: QwenRecord): string {
  if (typeof record.message === 'string') return record.message.trim()
  const contentText = extractTextFromBlocks(record.content)
  if (contentText) return contentText
  return ''
}

function parseQwenSession(filePath: string): ParsedSession | null {
  let records: QwenRecord[]
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as unknown
    if (!Array.isArray(parsed)) return null
    records = parsed as QwenRecord[]
  } catch {
    return null
  }
  if (records.length === 0) return null

  const dated = records.filter(r => r.timestamp)
  dated.sort((a, b) => (a.timestamp! < b.timestamp! ? -1 : 1))
  const firstTs = dated[0]?.timestamp ?? new Date().toISOString()
  const sessionId = dated.find(r => typeof r.sessionId === 'string')?.sessionId ?? basename(dirname(filePath))
  const cwd = dated.find(r => typeof r.cwd === 'string')?.cwd ?? process.cwd()
  const { workspace_id, project_id } = getProjectIds(cwd)
  const ctx: SessionContext = { source_agent: 'qwen', workspace_id, project_id, project_root: cwd }
  const seed = sourceScopedSessionId('qwen', sessionId)
  const memories: ExtractedMemory[] = []

  let summaryIdx = 0
  for (const record of dated) {
    const role = record.role ?? record.type
    if (role !== 'assistant') continue
    const block = extractSummaryBlock(qwenRecordText(record))
    if (block && block.length > 50) {
      const title = block.slice(0, 80).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
      memories.push({
        memory_id: deterministicMemoryId(seed, 'summary', summaryIdx++),
        source_agent: 'qwen',
        kind: 'summary',
        scope: 'project',
        title: `Qwen Summary: ${title}`,
        summary: title,
        content: block.slice(0, 4000),
        tags: ['session', 'summary'],
        importance: 0.8,
        confidence: 1.0,
        event_time: record.timestamp ?? firstTs,
        created_at: record.timestamp ?? firstTs,
        session_id: sessionId,
        workspace_id,
        project_id,
        project_root: cwd,
      })
    }
  }

  for (const record of dated) {
    const role = record.role ?? record.type
    if (role !== 'user') continue
    const text = qwenRecordText(record)
    if (!text || isSummaryRequest(text) || isInjectedContext(text)) continue
    const title = text.slice(0, 80).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
    memories.push({
      memory_id: deterministicMemoryId(seed, 'task_goal', 0),
      source_agent: 'qwen',
      kind: 'task_goal',
      scope: 'project',
      title: `Qwen Goal: ${title}`,
      summary: title,
      content: text.slice(0, 4000),
      tags: ['session', 'user-request'],
      importance: 0.7,
      confidence: 0.95,
      event_time: record.timestamp ?? firstTs,
      created_at: record.timestamp ?? firstTs,
      session_id: sessionId,
      workspace_id,
      project_id,
      project_root: cwd,
    })
    break
  }

  if (summaryIdx === 0) {
    const assistantRecords = dated.filter(r => (r.role ?? r.type) === 'assistant')
    for (let i = assistantRecords.length - 1; i >= 0; i--) {
      const record = assistantRecords[i]
      const text = qwenRecordText(record)
      if (!text || !isSubstantive(text)) continue
      const title = text.slice(0, 80).replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
      memories.push({
        memory_id: deterministicMemoryId(seed, 'task_outcome', 0),
        source_agent: 'qwen',
        kind: 'task_outcome',
        scope: 'project',
        title: `Qwen Outcome: ${title}`,
        summary: title,
        content: text.slice(0, 4000),
        tags: ['session', 'outcome'],
        importance: 0.55,
        confidence: 0.85,
        event_time: record.timestamp ?? firstTs,
        created_at: record.timestamp ?? firstTs,
        session_id: sessionId,
        workspace_id,
        project_id,
        project_root: cwd,
      })
      break
    }
  }

  return { ctx, session_id: sessionId, memories }
}

interface GeminiSessionFile {
  sessionId?: string
  startTime?: string
  lastUpdated?: string
  messages?: Array<{ timestamp?: string; type?: string; role?: string; content?: unknown }>
}

function genericContentText(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  return extractTextFromBlocks(content)
}

function projectRootForGeminiFile(filePath: string): string {
  const chatsDir = dirname(filePath)
  const projectDir = basename(chatsDir) === 'chats' ? dirname(chatsDir) : dirname(dirname(chatsDir))
  const marker = join(projectDir, '.project_root')
  if (existsSync(marker)) {
    const root = readFileSync(marker, 'utf-8').trim()
    if (root) return root
  }
  return process.cwd()
}

function parseGeminiSession(filePath: string): ParsedSession | null {
  let data: GeminiSessionFile
  try {
    data = JSON.parse(readFileSync(filePath, 'utf-8')) as GeminiSessionFile
  } catch {
    return null
  }
  const messages = (data.messages ?? []).filter(m => m.timestamp)
  if (messages.length === 0) return null
  messages.sort((a, b) => (a.timestamp! < b.timestamp! ? -1 : 1))
  const sessionId = data.sessionId ?? basename(filePath).replace(/\.json$/, '')
  const cwd = projectRootForGeminiFile(filePath)
  const { workspace_id, project_id } = getProjectIds(cwd)
  const ctx: SessionContext = { source_agent: 'gemini', workspace_id, project_id, project_root: cwd }
  const memories: ExtractedMemory[] = []

  for (const msg of messages) {
    const role = msg.role ?? msg.type
    if (role !== 'user') continue
    const text = genericContentText(msg.content)
    if (!text || isSummaryRequest(text) || isInjectedContext(text)) continue
    memories.push(makeSessionMemory({
      source: 'gemini', session_id: sessionId, kind: 'task_goal', index: 0, ctx,
      titlePrefix: 'Gemini Goal', text, event_time: msg.timestamp!,
      tags: ['session', 'user-request'], importance: 0.7, confidence: 0.95,
    }))
    break
  }

  const assistantMessages = messages.filter(m => (m.role ?? m.type) === 'gemini' || (m.role ?? m.type) === 'assistant')
  for (let i = assistantMessages.length - 1; i >= 0; i--) {
    const msg = assistantMessages[i]
    const text = genericContentText(msg.content)
    if (!text || !isSubstantive(text)) continue
    memories.push(makeSessionMemory({
      source: 'gemini', session_id: sessionId, kind: 'task_outcome', index: 0, ctx,
      titlePrefix: 'Gemini Outcome', text, event_time: msg.timestamp!,
      tags: ['session', 'outcome'], importance: 0.55, confidence: 0.85,
    }))
    break
  }

  return { ctx, session_id: sessionId, memories }
}

interface PiRecord {
  type?: string
  id?: string
  timestamp?: string
  cwd?: string
  message?: {
    role?: string
    content?: unknown
    timestamp?: string
  }
}

async function parsePiSession(filePath: string): Promise<ParsedSession | null> {
  const records = await readJsonlRecords(filePath) as PiRecord[]
  if (records.length === 0) return null
  const session = records.find(r => r.type === 'session')
  const sessionId = session?.id ?? basename(filePath).replace(/\.jsonl$/, '')
  const cwd = session?.cwd ?? process.cwd()
  const { workspace_id, project_id } = getProjectIds(cwd)
  const ctx: SessionContext = { source_agent: 'pi', workspace_id, project_id, project_root: cwd }
  const messages = records
    .filter(r => r.type === 'message' && r.timestamp && r.message?.role)
    .sort((a, b) => (a.timestamp! < b.timestamp! ? -1 : 1))
  const memories: ExtractedMemory[] = []

  for (const msg of messages) {
    if (msg.message?.role !== 'user') continue
    const text = genericContentText(msg.message.content)
    if (!text || isSummaryRequest(text) || isInjectedContext(text)) continue
    memories.push(makeSessionMemory({
      source: 'pi', session_id: sessionId, kind: 'task_goal', index: 0, ctx,
      titlePrefix: 'Pi Goal', text, event_time: msg.timestamp!,
      tags: ['session', 'user-request'], importance: 0.7, confidence: 0.95,
    }))
    break
  }

  const assistantMessages = messages.filter(m => m.message?.role === 'assistant')
  for (let i = assistantMessages.length - 1; i >= 0; i--) {
    const msg = assistantMessages[i]
    const text = genericContentText(msg.message?.content)
    if (!text || !isSubstantive(text)) continue
    memories.push(makeSessionMemory({
      source: 'pi', session_id: sessionId, kind: 'task_outcome', index: 0, ctx,
      titlePrefix: 'Pi Outcome', text, event_time: msg.timestamp!,
      tags: ['session', 'outcome'], importance: 0.55, confidence: 0.85,
    }))
    break
  }

  return { ctx, session_id: sessionId, memories }
}

interface OpenCodeRow {
  session_id: string
  directory: string
  title: string
  session_time: number
  message_id: string | null
  message_time: number | null
  message_data: string | null
  part_time: number | null
  part_data: string | null
}

interface OpenCodeMessage {
  role?: string
}

function readOpenCodeRows(): OpenCodeRow[] {
  const sql = [
    'SELECT s.id AS session_id, s.directory, s.title, s.time_created AS session_time,',
    'm.id AS message_id, m.time_created AS message_time, m.data AS message_data,',
    'p.time_created AS part_time, p.data AS part_data',
    'FROM session s',
    'LEFT JOIN message m ON m.session_id = s.id',
    'LEFT JOIN part p ON p.message_id = m.id',
    'ORDER BY s.time_created, m.time_created, p.time_created',
  ].join(' ')
  try {
    const out = execFileSync('opencode', ['db', sql, '--format', 'json'], {
      encoding: 'utf-8',
      maxBuffer: 100 * 1024 * 1024,
    })
    return JSON.parse(out) as OpenCodeRow[]
  } catch {
    return []
  }
}

function parseOpenCodeSessions(): ParsedSession[] {
  const rows = readOpenCodeRows()
  const bySession = new Map<string, OpenCodeRow[]>()
  for (const row of rows) {
    const existing = bySession.get(row.session_id) ?? []
    existing.push(row)
    bySession.set(row.session_id, existing)
  }

  const parsed: ParsedSession[] = []
  for (const [sessionId, sessionRows] of bySession) {
    const first = sessionRows[0]
    const cwd = first.directory || process.cwd()
    const { workspace_id, project_id } = getProjectIds(cwd)
    const ctx: SessionContext = { source_agent: 'opencode', workspace_id, project_id, project_root: cwd }
    const messages = new Map<string, { role: string; time: number; texts: string[] }>()
    for (const row of sessionRows) {
      if (!row.message_id || !row.message_data) continue
      let message: OpenCodeMessage
      try { message = JSON.parse(row.message_data) as OpenCodeMessage } catch { continue }
      const role = message.role
      if (!role) continue
      const entry = messages.get(row.message_id) ?? { role, time: row.message_time ?? row.session_time, texts: [] }
      if (row.part_data) {
        try {
          const part = JSON.parse(row.part_data) as { type?: string; text?: string }
          if (part.type === 'text' && typeof part.text === 'string') entry.texts.push(part.text)
        } catch { /* skip malformed part */ }
      }
      messages.set(row.message_id, entry)
    }

    const ordered = [...messages.values()].sort((a, b) => a.time - b.time)
    const memories: ExtractedMemory[] = []
    for (const msg of ordered) {
      if (msg.role !== 'user') continue
      const text = msg.texts.join('\n').trim()
      if (!text || isSummaryRequest(text) || isInjectedContext(text)) continue
      memories.push(makeSessionMemory({
        source: 'opencode', session_id: sessionId, kind: 'task_goal', index: 0, ctx,
        titlePrefix: 'opencode Goal', text, event_time: new Date(msg.time).toISOString(),
        tags: ['session', 'user-request'], importance: 0.7, confidence: 0.95,
      }))
      break
    }
    const assistants = ordered.filter(m => m.role === 'assistant')
    for (let i = assistants.length - 1; i >= 0; i--) {
      const msg = assistants[i]
      const text = msg.texts.join('\n').trim()
      if (!text || !isSubstantive(text)) continue
      memories.push(makeSessionMemory({
        source: 'opencode', session_id: sessionId, kind: 'task_outcome', index: 0, ctx,
        titlePrefix: 'opencode Outcome', text, event_time: new Date(msg.time).toISOString(),
        tags: ['session', 'outcome'], importance: 0.55, confidence: 0.85,
      }))
      break
    }
    parsed.push({ ctx, session_id: sessionId, memories })
  }
  return parsed
}

// ── Write a vault file ────────────────────────────────────────────────────────

function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

/** Format a Date as YYYY-MM-DDTHH-MM-SS (filesystem-safe ISO for filename prefix). */
function isoPrefix(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
         `T${pad(date.getUTCHours())}-${pad(date.getUTCMinutes())}-${pad(date.getUTCSeconds())}`
}

/**
 * Compute the vault path for a memory. Filename is ISO-timestamp-prefixed so
 * alphabetical sort = temporal sort; subdirs are yyyy/mm/dd for granular
 * partitioning. Per-memory workspace_id/project_id branches the tree so
 * different projects' memories never collide.
 */
function vaultPathFor(memory: ExtractedMemory): string {
  const date = new Date(memory.created_at)
  const yyyy = date.getUTCFullYear().toString()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(date.getUTCDate()).padStart(2, '0')
  const fileName = `${isoPrefix(date)}_${memory.memory_id}.md`
  return join(
    VAULT_PATH,
    'memories', 'curated', 'workspaces',
    memory.workspace_id,
    'project', memory.project_id,
    yyyy, mm, dd,
    fileName,
  )
}

function writeVaultFile(memory: ExtractedMemory): string {
  const filePath = vaultPathFor(memory)

  // Build frontmatter lines manually — no extra dep needed
  const yamlLines: string[] = ['---']
  const fmEntries: Array<[string, unknown]> = [
    ['id', memory.memory_id],
    ['schema', 'fulcrum.memory/v1'],
    ['source_agent', memory.source_agent ?? 'claude'],
    ['kind', memory.kind],
    ['scope', memory.scope],
    ['workspace_id', memory.workspace_id],
    ['project_id', memory.project_id],
    ['session_id', memory.session_id],
    ['project_root', memory.project_root],
    ['title', memory.title],
    ['summary', memory.summary],
    ['tags', memory.tags],
    ['confidence', memory.confidence],
    ['importance', memory.importance],
    ['created_at', memory.created_at],
    ['updated_at', memory.created_at],
    ['event_time', memory.event_time],
    ['content_hash', contentHash(memory.content)],
  ]

  for (const [k, v] of fmEntries) {
    if (v === undefined || v === null) continue
    if (Array.isArray(v)) {
      if ((v as unknown[]).length === 0) continue
      yamlLines.push(`${k}:`)
      for (const item of v as unknown[]) {
        yamlLines.push(`  - ${JSON.stringify(item)}`)
      }
    } else if (typeof v === 'string') {
      const needsQuote = v.includes(':') || v.includes('#') || v.includes('"') ||
                         v.includes('\n') || v.startsWith(' ') || v.endsWith(' ')
      yamlLines.push(`${k}: ${needsQuote ? JSON.stringify(v) : v}`)
    } else {
      yamlLines.push(`${k}: ${v}`)
    }
  }

  yamlLines.push('---', '', memory.content)

  if (!DRY_RUN) {
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, yamlLines.join('\n'), 'utf-8')
  }

  return filePath
}

// ── Main ──────────────────────────────────────────────────────────────────────

interface ProjectSummaryRow {
  source: SourceAgent
  dir: string
  root: string
  sessions: number
  memories: number
}

function listFilesRecursive(root: string, predicate: (filePath: string) => boolean): string[] {
  const results: string[] = []
  if (!existsSync(root)) return results
  const visit = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name)
      let stat
      try {
        stat = statSync(full)
      } catch {
        continue
      }
      if (stat.isDirectory()) {
        visit(full)
      } else if (predicate(full)) {
        results.push(full)
      }
    }
  }
  visit(root)
  return results
}

async function collectClaudeMemories(allMemories: ExtractedMemory[], projectSummary: ProjectSummaryRow[]): Promise<void> {
  if (!existsSync(CLAUDE_PROJECTS_ROOT)) {
    console.warn(`Claude projects root not found: ${CLAUDE_PROJECTS_ROOT}`)
    return
  }

  const projectDirs = readdirSync(CLAUDE_PROJECTS_ROOT)
    .filter(name => {
      const full = join(CLAUDE_PROJECTS_ROOT, name)
      try { return statSync(full).isDirectory() } catch { return false }
    })
    .filter(name => !ONLY_PROJECT || name === ONLY_PROJECT)
    .sort()

  if (projectDirs.length === 0) {
    console.warn(`No Claude project dirs found under ${CLAUDE_PROJECTS_ROOT}`)
    return
  }

  console.log(`\nProcessing Claude: ${projectDirs.length} project dir(s) under ${CLAUDE_PROJECTS_ROOT}`)

  for (const projectDir of projectDirs) {
    const dirPath = join(CLAUDE_PROJECTS_ROOT, projectDir)
    const jsonlFiles = readdirSync(dirPath)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({ name: f, path: join(dirPath, f), size: statSync(join(dirPath, f)).size }))
      .sort((a, b) => a.name.localeCompare(b.name))

    if (jsonlFiles.length === 0) continue

    let cwd: string | null = null
    for (const file of jsonlFiles.slice(0, Math.min(5, jsonlFiles.length))) {
      cwd = readSessionCwd(file.path)
      if (cwd) break
    }
    if (!cwd) {
      console.warn(`\n  [warn] Could not resolve cwd for ${projectDir} — skipping`)
      continue
    }

    const { workspace_id, project_id } = getProjectIds(cwd)
    const ctx: SessionContext = { source_agent: 'claude', workspace_id, project_id, project_root: cwd }
    const files = LIMIT < Infinity ? jsonlFiles.slice(0, LIMIT) : jsonlFiles

    console.log(`\n── claude:${projectDir}`)
    console.log(`   cwd:           ${cwd}`)
    console.log(`   workspace_id:  ${workspace_id}`)
    console.log(`   project_id:    ${project_id}`)
    console.log(`   sessions:      ${files.length} (of ${jsonlFiles.length})`)

    const before = allMemories.length
    let fileCount = 0
    for (const file of files) {
      fileCount++
      if (fileCount % 20 === 0 || fileCount === files.length) {
        process.stdout.write(`\r   parsed ${fileCount}/${files.length}...`)
      }
      try {
        const memories = await parseSession(file.path, ctx)
        allMemories.push(...memories)
      } catch (err) {
        process.stderr.write(`\n   [warn] ${file.name}: ${(err as Error).message}\n`)
      }
    }
    projectSummary.push({
      source: 'claude',
      dir: projectDir,
      root: cwd,
      sessions: files.length,
      memories: allMemories.length - before,
    })
    process.stdout.write(`\r   extracted ${allMemories.length - before} memories from ${files.length} sessions\n`)
  }
}

async function collectCodexMemories(allMemories: ExtractedMemory[], projectSummary: ProjectSummaryRow[]): Promise<void> {
  const allFiles = listFilesRecursive(CODEX_SESSIONS_ROOT, filePath => filePath.endsWith('.jsonl'))
  if (allFiles.length === 0) {
    console.warn(`No Codex sessions found under ${CODEX_SESSIONS_ROOT}`)
    return
  }

  const files = LIMIT < Infinity ? allFiles.slice(0, LIMIT) : allFiles
  console.log(`\nProcessing Codex: ${files.length} session file(s) under ${CODEX_SESSIONS_ROOT} (of ${allFiles.length})`)

  const beforeByRoot = new Map<string, { sessions: number; memories: number; dir: string }>()
  let fileCount = 0
  for (const filePath of files) {
    fileCount++
    if (fileCount % 20 === 0 || fileCount === files.length) {
      process.stdout.write(`\r   parsed ${fileCount}/${files.length}...`)
    }
    try {
      const parsed = await parseCodexSession(filePath)
      if (!parsed) continue
      const row = beforeByRoot.get(parsed.ctx.project_root) ?? { sessions: 0, memories: 0, dir: 'codex' }
      row.sessions++
      row.memories += parsed.memories.length
      beforeByRoot.set(parsed.ctx.project_root, row)
      allMemories.push(...parsed.memories)
    } catch (err) {
      process.stderr.write(`\n   [warn] ${basename(filePath)}: ${(err as Error).message}\n`)
    }
  }
  process.stdout.write(`\r   parsed ${files.length}/${files.length}\n`)

  for (const [root, row] of [...beforeByRoot.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    projectSummary.push({
      source: 'codex',
      dir: row.dir,
      root,
      sessions: row.sessions,
      memories: row.memories,
    })
  }
}

function collectQwenMemories(allMemories: ExtractedMemory[], projectSummary: ProjectSummaryRow[]): void {
  const allFiles = listFilesRecursive(QWEN_TMP_ROOT, filePath => basename(filePath) === 'logs.json')
  if (allFiles.length === 0) {
    console.warn(`No Qwen sessions found under ${QWEN_TMP_ROOT}`)
    return
  }

  const files = LIMIT < Infinity ? allFiles.slice(0, LIMIT) : allFiles
  console.log(`\nProcessing Qwen: ${files.length} log file(s) under ${QWEN_TMP_ROOT} (of ${allFiles.length})`)

  const byRoot = new Map<string, { sessions: number; memories: number; dir: string }>()
  for (const filePath of files) {
    const parsed = parseQwenSession(filePath)
    if (!parsed) continue
    const row = byRoot.get(parsed.ctx.project_root) ?? { sessions: 0, memories: 0, dir: 'qwen' }
    row.sessions++
    row.memories += parsed.memories.length
    byRoot.set(parsed.ctx.project_root, row)
    allMemories.push(...parsed.memories)
  }

  for (const [root, row] of [...byRoot.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    projectSummary.push({
      source: 'qwen',
      dir: row.dir,
      root,
      sessions: row.sessions,
      memories: row.memories,
    })
  }
}

function addParsedSession(
  parsed: ParsedSession,
  allMemories: ExtractedMemory[],
  buckets: Map<string, { source: SourceAgent; sessions: number; memories: number; dir: string }>,
  dir: string,
): void {
  const row = buckets.get(parsed.ctx.project_root) ?? {
    source: parsed.ctx.source_agent,
    sessions: 0,
    memories: 0,
    dir,
  }
  row.sessions++
  row.memories += parsed.memories.length
  buckets.set(parsed.ctx.project_root, row)
  allMemories.push(...parsed.memories)
}

function pushBuckets(projectSummary: ProjectSummaryRow[], buckets: Map<string, { source: SourceAgent; sessions: number; memories: number; dir: string }>): void {
  for (const [root, row] of [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    projectSummary.push({
      source: row.source,
      dir: row.dir,
      root,
      sessions: row.sessions,
      memories: row.memories,
    })
  }
}

function collectGeminiMemories(allMemories: ExtractedMemory[], projectSummary: ProjectSummaryRow[]): void {
  const allFiles = listFilesRecursive(GEMINI_TMP_ROOT, filePath => filePath.includes('/chats/') && filePath.endsWith('.json'))
  if (allFiles.length === 0) {
    console.warn(`No Gemini sessions found under ${GEMINI_TMP_ROOT}`)
    return
  }
  const files = LIMIT < Infinity ? allFiles.slice(0, LIMIT) : allFiles
  console.log(`\nProcessing Gemini: ${files.length} session file(s) under ${GEMINI_TMP_ROOT} (of ${allFiles.length})`)
  const buckets = new Map<string, { source: SourceAgent; sessions: number; memories: number; dir: string }>()
  for (const filePath of files) {
    const parsed = parseGeminiSession(filePath)
    if (parsed) addParsedSession(parsed, allMemories, buckets, 'gemini')
  }
  pushBuckets(projectSummary, buckets)
}

async function collectPiMemories(allMemories: ExtractedMemory[], projectSummary: ProjectSummaryRow[]): Promise<void> {
  const allFiles = listFilesRecursive(PI_SESSIONS_ROOT, filePath => filePath.endsWith('.jsonl'))
  if (allFiles.length === 0) {
    console.warn(`No Pi sessions found under ${PI_SESSIONS_ROOT}`)
    return
  }
  const files = LIMIT < Infinity ? allFiles.slice(0, LIMIT) : allFiles
  console.log(`\nProcessing Pi: ${files.length} session file(s) under ${PI_SESSIONS_ROOT} (of ${allFiles.length})`)
  const buckets = new Map<string, { source: SourceAgent; sessions: number; memories: number; dir: string }>()
  let fileCount = 0
  for (const filePath of files) {
    fileCount++
    if (fileCount % 20 === 0 || fileCount === files.length) {
      process.stdout.write(`\r   parsed ${fileCount}/${files.length}...`)
    }
    const parsed = await parsePiSession(filePath)
    if (parsed) addParsedSession(parsed, allMemories, buckets, 'pi')
  }
  if (files.length > 0) process.stdout.write(`\r   parsed ${files.length}/${files.length}\n`)
  pushBuckets(projectSummary, buckets)
}

function collectOpenCodeMemories(allMemories: ExtractedMemory[], projectSummary: ProjectSummaryRow[]): void {
  const parsedSessions = parseOpenCodeSessions()
  if (parsedSessions.length === 0) {
    console.warn('No opencode sessions found in opencode database')
    return
  }
  const sessions = LIMIT < Infinity ? parsedSessions.slice(0, LIMIT) : parsedSessions
  console.log(`\nProcessing opencode: ${sessions.length} session(s) from opencode database (of ${parsedSessions.length})`)
  const buckets = new Map<string, { source: SourceAgent; sessions: number; memories: number; dir: string }>()
  for (const parsed of sessions) addParsedSession(parsed, allMemories, buckets, 'opencode')
  pushBuckets(projectSummary, buckets)
}

function collectCopilotMemories(): void {
  console.warn('No GitHub Copilot CLI transcript store found locally; gh copilot is installed but no importable history files were discovered')
}

async function main(): Promise<void> {
  console.log(`Sources: ${SOURCES.join(', ')}`)
  if (DRY_RUN) console.log('[DRY RUN — no vault files will be written]')

  const allMemories: ExtractedMemory[] = []
  const projectSummary: ProjectSummaryRow[] = []

  for (const source of SOURCES) {
    if (source === 'claude') await collectClaudeMemories(allMemories, projectSummary)
    if (source === 'codex') await collectCodexMemories(allMemories, projectSummary)
    if (source === 'gemini') collectGeminiMemories(allMemories, projectSummary)
    if (source === 'opencode') collectOpenCodeMemories(allMemories, projectSummary)
    if (source === 'pi') await collectPiMemories(allMemories, projectSummary)
    if (source === 'qwen') collectQwenMemories(allMemories, projectSummary)
    if (source === 'copilot') collectCopilotMemories()
  }

  for (const memory of allMemories) normalizeMemorySource(memory)

  console.log(`\n\nExtracted ${allMemories.length} total memories across ${projectSummary.length} project/source bucket(s)`)

  // ── Sort globally by event_time (canonical cross-session temporal order) ──
  allMemories.sort((a, b) => (a.event_time < b.event_time ? -1 : 1))

  // ── Deduplicate by memory_id ──────────────────────────────────────────────
  const seen = new Set<string>()
  const unique = allMemories.filter(m => {
    if (seen.has(m.memory_id)) return false
    seen.add(m.memory_id)
    return true
  })
  console.log(`After dedup: ${unique.length} unique memories`)

  // Breakdowns
  const kindCounts: Record<string, number> = {}
  for (const m of unique) kindCounts[m.kind] = (kindCounts[m.kind] ?? 0) + 1
  console.log('By kind:', kindCounts)
  console.log('By project:')
  for (const p of projectSummary) {
    const label = `${p.source}:${p.root}`
    console.log(`  ${label.padEnd(72)}  sessions=${String(p.sessions).padStart(4)}  extracted=${p.memories}`)
  }

  if (DRY_RUN) {
    console.log('\nSample (first 10 by event_time):')
    for (const m of unique.slice(0, 10)) {
      const ws = (m.workspace_id ?? '').replace(/^ws_/, '').slice(0, 20)
      const ts = (m.event_time ?? '').slice(0, 19)
      console.log(`  [${ts}] ${(m.kind ?? '').padEnd(12)} ${ws.padEnd(22)} ${(m.title ?? '').slice(0, 60)}`)
    }
    console.log('\n[DRY RUN complete — re-run without --dry-run to write files]')
    return
  }

  // ── Write vault files ─────────────────────────────────────────────────────
  console.log(`\nWriting vault files to ${VAULT_PATH}...`)
  let written = 0
  let skipped = 0

  for (const memory of unique) {
    const filePath = vaultPathFor(memory)
    if (existsSync(filePath)) {
      skipped++
      continue
    }
    writeVaultFile(memory)
    written++
  }

  console.log(`Written: ${written}, Skipped (already exist): ${skipped}`)

  if (written === 0) {
    console.log('\nAll files already exist — skipping rebuild')
    return
  }

  // ── Rebuild L1 from vault ─────────────────────────────────────────────────
  console.log(`\nRunning: ${FULCRUM_CLI} memory rebuild --l1`)
  try {
    runFulcrum('memory rebuild --l1')
  } catch (err) {
    console.error('Rebuild failed:', (err as Error).message)
    process.exit(1)
  }

  // ── Embed all memories ────────────────────────────────────────────────────
  if (SKIP_EMBED) {
    console.log('\nSkipping vector embedding (--skip-embed). Run `fulcrum memory embed` when ready.')
    return
  }

  console.log(`\nRunning: ${FULCRUM_CLI} memory embed`)
  try {
    runFulcrum('memory embed')
  } catch (err) {
    console.error('Embed failed:', (err as Error).message)
    process.exit(1)
  }

  console.log('\nDone! Run `fulcrum memory status` to see the full picture.')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
