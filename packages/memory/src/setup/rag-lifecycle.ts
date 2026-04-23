import { copyFileSync, cpSync, existsSync, mkdirSync, statSync, writeFileSync } from 'fs'
import { isAbsolute, join, relative, resolve } from 'path'
import { getDb, getDbAtPath, newId, resolveRuntimeDataProfile, runMigrations, runtimeProfileDbMismatch } from 'fulcrum-agent-core'
import type { Db, RuntimeDataProfileManifest } from 'fulcrum-agent-core'
import { backfillCodeFiles } from './backfill-code-files.js'
import { rebuildGraphCoverage } from '../graph/coverage.js'
import { captureRebuildInputSnapshot, validateRebuildInputSnapshot } from './rebuild-snapshot.js'
import { createRebuildCandidate, finishRebuildCandidate, updateRebuildCandidateStatus } from './rebuild-candidate.js'
import { runRebuildParityChecks } from './rebuild-parity.js'
import { createRunningRebuildReport, finishRebuildReport } from './rebuild-report.js'
import { redactRagDetails } from './rag-redaction.js'
import { buildRagHealthReport } from './rag-health.js'
import { buildRagRepairPlan } from './rag-repair.js'
import { evaluateRepairVerification } from './repair/verification.js'
import { DEFAULT_RAG_REBUILD_DOMAINS, RAG_REBUILD_DOMAINS } from './rag-types.js'
import type { RagParityCheck, RagRebuildActor, RagRebuildDomain, RagRebuildReport, RagRebuildRequest } from './rag-types.js'

export { DEFAULT_RAG_REBUILD_DOMAINS } from './rag-types.js'
export { RAG_REBUILD_DOMAINS } from './rag-types.js'
export type { RagParityCheck, RagRebuildActor, RagRebuildDomain, RagRebuildReport, RagRebuildRequest } from './rag-types.js'

function safeCount(db: Db, sql: string, ...params: unknown[]): number {
  try {
    const row = db.prepare(sql).get(...params) as { n: number } | undefined
    return row?.n ?? 0
  } catch {
    return 0
  }
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || value.length === 0) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function countProjectGraphEvidence(db: Db, table: 'graph_entities' | 'graph_edges', input: { workspace_id: string; project_id: string }): number {
  try {
    const rows = db.prepare(`SELECT properties FROM ${table} WHERE workspace_id = ?`).all(input.workspace_id) as Array<{ properties: string }>
    return rows.filter(row => {
      const properties = parseJsonObject(row.properties)
      return properties['graph_evidence'] === true && properties['project_id'] === input.project_id
    }).length
  } catch {
    return 0
  }
}

function normalizeDomains(domains: RagRebuildDomain[] | undefined): RagRebuildDomain[] {
  if (!domains || domains.length === 0) return [...DEFAULT_RAG_REBUILD_DOMAINS]
  const seen = new Set<RagRebuildDomain>()
  for (const domain of domains) {
    if (!RAG_REBUILD_DOMAINS.includes(domain)) throw new Error(`unknown RAG rebuild domain: ${domain}`)
    seen.add(domain)
  }
  return [...seen]
}

