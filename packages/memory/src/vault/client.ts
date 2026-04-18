// packages/memory/src/vault/client.ts
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, dirname, resolve, sep } from 'path'
import { homedir } from 'os'
import type { FullMemory } from '../types.js'
import { CURATED_KINDS } from '../types.js'
import { serializeToFile, parseFromFile } from './formatter.js'
import type { MemoryFileFrontmatter } from '../types.js'

export function getVaultPath(): string {
  return process.env['FULCRUM_VAULT_PATH'] ?? join(homedir(), '.fulcrum', 'vault')
}

export function vaultExists(vaultPath: string): boolean {
  return existsSync(vaultPath)
}

const GITIGNORE_CONTENT = `# Fulcrum Vault .gitignore
memories/operational/
.state.json
.queue/
*.tmp
`

const SCHEMA_YAML_CONTENT = `# Fulcrum Vault Schema
version: 1
kinds:
  curated: [decision, fact, lesson, summary, task_outcome, task_decision, error, doc]
  operational: [tool_trace, reasoning_step, symbol, diff, code, procedure, task_goal, task_failure]
scopes: [global, project, file]
`

export async function initVault(vaultPath: string): Promise<void> {
  mkdirSync(vaultPath, { recursive: true })
  mkdirSync(join(vaultPath, 'memories', 'curated'), { recursive: true })
  mkdirSync(join(vaultPath, 'memories', 'operational'), { recursive: true })
  mkdirSync(join(vaultPath, 'entities'), { recursive: true })
  mkdirSync(join(vaultPath, '.queue'), { recursive: true })

  const gitignorePath = join(vaultPath, '.gitignore')
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, GITIGNORE_CONTENT, 'utf-8')
  }

  const schemaPath = join(vaultPath, 'schema.yaml')
  if (!existsSync(schemaPath)) {
    writeFileSync(schemaPath, SCHEMA_YAML_CONTENT, 'utf-8')
  }

  const indexPath = join(vaultPath, 'index.md')
  if (!existsSync(indexPath)) {
    writeFileSync(indexPath, '# Fulcrum Vault Index\n_Auto-generated. Last compiled: never._\n', 'utf-8')
  }

  const logPath = join(vaultPath, 'log.md')
  if (!existsSync(logPath)) {
    writeFileSync(logPath, '', 'utf-8')
  }

  // .obsidian/ — minimal config for Obsidian compatibility
  const obsidianDir = join(vaultPath, '.obsidian')
  mkdirSync(obsidianDir, { recursive: true })
  const appJsonPath = join(obsidianDir, 'app.json')
  if (!existsSync(appJsonPath)) {
    writeFileSync(appJsonPath, JSON.stringify({ legacyEditor: false, livePreview: true }, null, 2) + '\n', 'utf-8')
  }

  // queries.md — pre-built Dataview queries for browsing
  const queriesPath = join(vaultPath, 'queries.md')
  if (!existsSync(queriesPath)) {
    const queriesContent = `# Vault Queries

Pre-built Dataview queries for browsing memories in Obsidian.

## Recent Decisions

\`\`\`dataview
TABLE summary, tags, created_at AS "Created"
FROM "memories/curated"
WHERE kind = "decision"
SORT created_at DESC
LIMIT 20
\`\`\`

## Architecture Memories

\`\`\`dataview
TABLE summary, workspace_id
FROM "memories/curated"
WHERE contains(tags, "architecture")
SORT importance DESC
\`\`\`
`
    writeFileSync(queriesPath, queriesContent, 'utf-8')
  }
}

/**
 * Encode a file path for use as a vault directory segment.
 * Replaces '/' with URL-percent-encoded '%2F' so the full path becomes a
 * single directory name that round-trips losslessly back to the original.
 * The prior '--' separator was ambiguous with legitimate filenames containing
 * '--' (LOW-22).
 * Falls back to "_unknown" for empty paths.
 */
