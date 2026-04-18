#!/usr/bin/env node
/**
 * scripts/import-claude-sessions.ts
 *
 * Imports ALL Claude Code session JSONL files under ~/.claude/projects/* into
 * the Fulcrum vault — one vault branch per project, derived deterministically
 * from the session's real `cwd` via projectIdsFromPath().
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
 *   npx tsx scripts/import-claude-sessions.ts [--dry-run] [--limit N] [--project DIR]
 *     --dry-run   : parse + print breakdown, don't write vault files or rebuild
 *     --limit N   : cap sessions per project (testing)
 *     --project D : restrict to one ~/.claude/projects/<D> directory
 */

import { createReadStream, mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { createInterface } from 'readline'
import { join, dirname, basename, resolve as resolvePath } from 'path'
import { homedir } from 'os'
import { createHash } from 'crypto'
import { readdirSync, statSync } from 'fs'
import { execSync } from 'child_process'

// ── Config ────────────────────────────────────────────────────────────────────

const PROJECTS_ROOT = join(homedir(), '.claude', 'projects')
// Vault = L0 markdown store. Kept at ~/.fulcrum/vault (NOT globalDataDir) to
// match getVaultPath() in fulcrum-memory. Override via FULCRUM_VAULT_PATH.
const VAULT_PATH = process.env['FULCRUM_VAULT_PATH'] ?? join(homedir(), '.fulcrum', 'vault')

const DRY_RUN = process.argv.includes('--dry-run')
const LIMIT_IDX = process.argv.indexOf('--limit')
const LIMIT = LIMIT_IDX >= 0 ? parseInt(process.argv[LIMIT_IDX + 1] ?? '10', 10) : Infinity
const PROJECT_IDX = process.argv.indexOf('--project')
const ONLY_PROJECT = PROJECT_IDX >= 0 ? process.argv[PROJECT_IDX + 1] : null

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
  if (text.startsWith('Base directory for this skill:')) return true
  if (text.startsWith('<command-name>')) return true
  if (text.startsWith('<system-reminder>')) return true
  if (text.startsWith('<local-command-')) return true  // <local-command-caveat>, <local-command-stdout>, etc.
  if (text.startsWith('<task-notification>')) return true
  if (text.startsWith('use the Bash tool to run:')) return true
  if (text.startsWith('<')) return true  // Any XML-like system injection
  if (text.startsWith('This session is being continued from a previous conversation')) return true
  if (text.startsWith('Note: /home/')) return true  // system-reminder notes
  if (text.length < 25) return true
  return false
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
    ['kind', memory.kind],
    ['scope', memory.scope],
    ['workspace_id', memory.workspace_id],
    ['project_id', memory.project_id],
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

async function main(): Promise<void> {
  if (!existsSync(PROJECTS_ROOT)) {
    console.error(`Projects root not found: ${PROJECTS_ROOT}`)
    process.exit(1)
  }

  // Enumerate project dirs under ~/.claude/projects.
  const projectDirs = readdirSync(PROJECTS_ROOT)
    .filter(name => {
      const full = join(PROJECTS_ROOT, name)
      try { return statSync(full).isDirectory() } catch { return false }
    })
    .filter(name => !ONLY_PROJECT || name === ONLY_PROJECT)
    .sort()

  if (projectDirs.length === 0) {
    console.error(`No project dirs found under ${PROJECTS_ROOT}`)
    process.exit(1)
  }

  console.log(`Processing ${projectDirs.length} project dir(s) under ${PROJECTS_ROOT}`)
  if (DRY_RUN) console.log('[DRY RUN — no vault files will be written]')

  const allMemories: ExtractedMemory[] = []
  const projectSummary: Array<{ dir: string; root: string; sessions: number; memories: number }> = []

  for (const projectDir of projectDirs) {
    const dirPath = join(PROJECTS_ROOT, projectDir)
    const jsonlFiles = readdirSync(dirPath)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({ name: f, path: join(dirPath, f), size: statSync(join(dirPath, f)).size }))
      .sort((a, b) => a.name.localeCompare(b.name))

    if (jsonlFiles.length === 0) continue

    // Resolve the real project cwd. Some sessions start with a queue-operation
    // row that has no cwd — scan the first few files until we find one.
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
    const ctx: SessionContext = { workspace_id, project_id, project_root: cwd }

    const files = LIMIT < Infinity ? jsonlFiles.slice(0, LIMIT) : jsonlFiles
    console.log(`\n── ${projectDir}`)
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
      dir: projectDir,
      root: cwd,
      sessions: files.length,
      memories: allMemories.length - before,
    })
    process.stdout.write(`\r   extracted ${allMemories.length - before} memories from ${files.length} sessions\n`)
  }

  console.log(`\n\nExtracted ${allMemories.length} total memories across ${projectSummary.length} project(s)`)

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
    console.log(`  ${p.root.padEnd(60)}  sessions=${String(p.sessions).padStart(4)}  extracted=${p.memories}`)
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
  console.log('\nRunning: fulcrum memory rebuild --l1')
  try {
    execSync('fulcrum memory rebuild --l1', { stdio: 'inherit', cwd: process.cwd() })
  } catch (err) {
    console.error('Rebuild failed:', (err as Error).message)
    process.exit(1)
  }

  // ── Embed all memories ────────────────────────────────────────────────────
  console.log('\nRunning: fulcrum memory embed')
  try {
    execSync('fulcrum memory embed', { stdio: 'inherit', cwd: process.cwd() })
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