export function planRagRebuildScope(
  input: { workspace_id: string; project_id: string; domains?: RagRebuildDomain[] },
  db: Db = getDb(),
): { domains: RagRebuildDomain[]; counts: Record<string, number>; total: number } {
  const domains = normalizeDomains(input.domains)
  const counts: Record<string, number> = {
    raw_files: 0,
    l0_sources: safeCount(db, 'SELECT COUNT(*) AS n FROM l0_sources WHERE workspace_id = ? AND (project_id = ? OR project_id IS NULL)', input.workspace_id, input.project_id),
    memory_files: 0,
    memories: safeCount(db, 'SELECT COUNT(*) AS n FROM memories WHERE workspace_id = ? AND (project_id = ? OR project_id IS NULL)', input.workspace_id, input.project_id),
    tasks: safeCount(db, 'SELECT COUNT(*) AS n FROM tasks WHERE workspace_id = ? AND project_id = ?', input.workspace_id, input.project_id),
    code_files: safeCount(db, 'SELECT COUNT(*) AS n FROM code_files WHERE workspace_id = ? AND project_id = ?', input.workspace_id, input.project_id),
    code_chunks: safeCount(db, 'SELECT COUNT(*) AS n FROM code_chunks WHERE workspace_id = ? AND project_id = ?', input.workspace_id, input.project_id),
    vectors: safeCount(db, `
      SELECT COUNT(*) AS n
        FROM vector_metadata vm
        LEFT JOIN memories m
          ON vm.source_domain = 'memory'
         AND m.workspace_id = vm.workspace_id
         AND m.memory_id = vm.source_id
        LEFT JOIN code_chunks c
          ON vm.source_domain = 'code_chunk'
         AND c.workspace_id = vm.workspace_id
         AND c.chunk_id = vm.source_id
       WHERE vm.workspace_id = ?
         AND (
           (vm.source_domain = 'memory' AND (m.project_id = ? OR m.project_id IS NULL))
           OR (vm.source_domain = 'code_chunk' AND c.project_id = ?)
         )
    `, input.workspace_id, input.project_id, input.project_id),
    graph_entities: countProjectGraphEvidence(db, 'graph_entities', input),
    graph_edges: countProjectGraphEvidence(db, 'graph_edges', input),
  }
  counts['raw_files'] = counts['l0_sources'] ?? 0
  counts['memory_files'] = counts['memories'] ?? 0
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0)
  return { domains, counts, total }
}

function rebuildFts(db: Db): string[] {
  const warnings: string[] = []
  for (const table of ['memories_fts', 'code_chunks_fts']) {
    try {
      db.prepare(`INSERT INTO ${table}(${table}) VALUES ('rebuild')`).run()
    } catch (err) {
      warnings.push(`${table} rebuild skipped: ${(err as Error).message}`)
    }
  }
  return warnings
}

function releaseCandidateBuildSavepoint(db: Db, commit: boolean): void {
  if (!commit) db.exec('ROLLBACK TO SAVEPOINT rag_rebuild_candidate')
  db.exec('RELEASE SAVEPOINT rag_rebuild_candidate')
}

type RuntimeProfileBackup = NonNullable<RagRebuildReport['backup']>

function backupRootInsideSource(source: string, backupRoot: string): boolean {
  const fromSource = relative(resolve(source), resolve(backupRoot))
  return fromSource === '' || Boolean(fromSource && !fromSource.startsWith('..') && !isAbsolute(fromSource))
}

function copyExistingPath(source: string, destination: string): boolean {
  if (!existsSync(source)) return false
  const stat = statSync(source)
  if (stat.isDirectory()) {
    cpSync(source, destination, { recursive: true, force: true })
    return true
  }
  if (stat.isFile()) {
    copyFileSync(source, destination)
    return true
  }
  return false
}

async function captureRuntimeProfileBackup(backup_ref: string, profile_manifest: RuntimeDataProfileManifest, db: Db): Promise<RuntimeProfileBackup> {
  const backup_path = join(profile_manifest.paths.artifacts, 'backups', backup_ref)
  const sources = {
    vault: profile_manifest.paths.vault,
    graph: profile_manifest.paths.graph,
    vectors: profile_manifest.paths.vectors,
  }

  if (existsSync(profile_manifest.paths.db) && backupRootInsideSource(profile_manifest.paths.db, backup_path)) {
    throw new Error('cannot place profile backup inside db source path')
  }
  for (const [key, source] of Object.entries(sources)) {
    if (existsSync(source) && backupRootInsideSource(source, backup_path)) {
      throw new Error(`cannot place profile backup inside ${key} source path`)
    }
  }

  mkdirSync(backup_path, { recursive: true })
  const dbBackupPath = join(backup_path, 'fulcrum.db')
  const copied_paths: Record<string, string | null> = {
    db: dbBackupPath,
  }
  await db.backup(dbBackupPath)
  for (const [key, source] of Object.entries(sources)) {
    const destination = join(backup_path, key)
    copied_paths[key] = copyExistingPath(source, destination) ? destination : null
  }
  writeFileSync(join(backup_path, 'profile-manifest.json'), JSON.stringify({
    backup_ref,
    created_at: new Date().toISOString(),
    profile_manifest,
    copied_paths,
  }, null, 2))

  return { backup_ref, restorable: true, backup_path }
}

