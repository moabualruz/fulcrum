// packages/memory/src/vault/client.ts
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
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
  curated: [decision, fact, summary, task_outcome, task_decision, error, doc]
  operational: [symbol, diff, code, procedure, task_goal, task_failure]
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
}

export function getMemoryFilePath(vaultPath: string, memory: FullMemory): string {
  const date = new Date(memory.created_at)
  const yyyy = date.getUTCFullYear().toString()
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0')

  if (CURATED_KINDS.has(memory.kind)) {
    // memories/curated/workspaces/<ws_id>/<scope>/<yyyy>/<mm>/<id>.md
    return join(
      vaultPath,
      'memories', 'curated', 'workspaces',
      memory.workspace_id,
      memory.scope,
      yyyy, mm,
      `${memory.memory_id}.md`
    )
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
