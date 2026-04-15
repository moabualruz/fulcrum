// packages/memory/src/vault/client.ts
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import type { FullMemory } from '../types.js'
import { CURATED_KINDS } from '../types.js'
import { serializeToFile, parseFromFile } from './formatter.js'
import type { MemoryFileFrontmatter } from '../types.js'
import { globalDataDir, FulcrumError } from '@fulcrum/core'

function assertSafePathSegment(id: string, fieldName: string): void {
  if (!id || !/^[a-zA-Z0-9_\-]{1,128}$/.test(id)) {
    throw new FulcrumError(
      `Invalid ${fieldName} for path use: must match [a-zA-Z0-9_\\-]{1,128}`,
      'invalid_input'
    )
  }
}

export function getVaultPath(): string {
  return process.env['FULCRUM_VAULT_PATH'] ?? join(globalDataDir(), 'vault')
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
  mkdirSync(vaultPath, { recursive: true, mode: 0o700 })
  mkdirSync(join(vaultPath, 'memories', 'curated'), { recursive: true, mode: 0o700 })
  mkdirSync(join(vaultPath, 'memories', 'operational'), { recursive: true, mode: 0o700 })
  mkdirSync(join(vaultPath, 'entities'), { recursive: true, mode: 0o700 })
  mkdirSync(join(vaultPath, '.queue'), { recursive: true, mode: 0o700 })

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
  mkdirSync(obsidianDir, { recursive: true, mode: 0o700 })
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
 * Replaces '/' with '--' so the full path becomes a single readable directory name.
 * e.g. "packages/memory/src/write.ts" → "packages--memory--src--write.ts"
 * Falls back to "_unknown" for empty paths.
 */
function encodeFilePath(filePath: string): string {
  if (!filePath) return '_unknown'
  return filePath.replace(/\//g, '--').replace(/\\/g, '--')
}

export function getMemoryFilePath(vaultPath: string, memory: FullMemory): string {
  assertSafePathSegment(memory.workspace_id, 'workspace_id')
  assertSafePathSegment(memory.memory_id, 'memory_id')
  if (memory.project_id) assertSafePathSegment(memory.project_id, 'project_id')
  if (memory.task_id) assertSafePathSegment(memory.task_id, 'task_id')

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

export async function writeMemoryFile(vaultPath: string, memory: FullMemory): Promise<string> {
  const body = memory.canonical_text ?? ''
  const content = serializeToFile(memory, body)
  const filePath = getMemoryFilePath(vaultPath, memory)

  mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 })
  writeFileSync(filePath, content, { encoding: 'utf-8', mode: 0o600 })

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
