import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, resolve, sep } from 'path'
import { pathFingerprintForRoadmap } from './rag-redaction.js'
import type { Db, RagHealthStatus, RuntimeDataProfile, RuntimeDataProfileManifest } from 'fulcrum-agent-core'
import type { RagHealthDomain, RagHealthProfileManifest } from './rag-health.js'

interface CountRow {
  n: number
}

export interface SourcePathRow {
  id: string
  vault_path: string | null
}

interface FtsBackedRow {
  rowid: number
  content: string | null
  title?: string | null
  summary?: string | null
  symbol_path?: string | null
}

export interface FtsParityCheck {
  name: string
  status: 'pass' | 'fail'
  expected: number
  actual: number
  missing_index_rows: number
  unchecked_rows: number
  details?: string
}

interface VaultFileScope {
  workspace_id?: string
  project_id?: string | null
}

export const SCOPED_VECTOR_METADATA_CTE = `
  WITH scoped_vectors AS (
    SELECT v.*
      FROM vector_metadata v
      JOIN memories m ON m.memory_id = v.source_id AND m.workspace_id = v.workspace_id
     WHERE v.source_domain = 'memory'
       AND m.workspace_id = ?
       AND (m.project_id = ? OR m.project_id IS NULL)
    UNION ALL
    SELECT v.*
      FROM vector_metadata v
      JOIN code_chunks c ON c.chunk_id = v.source_id AND c.workspace_id = v.workspace_id
     WHERE v.source_domain = 'code_chunk'
       AND c.workspace_id = ?
       AND c.project_id = ?
  )
`

export function scopedVectorParams(input: { workspace_id: string; project_id: string }): unknown[] {
  return [input.workspace_id, input.project_id, input.workspace_id, input.project_id]
}

export function safeCount(db: Db, sql: string, ...params: unknown[]): number {
  try {
    const row = db.prepare(sql).get(...params) as CountRow | undefined
    return row?.n ?? 0
  } catch {
    return 0
  }
}

export function safeRows<T>(db: Db, sql: string, ...params: unknown[]): T[] {
  try {
    return db.prepare(sql).all(...params) as T[]
  } catch {
    return []
  }
}

export function objectExists(db: Db, name: string): boolean {
  const row = db.prepare(`
    SELECT name FROM sqlite_master
     WHERE name = ? AND type IN ('table', 'view')
  `).get(name) as { name: string } | undefined
  return Boolean(row)
}

export function missingObject(name: string): RagHealthDomain {
  return {
    status: 'failed',
    error: `${name} is not available; run memory migrations before checking RAG health`,
  }
}

function toVaultRel(vaultPath: string, filePath: string): string {
  return relative(vaultPath, filePath).split(sep).join('/')
}

export function walkVaultMarkdown(vaultPath: string, relDir: string): string[] {
  const root = join(vaultPath, relDir)
  if (!existsSync(root)) return []
  const files: string[] = []

  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const entryPath = join(dir, entry)
      const stat = statSync(entryPath)
      if (stat.isDirectory()) visit(entryPath)
      else if (entry.endsWith('.md')) files.push(toVaultRel(vaultPath, entryPath))
    }
  }

  visit(root)
  return files.sort()
}

export function fileExistsInVault(vaultPath: string, relPath: string | null): boolean {
  if (!relPath) return false
  const vaultRoot = resolve(vaultPath)
  const candidate = resolve(vaultRoot, relPath)
  if (candidate !== vaultRoot && !candidate.startsWith(`${vaultRoot}${sep}`)) return false
  return existsSync(candidate)
}

function frontmatterValue(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed === 'null') return null
  return trimmed.replace(/^['"]|['"]$/g, '')
}

function readVaultFileScope(vaultPath: string, relPath: string): VaultFileScope | null {
  const vaultRoot = resolve(vaultPath)
  const candidate = resolve(vaultRoot, relPath)
  if (candidate !== vaultRoot && !candidate.startsWith(`${vaultRoot}${sep}`)) return null

  try {
    const lines = readFileSync(candidate, 'utf-8').split(/\r?\n/)
    if (lines[0]?.trim() !== '---') return null

    const scope: VaultFileScope = {}
    for (const line of lines.slice(1)) {
      if (line.trim() === '---') return scope

      const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/)
      if (!match) continue

      const key = match[1]
      const value = frontmatterValue(match[2] ?? '')
      if (key === 'workspace_id' && value) scope.workspace_id = value
      if (key === 'project_id') scope.project_id = value
    }
  } catch {
    return null
  }

  return null
}