function encodeFilePath(filePath: string): string {
  if (!filePath) return '_unknown'
  if (filePath.includes('\0')) throw new Error('path must not contain null bytes')
  return filePath.replace(/\//g, '%2F').replace(/\\/g, '%5C')
}

/**
 * CRIT-2: path-safety check for ID segments that become vault directory names.
 * Without this, a memory written with workspace_id='../../etc' would escape
 * the vault root on the subsequent path.join + mkdirSync + writeFileSync.
 * Allowed characters: alphanumerics, underscore, hyphen. Anything else
 * (including '/' '\\' '..' null bytes) is rejected before the path is built.
 */
const SAFE_ID_RE = /^[A-Za-z0-9_-]+$/
function assertSafeId(value: string, field: string): void {
  if (typeof value !== 'string' || value.length === 0 || value.length > 256 || !SAFE_ID_RE.test(value)) {
    throw Object.assign(
      new Error(`${field} must match ${SAFE_ID_RE} (got: ${JSON.stringify(value).slice(0, 80)})`),
      { code: 'invalid_input' },
    )
  }
}

/**
 * CRIT-2: after building filePath, verify the resolved absolute path still
 * lives inside the vault root. Defense in depth — even if assertSafeId missed
 * an edge case, containment check catches the escape.
 */
function assertInsideVault(vaultPath: string, filePath: string): void {
  const vaultAbs = resolve(vaultPath) + sep
  const fileAbs = resolve(filePath)
  if (!fileAbs.startsWith(vaultAbs)) {
    throw Object.assign(
      new Error(`path escapes vault root: ${fileAbs} vs ${vaultAbs}`),
      { code: 'invalid_input' },
    )
  }
}

export function getMemoryFilePath(vaultPath: string, memory: FullMemory): string {
  // CRIT-2: validate every ID that becomes a path segment.
  assertSafeId(memory.workspace_id, 'workspace_id')
  assertSafeId(memory.memory_id, 'memory_id')
  if (memory.project_id) assertSafeId(memory.project_id, 'project_id')
  if (memory.task_id) assertSafeId(memory.task_id, 'task_id')
  const date = new Date(memory.created_at)
  const yyyy = date.getUTCFullYear().toString()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')

  if (CURATED_KINDS.has(memory.kind)) {
    if (memory.scope === 'global' || !memory.project_id) {
      // memories/curated/workspaces/<ws_id>/global/<yyyy>/<mm>/<id>.md
      return join(
        vaultPath,
        'memories', 'curated', 'workspaces',
        memory.workspace_id,
        'global',
        yyyy, mm,
        `${memory.memory_id}.md`
      )
    } else if (memory.scope === 'project') {
      // memories/curated/workspaces/<ws_id>/project/<project_id>/<yyyy>/<mm>/<id>.md
      return join(
        vaultPath,
        'memories', 'curated', 'workspaces',
        memory.workspace_id,
        'project', memory.project_id,
        yyyy, mm,
        `${memory.memory_id}.md`
      )
    } else {
      // scope === 'file'
      // memories/curated/workspaces/<ws_id>/file/<project_id>/<encoded_path>/<yyyy>/<mm>/<id>.md
      const encodedPath = encodeFilePath(memory.file_path ?? '')
      return join(
        vaultPath,
        'memories', 'curated', 'workspaces',
        memory.workspace_id,
        'file', memory.project_id,
        encodedPath,
        yyyy, mm,
        `${memory.memory_id}.md`
      )
    }
  } else {
    // memories/operational/workspaces/<ws_id>/runs/<task_id_or_id>/<id>.md
    const runSegment = memory.task_id ?? memory.memory_id
    return join(
      vaultPath,
      'memories', 'operational', 'workspaces',
      memory.workspace_id,
      'runs', runSegment,
      `${memory.memory_id}.md`
    )
  }
}

/**
 * Low-level raw-file writer for the new v3 `vault/raw/` layout (memory v3
 * plan §L0). Writes `<vaultPath>/<relativePath>` with 0600 file perms inside
 * 0700 parent directories, enforcing vault containment via `assertInsideVault`.
 *
 * `relativePath` must start with `raw/` (so L0 writes cannot accidentally
 * land under `curated/` or `memories/`). Caller serializes frontmatter + body
 * into a single string (`content`) — this primitive is filesystem-only.
 *
 * Returns the absolute filesystem path on success.
 */
export function writeRawFile(vaultPath: string, relativePath: string, content: string): string {
  if (!relativePath.startsWith('raw/')) {
    throw Object.assign(
      new Error(`writeRawFile: relativePath must start with 'raw/' (got '${relativePath}')`),
      { code: 'invalid_input' },
    )
  }
  const filePath = join(vaultPath, relativePath)
  assertInsideVault(vaultPath, filePath)
  mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 })
  writeFileSync(filePath, content, { encoding: 'utf-8', mode: 0o600 })
  return filePath
}