function runCandidateBuild(
  input: { workspace_id: string; project_id: string; domains: RagRebuildDomain[] },
  db: Db,
): { parity: RagParityCheck[]; warnings: string[] } {
  const warnings: string[] = []
  let parity: RagParityCheck[] = []
  db.exec('SAVEPOINT rag_rebuild_candidate')
  try {
    if (input.domains.includes('code')) backfillCodeFiles(db, { workspace_id: input.workspace_id, project_id: input.project_id })
    if (input.domains.includes('graph')) rebuildGraphCoverage({ workspace_id: input.workspace_id, project_id: input.project_id }, db)
    if (input.domains.includes('fts') || input.domains.includes('l1') || input.domains.includes('code')) warnings.push(...rebuildFts(db))
    parity = runRebuildParityChecks(input, db)
    const passed = parity.every(check => check.status !== 'fail')
    releaseCandidateBuildSavepoint(db, passed)
    return { parity, warnings }
  } catch (err) {
    releaseCandidateBuildSavepoint(db, false)
    throw err
  }
}

function ensureWorkspaceAndProject(db: Db, workspace_id: string, project_id: string): void {
  db.prepare('INSERT OR IGNORE INTO workspaces(workspace_id, name) VALUES (?, ?)').run(workspace_id, workspace_id)
  db.prepare('INSERT OR IGNORE INTO projects(project_id, workspace_id, name) VALUES (?, ?, ?)').run(project_id, workspace_id, project_id)
}

function openActiveDb(request: RagRebuildRequest, profile_manifest: RuntimeDataProfileManifest, db: Db | undefined): Db {
  if (db) return db
  if (!request.runtime_profile && !request.data_dir) return getDb()
  const profileDb = getDbAtPath(profile_manifest.paths.db)
  runMigrations(profileDb)
  return profileDb
}

