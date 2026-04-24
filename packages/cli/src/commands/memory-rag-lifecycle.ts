import { existsSync } from 'fs'
import {
  canEditFiles,
  canWriteCode,
  emitEvent,
  getDb,
  getDbAtPath,
  isL1,
  newId,
  projectIdsFromPath,
  resolveRuntimeDataProfile,
  runMigrations,
  runtimeProfileDbMismatch,
} from 'fulcrum-agent-core'
import type { AgentRole, Db, RagRebuildMode, RagRepairRunStatus, RuntimeDataProfile, RuntimeDataProfileManifest } from 'fulcrum-agent-core'
import { DEFAULT_RAG_REBUILD_DOMAINS, buildRagRepairPlan, pathFingerprintForRoadmap, readRebuildReport, redactRagDetails, runRagRebuild } from 'fulcrum-memory'
import type { RagRebuildActor, RagRebuildDomain, RagRebuildReport, RagRepairPlan } from 'fulcrum-memory'

export interface RagRebuildCommandInput {
  workspace_id?: string
  project_id?: string
  mode: RagRebuildMode
  runtime_profile?: RuntimeDataProfile
  data_dir?: string
  confirm_profile?: RuntimeDataProfile
  verification_refs?: string[]
  domains?: RagRebuildDomain[]
  allow_empty?: boolean
  actor?: Partial<RagRebuildActor>
  repair_plan_id?: string
}

export interface RagRepairCommandInput extends Omit<RagRebuildCommandInput, 'mode'> {
  runtime_profile: RuntimeDataProfile
  repair_plan_id?: string
}

export interface RagRepairCommandReport {
  repair_run_id: string
  repair_plan_id: string
  report_id: string
  status: RagRepairRunStatus
  final_health_status: RagRebuildReport['final_health_status']
  retryable_actions: string[]
  errors: unknown[]
  rebuild_report: RagRebuildReport
}

export interface RagRebuildAuthorization {
  authorized: boolean
  reason: string
}

type PublicProfileManifest = RagRebuildReport['profile_manifest']

function normalizeActor(actor: Partial<RagRebuildActor> | undefined, fallbackRole: AgentRole = 'software_engineer'): RagRebuildActor {
  return {
    kind: actor?.kind ?? 'human',
    role: actor?.role ?? fallbackRole,
    id: actor?.id ?? 'local-operator',
  }
}