/**
 * Low-level curated-file writer for the new v3 `vault/curated/` layout
 * (memory v3 plan §L1). Writes `<vaultPath>/<relativePath>` with default
 * perms (curated/ is git-versioned, so 0644 is fine).
 *
 * `relativePath` must start with `curated/`. The full `CuratedPage` type
 * with frontmatter + validation lands in PR 2; this primitive handles only
 * the filesystem layer so PR 2's `l1/page.ts` has one low-level dependency.
 *
 * Returns the absolute filesystem path on success.
 */
export function writeCuratedFile(vaultPath: string, relativePath: string, content: string): string {
  if (!relativePath.startsWith('curated/')) {
    throw Object.assign(
      new Error(`writeCuratedFile: relativePath must start with 'curated/' (got '${relativePath}')`),
      { code: 'invalid_input' },
    )
  }
  const filePath = join(vaultPath, relativePath)
  assertInsideVault(vaultPath, filePath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, 'utf-8')
  return filePath
}

/**
 * v2a back-compat: writes a v2a `FullMemory` into the legacy
 * `vault/memories/curated/...` (CURATED_KINDS) or `vault/memories/operational/...`
 * (everything else) layout. New v3 code paths should call `writeRawFile` for
 * L0 or go through the PR 2 L1 page primitives for curated writes; this
 * function stays for existing callers until PR 5 cutover.
 */
export async function writeMemoryFile(vaultPath: string, memory: FullMemory): Promise<string> {
  // L0 stores the ORIGINAL human-readable content — NOT canonical_text.
  // canonical_text is the FTS5-tokenized form (e.g. "getUserById" → "get User By Id",
  // "user_profile" → "user profile"); writing that to the vault mangles
  // identifiers and defeats the "human-readable source of truth" invariant of
  // L0. Rebuild derives canonical_text back from content at L1-insert time.
  const body = memory.content ?? memory.canonical_text ?? ''
  const content = serializeToFile(memory, body)
  const filePath = getMemoryFilePath(vaultPath, memory)

  // CRIT-2 defense-in-depth: after getMemoryFilePath builds the path (with
  // already-validated IDs), verify the resolved absolute path still lives
  // inside the vault root before any mkdirSync / writeFileSync.
  assertInsideVault(vaultPath, filePath)

  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, 'utf-8')

  return filePath
}

export async function readMemoryFile(filePath: string): Promise<{ frontmatter: MemoryFileFrontmatter; body: string }> {
  const content = readFileSync(filePath, 'utf-8')
  return parseFromFile(content)
}

function walkDir(dir: string, results: string[]): void {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      walkDir(full, results)
    } else if (entry.endsWith('.md')) {
      results.push(full)
    }
  }
}

export async function listMemoryFiles(
  vaultPath: string,
  target: 'curated' | 'operational' | 'all'
): Promise<string[]> {
  const results: string[] = []
  if (target === 'curated' || target === 'all') {
    walkDir(join(vaultPath, 'memories', 'curated'), results)
  }
  if (target === 'operational' || target === 'all') {
    walkDir(join(vaultPath, 'memories', 'operational'), results)
  }
  return results
}
