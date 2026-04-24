#!/usr/bin/env -S node --import tsx/esm
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  getDb,
  initEmbedding,
  loadConfig,
  projectIdsFromPath,
  resolveRuntimeDataProfile,
  runMigrations,
} from '../packages/core/src/index.ts'
import {
  buildRagHealthReport,
  getVaultPath,
  rebuildGraphCoverage,
  runMigration101MemoryV3Lifecycle,
  runMigration102MemoryV3SourceIndex,
  runMigration103MemoryV3Cutover,
  runMigration104MemoryV3DropCanonicalText,
  storeChunkEmbedding,
  storeEmbeddingInVec,
} from '../packages/memory/src/index.ts'
import { contentSha256 } from '../packages/memory/src/pci/syncer.ts'
import { indexCodeFilePrimitive } from '../packages/memory/src/setup/backfill-code-files.ts'

type Frontmatter = Record<string, string>

const root = resolve(process.argv.includes('--root') ? process.argv[process.argv.indexOf('--root') + 1]! : process.cwd())
const resetDerived = process.argv.includes('--reset-derived')
const skipEmbeddings = process.argv.includes('--skip-embeddings')
const embeddingDevice = process.argv.includes('--embedding-device')
  ? process.argv[process.argv.indexOf('--embedding-device') + 1]!
  : 'cpu'
const ids = projectIdsFromPath(root)
const vaultRoot = getVaultPath()
const profile = resolveRuntimeDataProfile({ profile: 'dev' })

function log(message: string): void {
  process.stdout.write(`[${new Date().toISOString()}] ${message}\n`)
}

function removePath(path: string): void {
  if (!existsSync(path)) return
  rmSync(path, { recursive: true, force: true })
  log(`removed ${path}`)
}

function removeSqlite(path: string): void {
  for (const suffix of ['', '-wal', '-shm']) removePath(`${path}${suffix}`)
}

function preserveOnlyRawVault(): void {
  const raw = join(vaultRoot, 'raw')
  const tmp = join(dirname(vaultRoot), `.raw-preserve-${Date.now()}`)
  if (existsSync(raw)) {
    mkdirSync(dirname(tmp), { recursive: true })
    renameSync(raw, tmp)
  }
  removePath(vaultRoot)
  mkdirSync(vaultRoot, { recursive: true })
  if (existsSync(tmp)) {
    mkdirSync(dirname(raw), { recursive: true })
    renameSync(tmp, raw)
    log(`preserved ${raw}`)
  } else {
    mkdirSync(raw, { recursive: true })
    log(`created empty ${raw}`)
  }
}

function resetDerivedState(): void {
  log('resetting derived state; preserving only L0 raw vault docs')
  removeSqlite(join(process.env['FULCRUM_DATA_DIR'] ?? join(process.env['HOME'] ?? '.', '.local/share/fulcrum'), 'fulcrum.db'))
  removeSqlite(profile.paths.db)
  removeSqlite(join(root, '.fulcrum', 'fulcrum.db'))
  for (const path of [profile.paths.graph, profile.paths.vectors, profile.paths.artifacts]) removePath(path)
  preserveOnlyRawVault()
}

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkFiles(full))
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full)
  }
  return out
}