export async function runRagRebuild(request: RagRebuildRequest, db?: Db): Promise<RagRebuildReport> {
  const domains = normalizeDomains(request.domains)
  const actor = request.actor ?? { kind: 'agent', role: 'software_engineer', id: 'unknown' }
  const runtime_profile = request.runtime_profile ?? 'dev'
  const profile_manifest = resolveRuntimeDataProfile({
    profile: runtime_profile,
    data_dir: request.data_dir,
  })
  const verification_refs = request.verification_refs ?? []
  const mutation_scope = { profile: runtime_profile, clear_scope: 'derived_rag_state', domains }
  const errors: unknown[] = []
  const warnings: string[] = []

  const mismatch = db ? runtimeProfileDbMismatch(db, profile_manifest) : null
  if (mismatch) {
    errors.push({ code: mismatch.code, message: 'database connection does not match selected runtime profile', details: mismatch })
    return {
      report_id: newId('rag_rebuild_report'),
      status: 'failed',
      mode: request.mode,
      scope: { workspace_id: request.workspace_id, project_id: request.project_id, runtime_profile, domains },
      profile_manifest,
      profile_confirmation: request.confirm_profile ?? null,
      backup: null,
      verification_refs,
      candidate: null,
      counts: {},
      parity: [],
      warnings,
      errors,
      artifact_path: null,
    }
  }

  if (!profile_manifest.safe_for_destructive_execution) {
    errors.push({ code: 'runtime_profile_unsafe', message: 'runtime profile path resolution is unsafe', details: profile_manifest.errors })
    return {
      report_id: newId('rag_rebuild_report'),
      status: 'failed',
      mode: request.mode,
      scope: { workspace_id: request.workspace_id, project_id: request.project_id, runtime_profile, domains },
      profile_manifest,
      profile_confirmation: request.confirm_profile ?? null,
      backup: null,
      verification_refs,
      candidate: null,
      counts: {},
      parity: [],
      warnings,
      errors,
      artifact_path: null,
    }
  }

  if (request.mode === 'execute' && runtime_profile === 'install' && request.confirm_profile !== 'install') {
    errors.push({ code: 'install_profile_confirmation_required', message: 'install profile execution requires confirm_profile=install' })
    return {
      report_id: newId('rag_rebuild_report'),
      status: 'failed',
      mode: request.mode,
      scope: { workspace_id: request.workspace_id, project_id: request.project_id, runtime_profile, domains },
      profile_manifest,
      profile_confirmation: request.confirm_profile ?? null,
      backup: null,
      verification_refs,
      candidate: null,
      counts: {},
      parity: [],
      warnings,
      errors,
      artifact_path: null,
    }
  }

  const activeDb = openActiveDb(request, profile_manifest, db)
  const planned = planRagRebuildScope({ ...request, domains }, activeDb)
  const repairPlan = buildRagRepairPlan({
    workspace_id: request.workspace_id,
    project_id: request.project_id,
    runtime_profile,
    data_dir: request.data_dir,
    domains,
  }, activeDb)
  const repair_plan_id = request.repair_plan_id ?? repairPlan.repair_plan_id
  const retryable_actions = repairPlan.required_actions
    .filter(action => action.retryable)
    .map(action => action.command)
  const blockedRepair = request.mode === 'execute'
    && repairPlan.blocking_conditions.length > 0
    && repairPlan.required_actions.length === 0

  if (planned.total === 0 && request.allow_empty !== true) {
    errors.push({ code: 'empty_scope', message: 'RAG rebuild scope is empty; pass allow_empty to continue' })
    return {
      report_id: newId('rag_rebuild_report'),
      status: 'failed',
      mode: request.mode,
      scope: { workspace_id: request.workspace_id, project_id: request.project_id, runtime_profile, domains },
      profile_manifest,
      profile_confirmation: request.confirm_profile ?? null,
      backup: null,
      verification_refs,
      candidate: null,
      counts: planned.counts,
      parity: [],
      warnings,
      errors,
      artifact_path: null,
      repair_plan_id,
      final_health_status: repairPlan.health_status,
      verification: {
        derived_state_only: true,
        canonical_sources_mutated: false,
        domains,
        repair_strategy: repairPlan.strategy,
        verification_steps: repairPlan.verification_steps,
        blocking_conditions: repairPlan.blocking_conditions,
      },
      retryable_actions,
    }
  }

  if (blockedRepair) {
    errors.push({ code: 'repair_blocked', blocking_conditions: repairPlan.blocking_conditions })
    return {
      report_id: newId('rag_rebuild_report'),
      status: 'failed',
      mode: request.mode,
      scope: { workspace_id: request.workspace_id, project_id: request.project_id, runtime_profile, domains },
      profile_manifest,
      profile_confirmation: request.confirm_profile ?? null,
      backup: null,
      verification_refs,
      candidate: null,
      counts: planned.counts,
      parity: [],
      warnings,
      errors,
      artifact_path: null,
      repair_plan_id,
      final_health_status: repairPlan.health_status,
      verification: {
        derived_state_only: true,
        canonical_sources_mutated: false,
        domains,
        repair_strategy: repairPlan.strategy,
        verification_steps: repairPlan.verification_steps,
        blocking_conditions: repairPlan.blocking_conditions,
      },
      retryable_actions,
    }
  }

  if (request.mode !== 'execute') {
    return {
      report_id: newId('rag_rebuild_report'),
      status: 'completed',
      mode: request.mode,
      scope: { workspace_id: request.workspace_id, project_id: request.project_id, runtime_profile, domains },
      profile_manifest,
      profile_confirmation: request.confirm_profile ?? null,
      backup: null,
      verification_refs,
      candidate: null,
      counts: planned.counts,
      parity: [],
      warnings,
      errors,
      artifact_path: null,
      repair_plan_id,
      final_health_status: repairPlan.health_status,
      verification: {
        derived_state_only: true,
        canonical_sources_mutated: false,
        domains,
        repair_strategy: repairPlan.strategy,
        verification_steps: repairPlan.verification_steps,
        blocking_conditions: repairPlan.blocking_conditions,
      },
      retryable_actions,
    }
  }

  ensureWorkspaceAndProject(activeDb, request.workspace_id, request.project_id)

  let backup: RuntimeProfileBackup | null = null
  try {
    backup = runtime_profile === 'install'
      ? await captureRuntimeProfileBackup(newId('profile_backup'), profile_manifest, activeDb)
      : null
  } catch (err) {
    errors.push({ code: 'profile_backup_failed', message: (err as Error).message })
    return {
      report_id: newId('rag_rebuild_report'),
      status: 'failed',
      mode: request.mode,
      scope: { workspace_id: request.workspace_id, project_id: request.project_id, runtime_profile, domains },
      profile_manifest,
      profile_confirmation: request.confirm_profile ?? null,
      backup: null,
      verification_refs,
      candidate: null,
      counts: planned.counts,
      parity: [],
      warnings,
      errors,
      artifact_path: null,
    }
  }
  const backup_ref = backup?.backup_ref ?? null

  const report_id = createRunningRebuildReport({
    workspace_id: request.workspace_id,
    project_id: request.project_id,
    requested_by: actor.id,
    actor_role: actor.role,
    mode: request.mode,
    domains,
    runtime_profile,
    profile_manifest,
    backup_ref,
    verification_refs,
    mutation_scope,
    profile_confirmation: request.confirm_profile ?? null,
    repair_plan_id,
  }, activeDb)

  try {
    const snapshot = captureRebuildInputSnapshot({ ...request, domains }, activeDb)
    const candidate = createRebuildCandidate({
      report_id,
      workspace_id: request.workspace_id,
      project_id: request.project_id,
      domains,
      input_snapshot_id: snapshot.input_snapshot_id,
      runtime_profile,
      profile_manifest,
    }, activeDb)

    updateRebuildCandidateStatus(candidate.candidate_id, 'verifying', [], activeDb)

    await request.on_before_promote?.()

    const validated = validateRebuildInputSnapshot(snapshot.input_snapshot_id, activeDb)
    let parity: RagParityCheck[] = []
    if (validated.status === 'current') {
      const build = runCandidateBuild({ workspace_id: request.workspace_id, project_id: request.project_id, domains }, activeDb)
      parity = build.parity
      warnings.push(...build.warnings)
    }
    const disposition = finishRebuildCandidate({
      candidate_id: candidate.candidate_id,
      snapshot_status: validated.status,
      parity,
    }, activeDb)

    if (validated.status !== 'current') {
      errors.push({ code: 'stale_snapshot', message: validated.stale_reason ?? 'snapshot is stale' })
    }
    for (const failed of parity.filter(check => check.status === 'fail')) {
      errors.push({ code: 'parity_failed', check: failed.name, details: failed.details ?? null })
    }

    const finalCounts = planRagRebuildScope({ ...request, domains }, activeDb).counts
    const finalHealth = buildRagHealthReport({
      workspace_id: request.workspace_id,
      project_id: request.project_id,
      runtime_profile,
      data_dir: request.data_dir,
    }, activeDb)
    const verificationResult = evaluateRepairVerification(finalHealth, repairPlan.verification_steps, {
      workspace_id: request.workspace_id,
      project_id: request.project_id,
      verification_refs,
      domains,
    }, activeDb)
    if (!verificationResult.verified) {
      errors.push({
        code: 'verification_failed',
        failed_steps: verificationResult.failed_steps,
        failed_eval_refs: verificationResult.failed_eval_refs,
      })
    }
    const status = errors.length > 0 ? 'failed' : 'completed'
    const verification = {
      derived_state_only: true,
      canonical_sources_mutated: false,
      domains,
      repair_strategy: repairPlan.strategy,
      verification_steps: repairPlan.verification_steps,
      blocking_conditions: repairPlan.blocking_conditions,
      final_health_status: verificationResult.final_health_status,
      verification_failed_steps: verificationResult.failed_steps,
      eval_gate_refs: verificationResult.eval_gate_refs,
      eval_failed_refs: verificationResult.failed_eval_refs,
      verification_passed: verificationResult.verified,
      parity_failed: parity.filter(check => check.status === 'fail').length,
      input_snapshot_status: validated.status,
    }
    finishRebuildReport({
      report_id,
      status,
      candidate_id: candidate.candidate_id,
      candidate_disposition: disposition.disposition,
      input_snapshot_id: snapshot.input_snapshot_id,
      summary: finalCounts,
      parity,
      warnings,
      errors: redactRagDetails(errors),
      backup_ref,
      verification_refs,
      mutation_scope,
      profile_confirmation: request.confirm_profile ?? null,
      final_health_status: finalHealth.status,
      verification,
      retryable_actions: status === 'failed' ? retryable_actions : [],
    }, activeDb)

    return {
      report_id,
      status,
      mode: request.mode,
      scope: { workspace_id: request.workspace_id, project_id: request.project_id, runtime_profile, domains },
      profile_manifest,
      profile_confirmation: request.confirm_profile ?? null,
      backup,
      verification_refs,
      candidate: {
        candidate_id: candidate.candidate_id,
        status: disposition.status,
        disposition: disposition.disposition,
        input_snapshot_id: snapshot.input_snapshot_id,
        input_snapshot_status: validated.status,
        served_state_unchanged: disposition.disposition !== 'promoted',
      },
      counts: finalCounts,
      parity,
      warnings,
      errors,
      artifact_path: null,
      repair_plan_id,
      final_health_status: finalHealth.status,
      verification,
      retryable_actions: status === 'failed' ? retryable_actions : [],
    }
  } catch (err) {
    errors.push({ code: 'rebuild_failed', message: (err as Error).message })
    finishRebuildReport({
      report_id,
      status: 'failed',
      candidate_disposition: 'none',
      summary: planned.counts,
      parity: [],
      warnings,
      errors,
      backup_ref,
      verification_refs,
      mutation_scope,
      profile_confirmation: request.confirm_profile ?? null,
      final_health_status: repairPlan.health_status,
      verification: {
        derived_state_only: true,
        canonical_sources_mutated: false,
        domains,
      },
      retryable_actions,
    }, activeDb)
    return {
      report_id,
      status: 'failed',
      mode: request.mode,
      scope: { workspace_id: request.workspace_id, project_id: request.project_id, runtime_profile, domains },
      profile_manifest,
      profile_confirmation: request.confirm_profile ?? null,
      backup,
      verification_refs,
      candidate: null,
      counts: planned.counts,
      parity: [],
      warnings,
      errors,
      artifact_path: null,
      repair_plan_id,
      final_health_status: repairPlan.health_status,
      verification: {
        derived_state_only: true,
        canonical_sources_mutated: false,
        domains,
        repair_strategy: repairPlan.strategy,
        verification_steps: repairPlan.verification_steps,
        blocking_conditions: repairPlan.blocking_conditions,
      },
      retryable_actions,
    }
  }
}