export function fileMatchesScope(
  vaultPath: string,
  relPath: string,
  input: { workspace_id: string; project_id: string },
): boolean {
  const scope = readVaultFileScope(vaultPath, relPath)
  if (!scope?.workspace_id) return false
  if (scope.workspace_id !== input.workspace_id) return false
  return scope.project_id === undefined || scope.project_id === null || scope.project_id === input.project_id
}

function statusFromDomain(domain: RagHealthDomain): RagHealthStatus {
  return domain.status
}

export function aggregateStatus(domains: Record<string, RagHealthDomain>): RagHealthStatus {
  const statuses = Object.values(domains).map(statusFromDomain)
  if (statuses.includes('failed')) return 'failed'
  if (statuses.includes('degraded')) return 'degraded'
  return 'healthy'
}

export function pushAction(actions: string[], action: string): void {
  if (!actions.includes(action)) actions.push(action)
}

export function toHealthProfileManifest(profile: RuntimeDataProfileManifest): RagHealthProfileManifest {
  return {
    profile: profile.profile,
    safe_for_destructive_execution: profile.safe_for_destructive_execution,
    disposable: profile.disposable,
    requires_confirmation: profile.requires_confirmation,
    path_fingerprints: profile.path_fingerprints,
    errors: profile.errors.map((error) => ({
      code: error.code,
      profile: error.profile,
      path_key: error.path_key,
      path_fingerprint: pathFingerprintForRoadmap(error.path),
      ...(error.conflicts_with_profile ? { conflicts_with_profile: error.conflicts_with_profile } : {}),
      ...(error.conflicts_with_path_key ? { conflicts_with_path_key: error.conflicts_with_path_key } : {}),
      ...(error.conflicts_with_path ? { conflicts_with_path_fingerprint: pathFingerprintForRoadmap(error.conflicts_with_path) } : {}),
    })),
  }
}

function firstSearchToken(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const match = value?.match(/[A-Za-z0-9]{2,}/)
    if (match?.[0]) return match[0]
  }
  return null
}

function ftsHasRowToken(db: Db, table: 'memories_fts' | 'code_chunks_fts', rowid: number, token: string): boolean {
  const phrase = `"${token.replace(/"/g, '""')}"`
  const row = db.prepare(`
    SELECT rowid FROM ${table}
     WHERE ${table} MATCH ? AND rowid = ?
     LIMIT 1
  `).get(phrase, rowid) as { rowid: number } | undefined
  return Boolean(row)
}

export function ftsParityCheck(
  db: Db,
  input: {
    name: string
    table: 'memories_fts' | 'code_chunks_fts'
    sql: string
    params: unknown[]
    tokenValues: (row: FtsBackedRow) => Array<string | null | undefined>
  },
): FtsParityCheck {
  try {
    const rows = db.prepare(input.sql).all(...input.params) as FtsBackedRow[]
    let missing = 0
    let unchecked = 0
    for (const row of rows) {
      const token = firstSearchToken(...input.tokenValues(row))
      if (!token) {
        unchecked += 1
        continue
      }
      if (!ftsHasRowToken(db, input.table, row.rowid, token)) missing += 1
    }
    return {
      name: input.name,
      status: missing > 0 ? 'fail' : 'pass',
      expected: rows.length,
      actual: rows.length - missing,
      missing_index_rows: missing,
      unchecked_rows: unchecked,
    }
  } catch (err) {
    return {
      name: input.name,
      status: 'fail',
      expected: 0,
      actual: 0,
      missing_index_rows: 0,
      unchecked_rows: 0,
      details: (err as Error).message,
    }
  }
}

export function healthStatusFromGraphCoverage(status: string): RagHealthStatus {
  return status === 'failed' || status === 'stale' ? 'degraded' : 'healthy'
}

function rebuildProfileFlags(runtime_profile: RuntimeDataProfile): string {
  return runtime_profile === 'install'
    ? '--profile install --confirm-profile install'
    : `--profile ${runtime_profile}`
}

function scopeFlags(input: { workspace_id: string; project_id: string }): string {
  return `--workspace-id ${input.workspace_id} --project-id ${input.project_id}`
}

export function rebuildCommand(domain: string, input: { workspace_id: string; project_id: string }, runtime_profile: RuntimeDataProfile): string {
  return `fulcrum memory rebuild --domain ${domain} ${scopeFlags(input)} --execute ${rebuildProfileFlags(runtime_profile)} --json`
}

export function embedCommand(scope: 'memories' | 'code', input: { workspace_id: string; project_id: string }): string {
  return `fulcrum memory embed --scope ${scope} ${scopeFlags(input)} --json`
}

export function jobRetryCommand(input: { workspace_id: string; project_id: string }): string {
  return `fulcrum jobs retry <job_id> --failed ${scopeFlags(input)} --json`
}