function splitFrontmatter(raw: string): { frontmatter: Frontmatter; body: string } {
  if (!raw.startsWith('---\n')) return { frontmatter: {}, body: raw }
  const close = raw.indexOf('\n---\n', 4)
  if (close < 0) return { frontmatter: {}, body: raw }
  const fm: Frontmatter = {}
  for (const line of raw.slice(4, close).split('\n')) {
    const idx = line.indexOf(':')
    if (idx < 0) continue
    fm[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return { frontmatter: fm, body: raw.slice(close + 5).replace(/^\n+/, '') }
}

function hashBody(body: string): string {
  return createHash('sha256').update(body).digest('hex')
}

function importL0Sources(): number {
  const db = getDb()
  runMigrations(db)
  runMigration101MemoryV3Lifecycle(db)
  runMigration102MemoryV3SourceIndex(db)
  runMigration103MemoryV3Cutover(db)
  runMigration104MemoryV3DropCanonicalText(db)
  db.prepare('INSERT OR IGNORE INTO workspaces(workspace_id, name) VALUES (?, ?)').run(ids.workspace_id, ids.workspace_id)
  db.prepare('INSERT OR IGNORE INTO projects(project_id, workspace_id, name, root_path, root_realpath) VALUES (?, ?, ?, ?, ?)')
    .run(ids.project_id, ids.workspace_id, ids.project_id, root, root)

  const files = walkFiles(join(vaultRoot, 'raw'))
  const insert = db.prepare(`
    INSERT OR REPLACE INTO l0_sources (
      source_id, source_type, session_id, workspace_id, project_id, cwd,
      vault_path, content_hash, size_bytes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  let imported = 0
  for (let i = 0; i < files.length; i++) {
    const file = files[i]!
    const raw = readFileSync(file, 'utf8')
    const { frontmatter, body } = splitFrontmatter(raw)
    const rel = relative(vaultRoot, file)
    const sourceId = frontmatter['id'] ?? file.replace(/.*\/([^/]+)\.md$/, '$1')
    const sourceType = frontmatter['source_type'] ?? rel.split('/')[1] ?? 'bash_trace'
    const workspaceId = frontmatter['workspace_id'] || ids.workspace_id
    const projectId = frontmatter['project_id'] || ids.project_id
    db.prepare('INSERT OR IGNORE INTO workspaces(workspace_id, name) VALUES (?, ?)').run(workspaceId, workspaceId)
    if (projectId) {
      db.prepare('INSERT OR IGNORE INTO projects(project_id, workspace_id, name) VALUES (?, ?, ?)').run(projectId, workspaceId, projectId)
    }
    insert.run(
      sourceId,
      sourceType,
      frontmatter['session_id'] || null,
      workspaceId,
      projectId,
      frontmatter['cwd'] || root,
      rel,
      frontmatter['content_hash'] || hashBody(body),
      Number(frontmatter['size_bytes'] || Buffer.byteLength(body)),
      frontmatter['created_at'] || statSync(file).mtime.toISOString(),
    )
    imported++
    if (imported % 250 === 0 || imported === files.length) log(`L0 import ${imported}/${files.length}`)
  }
  return imported
}

function gitProjectFiles(): string[] {
  const result = spawnSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr || 'git ls-files failed')
  return result.stdout.split('\0').filter(Boolean)
    .filter(path => !path.startsWith('node_modules/') && !path.startsWith('.git/') && !path.startsWith('.fulcrum/'))
}

async function indexCode(): Promise<number> {
  const files = gitProjectFiles()
  let indexed = 0
  const skipped = new Map<string, { count: number; samples: string[] }>()
  const skip = (reason: string, rel: string): void => {
    const entry = skipped.get(reason) ?? { count: 0, samples: [] }
    entry.count++
    if (entry.samples.length < 10) entry.samples.push(rel)
    skipped.set(reason, entry)
  }
  for (let i = 0; i < files.length; i++) {
    const rel = files[i]!
    const abs = join(root, rel)
    if (!existsSync(abs)) continue
    const stats = statSync(abs)
    if (!stats.isFile() || stats.size > 5 * 1024 * 1024) {
      skip(!stats.isFile() ? 'not_regular_file_or_symlink' : 'too_large', rel)
      continue
    }
    const buffer = readFileSync(abs)
    if (buffer.subarray(0, 2048).includes(0)) {
      skip('binary', rel)
      continue
    }
    const content = buffer.toString('utf8')
    const result = await indexCodeFilePrimitive({
      workspace_id: ids.workspace_id,
      project_id: ids.project_id,
      rel_path: rel,
      content,
      sha256: contentSha256(content),
      mtime_ns: Math.round(Number(stats.mtimeMs) * 1_000_000),
      size_bytes: stats.size,
    })
    if (result.action === 'indexed' || result.action === 'updated' || result.action === 'skipped') indexed++
    const skippedCount = [...skipped.values()].reduce((sum, entry) => sum + entry.count, 0)
    if (i < 10 || indexed % 100 === 0 || i + 1 === files.length) log(`code index ${i + 1}/${files.length} indexed=${indexed} skipped=${skippedCount}`)
  }
  const skippedTotal = [...skipped.values()].reduce((sum, entry) => sum + entry.count, 0)
  if (skippedTotal > 0) {
    log(`skipped non-text/non-regular files=${skippedTotal}`)
    for (const [reason, entry] of skipped.entries()) {
      log(`skip reason=${reason} count=${entry.count} samples=${entry.samples.join(', ')}`)
    }
  }
  return indexed
}

async function embedAll(): Promise<void> {
  log(`warming embedding runtime device=${embeddingDevice}`)
  const config = loadConfig()
  config.embedding.text = { ...config.embedding.text, device: embeddingDevice as 'auto' | 'cpu' | 'cuda' | 'webgpu' }
  if (config.embedding.code) config.embedding.code = { ...config.embedding.code, device: embeddingDevice as 'auto' | 'cpu' | 'cuda' | 'webgpu' }
  config.reranker = { ...config.reranker, device: embeddingDevice as 'auto' | 'cpu' | 'cuda' | 'webgpu' }
  await initEmbedding(config)
  const db = getDb()
  const memories = db.prepare(`
    SELECT memory_id, content FROM memories
     WHERE workspace_id = ? AND (project_id = ? OR project_id IS NULL)
     ORDER BY created_at
  `).all(ids.workspace_id, ids.project_id) as Array<{ memory_id: string; content: string }>
  let memoryEmbedded = 0
  for (const row of memories) {
    await storeEmbeddingInVec(db, row.memory_id, row.content ?? '')
    memoryEmbedded++
    if (memoryEmbedded % 100 === 0 || memoryEmbedded === memories.length) log(`memory embeddings ${memoryEmbedded}/${memories.length}`)
  }

  const chunks = db.prepare(`
    SELECT chunk_id, content FROM code_chunks
     WHERE workspace_id = ? AND project_id = ?
     ORDER BY indexed_at
  `).all(ids.workspace_id, ids.project_id) as Array<{ chunk_id: string; content: string }>
  let codeEmbedded = 0
  let failed = 0
  for (const row of chunks) {
    const result = await storeChunkEmbedding(db, row.chunk_id, row.content ?? '')
    if (result.status === 'failed') failed++
    codeEmbedded++
    if (codeEmbedded % 100 === 0 || codeEmbedded === chunks.length) log(`code embeddings ${codeEmbedded}/${chunks.length} failed=${failed}`)
  }
}

async function main(): Promise<void> {
  log(`root=${root}`)
  log(`workspace=${ids.workspace_id} project=${ids.project_id}`)
  log(`vault=${vaultRoot}`)
  if (resetDerived) resetDerivedState()
  const l0 = importL0Sources()
  log(`imported L0 sources=${l0}`)
  const indexed = await indexCode()
  log(`indexed project files=${indexed}`)
  log('rebuilding graph coverage')
  rebuildGraphCoverage({ workspace_id: ids.workspace_id, project_id: ids.project_id }, getDb())
  if (!skipEmbeddings) await embedAll()
  else log('skipping embeddings by request')
  const report = buildRagHealthReport({ workspace_id: ids.workspace_id, project_id: ids.project_id, vault_path: vaultRoot }, getDb())
  log(`doctor status=${report.status}`)
  log(JSON.stringify({
    l0: report.domains.l0,
    l1: report.domains.l1,
    code: report.domains.code,
    vectors: report.domains.vectors,
    graph: report.domains.graph,
  }, null, 2))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