function toPublicProfileManifest(profile_manifest: RuntimeDataProfileManifest): PublicProfileManifest {
  return {
    profile: profile_manifest.profile,
    safe_for_destructive_execution: profile_manifest.safe_for_destructive_execution,
    disposable: profile_manifest.disposable,
    requires_confirmation: profile_manifest.requires_confirmation,
    path_fingerprints: profile_manifest.path_fingerprints,
    errors: profile_manifest.errors.map(error => ({
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

function publicDbMismatchDetails(mismatch: NonNullable<ReturnType<typeof runtimeProfileDbMismatch>>): Record<string, unknown> {
  return {
    code: mismatch.code,
    profile: mismatch.profile,
    expected_fingerprint: mismatch.expected_fingerprint,
    actual_fingerprint: pathFingerprintForRoadmap(mismatch.actual_path),
  }
}

export function authorizeRagRebuild(actor: RagRebuildActor): RagRebuildAuthorization {
  if (actor.kind === 'human') return { authorized: true, reason: 'human_operator' }
  if (isL1(actor.role)) return { authorized: true, reason: 'l1_role' }
  if (canWriteCode(actor.role) || canEditFiles(actor.role)) return { authorized: true, reason: 'write_capable_role' }
  return { authorized: false, reason: 'actor_lacks_rag_maintenance_capability' }
}

function auditRagRebuild(
  input: {
    workspace_id: string
    project_id: string
    actor: RagRebuildActor
    mode: RagRebuildMode
    runtime_profile?: RuntimeDataProfile
    profile_manifest?: RuntimeDataProfileManifest | PublicProfileManifest
    backup_ref?: string | null
    verification_refs?: string[]
    mutation_scope?: Record<string, unknown>
    authorized: RagRebuildAuthorization
    report_id?: string
  },
  db: Db,
): void {
  emitEvent({
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    evt_type: 'rag_maintenance_audit',
    object_type: 'rag_rebuild_report',
    object_id: input.report_id,
    actor_type: input.actor.kind,
    actor_id: input.actor.id,
    severity: input.authorized.authorized ? 'info' : 'warn',
    payload: {
      operation: 'rebuild',
      mode: input.mode,
      runtime_profile: input.runtime_profile,
      profile_manifest: input.profile_manifest ? {
        profile: input.profile_manifest.profile,
        path_fingerprints: input.profile_manifest.path_fingerprints,
      } : undefined,
      backup_ref: input.backup_ref ?? null,
      verification_refs: input.verification_refs ?? [],
      mutation_scope: input.mutation_scope ?? null,
      actor_role: input.actor.role,
      authorized: input.authorized.authorized,
      authorization_reason: input.authorized.reason,
    },
  }, db)
}

export function inspectRuntimeProfilePaths(input: { profile?: RuntimeDataProfile; data_dir?: string } = {}): RuntimeDataProfileManifest {
  return resolveRuntimeDataProfile({ profile: input.profile ?? 'dev', data_dir: input.data_dir })
}

function ensureWorkspaceAndProject(db: Db, workspace_id: string, project_id: string): void {
  db.prepare('INSERT OR IGNORE INTO workspaces(workspace_id, name) VALUES (?, ?)').run(workspace_id, workspace_id)
  db.prepare('INSERT OR IGNORE INTO projects(project_id, workspace_id, name) VALUES (?, ?, ?)').run(project_id, workspace_id, project_id)
}

function persistRagRepairPlan(plan: RagRepairPlan, profile_manifest: RuntimeDataProfileManifest, db: Db): void {
  db.prepare(`
    INSERT INTO rag_repair_plans (
      repair_plan_id, workspace_id, project_id, runtime_profile, status,
      health_status, clean_slate_required, domains, mutation_scope,
      required_actions, optional_actions, profile_path_fingerprints,
      blocking_errors, preflight_warnings
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(repair_plan_id) DO UPDATE SET
      workspace_id = excluded.workspace_id,
      project_id = excluded.project_id,
      runtime_profile = excluded.runtime_profile,
      status = excluded.status,
      health_status = excluded.health_status,
      clean_slate_required = excluded.clean_slate_required,
      domains = excluded.domains,
      mutation_scope = excluded.mutation_scope,
      required_actions = excluded.required_actions,
      optional_actions = excluded.optional_actions,
      profile_path_fingerprints = excluded.profile_path_fingerprints,
      blocking_errors = excluded.blocking_errors,
      preflight_warnings = excluded.preflight_warnings
  `).run(
    plan.repair_plan_id,
    plan.workspace_id,
    plan.project_id,
    plan.runtime_profile,
    plan.status,
    plan.health_status,
    plan.clean_slate_required ? 1 : 0,
    JSON.stringify(plan.domains),
    JSON.stringify(plan.mutation_scope),
    JSON.stringify(plan.required_actions),
    JSON.stringify(plan.optional_actions),
    JSON.stringify(profile_manifest.path_fingerprints),
    JSON.stringify(plan.blocking_errors),
    JSON.stringify(plan.preflight_warnings),
  )
}

function createRagRepairRun(input: {
  repair_run_id: string
  repair_plan_id: string
  workspace_id: string
  project_id: string
  runtime_profile: RuntimeDataProfile
  domains: RagRebuildDomain[]
  actor: RagRebuildActor
}, db: Db): void {
  db.prepare(`
    INSERT INTO rag_repair_runs (
      repair_run_id, repair_plan_id, workspace_id, project_id, runtime_profile,
      status, domains, actor_kind, actor_role, started_at
    ) VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?, datetime('now'))
  `).run(
    input.repair_run_id,
    input.repair_plan_id,
    input.workspace_id,
    input.project_id,
    input.runtime_profile,
    JSON.stringify(input.domains),
    input.actor.kind,
    input.actor.role,
  )
}

function repairRunStatusFromReport(report: RagRebuildReport): RagRepairRunStatus {
  if (report.status === 'cancelled') return 'cancelled'
  if (report.status === 'failed') return 'failed'
  if (report.final_health_status && report.final_health_status !== 'healthy') return 'degraded'
  return 'completed'
}

function finishRagRepairRun(input: {
  repair_run_id: string
  status: RagRepairRunStatus
  report_id?: string
  final_health_status?: RagRebuildReport['final_health_status']
  retryable_actions?: string[]
  errors?: unknown[]
}, db: Db): void {
  db.prepare(`
    UPDATE rag_repair_runs
       SET status = ?,
           report_id = COALESCE(?, report_id),
           final_health_status = ?,
           retryable_actions = ?,
           errors = ?,
           finished_at = datetime('now')
     WHERE repair_run_id = ?
  `).run(
    input.status,
    input.report_id ?? null,
    input.final_health_status ?? null,
    JSON.stringify(input.retryable_actions ?? []),
    JSON.stringify(redactRagDetails(input.errors ?? [])),
    input.repair_run_id,
  )
}

function openProfileDb(profile_manifest: RuntimeDataProfileManifest, db: Db | undefined): Db {
  if (db) return db
  const profileDb = getDbAtPath(profile_manifest.paths.db)
  runMigrations(profileDb)
  return profileDb
}

function dbHasProjectScope(db: Db, workspace_id: string, project_id: string): boolean {
  try {
    const row = db.prepare(`
      SELECT 1
        FROM projects
       WHERE workspace_id = ? AND project_id = ?
       LIMIT 1
    `).get(workspace_id, project_id)
    return Boolean(row)
  } catch {
    return false
  }
}

function openRebuildDb(input: { runtime_profile?: RuntimeDataProfile; data_dir?: string }, profile_manifest: RuntimeDataProfileManifest, db: Db | undefined, workspace_id: string, project_id: string): Db {
  if (db) return db
  if ((input.runtime_profile ?? 'dev') === 'dev' && !input.data_dir) {
    const activeDb = getDb()
    if (dbHasProjectScope(activeDb, workspace_id, project_id)) return activeDb
  }
  return openProfileDb(profile_manifest, undefined)
}

function graphRebuildGuidance(domains: RagRebuildDomain[] | undefined): string[] {
  if (domains && !domains.includes('graph')) return []
  return [
    'Graph rebuild refreshes relationship evidence for tasks, decisions, files, symbols, errors, fixes, memory entities, imports, and calls.',
    'After graph rebuild, run `fulcrum memory doctor --json` or `fulcrum search context "<relationship query>" --explain --json` to verify coverage and contribution.',
  ]
}

function failedProfileReport(
  input: {
    workspace_id: string
    project_id: string
    mode: RagRebuildMode
    runtime_profile?: RuntimeDataProfile
    data_dir?: string
    domains?: RagRebuildDomain[]
    errors: unknown[]
  },
): RagRebuildReport {
  const profile = input.runtime_profile ?? 'dev'
  const profile_manifest = resolveRuntimeDataProfile({ profile, data_dir: input.data_dir })
  const public_profile_manifest = toPublicProfileManifest(profile_manifest)
  return {
    report_id: newId('rag_rebuild_report'),
    status: 'failed',
    mode: input.mode,
    scope: {
      workspace_id: input.workspace_id,
      project_id: input.project_id,
      runtime_profile: profile,
      domains: input.domains && input.domains.length > 0 ? input.domains : [...DEFAULT_RAG_REBUILD_DOMAINS],
    },
    profile_manifest: public_profile_manifest,
    profile_confirmation: null,
    backup: null,
    verification_refs: [],
    candidate: null,
    counts: {},
    parity: [],
    warnings: graphRebuildGuidance(input.domains),
    errors: input.errors,
    artifact_path: null,
  }
}

export async function executeRagRebuildCommand(input: RagRebuildCommandInput, db?: Db): Promise<RagRebuildReport> {
  const ids = projectIdsFromPath(process.cwd())
  const workspace_id = input.workspace_id ?? ids.workspace_id
  const project_id = input.project_id ?? ids.project_id
  const actor = normalizeActor(input.actor)
  const auth = authorizeRagRebuild(actor)
  const runtime_profile = input.runtime_profile

  if (input.mode === 'execute' && !runtime_profile) {
    return failedProfileReport({
      workspace_id,
      project_id,
      mode: input.mode,
      data_dir: input.data_dir,
      domains: input.domains,
      errors: [{ code: 'runtime_profile_required', message: 'destructive RAG rebuild requires explicit runtime_profile' }],
    })
  }

  const profile_manifest = resolveRuntimeDataProfile({
    profile: runtime_profile ?? 'dev',
    data_dir: input.data_dir,
  })

  if (!profile_manifest.safe_for_destructive_execution) {
    return failedProfileReport({
      workspace_id,
      project_id,
      mode: input.mode,
      runtime_profile,
      data_dir: input.data_dir,
      domains: input.domains,
      errors: [{ code: 'runtime_profile_unsafe', message: 'runtime profile path resolution is unsafe', details: toPublicProfileManifest(profile_manifest).errors }],
    })
  }

  if (input.mode === 'execute' && runtime_profile === 'install' && input.confirm_profile !== 'install') {
    return failedProfileReport({
      workspace_id,
      project_id,
      mode: input.mode,
      runtime_profile,
      data_dir: input.data_dir,
      domains: input.domains,
      errors: [{ code: 'install_profile_confirmation_required', message: 'install profile execution requires confirm_profile=install' }],
    })
  }

  const enforceProfileDbMatch = Boolean(input.data_dir) || (runtime_profile ?? 'dev') !== 'dev'
  const mismatch = db && enforceProfileDbMatch ? runtimeProfileDbMismatch(db, profile_manifest) : null
  if (mismatch) {
    return failedProfileReport({
      workspace_id,
      project_id,
      mode: input.mode,
      runtime_profile,
      data_dir: input.data_dir,
      domains: input.domains,
      errors: [{ code: mismatch.code, message: 'database connection does not match selected runtime profile', details: publicDbMismatchDetails(mismatch) }],
    })
  }

  const activeDb = openRebuildDb(input, profile_manifest, db, workspace_id, project_id)

  if (input.mode === 'execute' && !auth.authorized) {
    ensureWorkspaceAndProject(activeDb, workspace_id, project_id)
    auditRagRebuild({ workspace_id, project_id, actor, mode: input.mode, runtime_profile, profile_manifest, authorized: auth }, activeDb)
    throw new Error(`not authorized to execute RAG rebuild: ${auth.reason}`)
  }

  if (input.mode === 'execute') ensureWorkspaceAndProject(activeDb, workspace_id, project_id)

  const result = await runRagRebuild({
    workspace_id,
    project_id,
    mode: input.mode,
    runtime_profile: runtime_profile ?? 'dev',
    data_dir: input.data_dir,
    confirm_profile: input.confirm_profile,
    verification_refs: input.verification_refs,
    domains: input.domains,
    allow_empty: input.allow_empty,
    actor,
    repair_plan_id: input.repair_plan_id,
  }, activeDb)

  for (const warning of graphRebuildGuidance(result.scope.domains)) {
    if (!result.warnings.includes(warning)) result.warnings.push(warning)
  }

  if (input.mode === 'execute') {
    auditRagRebuild({
      workspace_id,
      project_id,
      actor,
      mode: input.mode,
      runtime_profile,
      profile_manifest: result.profile_manifest,
      backup_ref: result.backup?.backup_ref ?? null,
      verification_refs: result.verification_refs,
      mutation_scope: { profile: runtime_profile, clear_scope: 'derived_rag_state', domains: result.scope.domains },
      authorized: auth,
      report_id: result.report_id,
    }, activeDb)
  }
  return result
}

export async function executeRagRepairCommand(input: RagRepairCommandInput, db?: Db): Promise<RagRepairCommandReport> {
  const ids = projectIdsFromPath(process.cwd())
  const workspace_id = input.workspace_id ?? ids.workspace_id
  const project_id = input.project_id ?? ids.project_id
  const runtime_profile = input.runtime_profile
  const actor = normalizeActor(input.actor)
  const auth = authorizeRagRebuild(actor)
  const domains = input.domains && input.domains.length > 0 ? input.domains : [...DEFAULT_RAG_REBUILD_DOMAINS]

  const profile_manifest = resolveRuntimeDataProfile({
    profile: runtime_profile,
    data_dir: input.data_dir,
  })
  if (!profile_manifest.safe_for_destructive_execution) {
    throw new Error('runtime profile path resolution is unsafe')
  }
  const mismatch = db ? runtimeProfileDbMismatch(db, profile_manifest) : null
  if (mismatch) throw new Error(`database connection does not match selected runtime profile: ${mismatch.code}`)
  const activeDb = openRebuildDb(input, profile_manifest, db, workspace_id, project_id)
  ensureWorkspaceAndProject(activeDb, workspace_id, project_id)
  if (!auth.authorized) {
    auditRagRebuild({
      workspace_id,
      project_id,
      actor,
      mode: 'execute',
      runtime_profile,
      profile_manifest,
      authorized: auth,
    }, activeDb)
    throw new Error(`not authorized to execute RAG repair: ${auth.reason}`)
  }

  const planned = buildRagRepairPlan({
    workspace_id,
    project_id,
    runtime_profile,
    data_dir: input.data_dir,
    domains,
  }, activeDb)
  const repairPlan = { ...planned, repair_plan_id: input.repair_plan_id ?? planned.repair_plan_id }
  persistRagRepairPlan(repairPlan, profile_manifest, activeDb)

  const repair_run_id = newId('rag_repair_run')
  createRagRepairRun({
    repair_run_id,
    repair_plan_id: repairPlan.repair_plan_id,
    workspace_id,
    project_id,
    runtime_profile,
    domains,
    actor,
  }, activeDb)

  try {
    const rebuild_report = await executeRagRebuildCommand({
      ...input,
      workspace_id,
      project_id,
      mode: 'execute',
      runtime_profile,
      domains,
      repair_plan_id: repairPlan.repair_plan_id,
    }, activeDb)
    const status = repairRunStatusFromReport(rebuild_report)
    const retryable_actions = rebuild_report.retryable_actions ?? []
    finishRagRepairRun({
      repair_run_id,
      status,
      report_id: rebuild_report.report_id,
      final_health_status: rebuild_report.final_health_status,
      retryable_actions,
      errors: rebuild_report.errors,
    }, activeDb)
    return {
      repair_run_id,
      repair_plan_id: repairPlan.repair_plan_id,
      report_id: rebuild_report.report_id,
      status,
      final_health_status: rebuild_report.final_health_status,
      retryable_actions,
      errors: rebuild_report.errors,
      rebuild_report,
    }
  } catch (err) {
    const errors = [{ code: 'repair_failed', message: err instanceof Error ? err.message : String(err) }]
    finishRagRepairRun({
      repair_run_id,
      status: 'failed',
      retryable_actions: repairPlan.required_actions.filter(action => action.retryable).map(action => action.command),
      errors,
    }, activeDb)
    throw err
  }
}

export function getRagRebuildReport(input: { report_id: string; workspace_id?: string; runtime_profile?: RuntimeDataProfile; data_dir?: string }, db?: Db): RagRebuildReport {
  const ids = projectIdsFromPath(process.cwd())
  if (input.runtime_profile) {
    const profile_manifest = resolveRuntimeDataProfile({ profile: input.runtime_profile, data_dir: input.data_dir })
    const mismatch = db ? runtimeProfileDbMismatch(db, profile_manifest) : null
    if (mismatch) throw new Error(`database connection does not match selected runtime profile: ${mismatch.code}`)
    if (!db && !existsSync(profile_manifest.paths.db)) {
      throw new Error(`rebuild report not found: ${input.report_id} (profile_db=${profile_manifest.path_fingerprints.db})`)
    }
    const activeDb = openProfileDb(profile_manifest, db)
    return readRebuildReport(input.report_id, input.workspace_id ?? ids.workspace_id, activeDb)
  }
  return readRebuildReport(input.report_id, input.workspace_id ?? ids.workspace_id, db ?? getDb())
}
