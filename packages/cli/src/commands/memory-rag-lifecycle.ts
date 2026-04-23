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
import type { AgentRole, Db, RagRebuildMode, RuntimeDataProfile, RuntimeDataProfileManifest } from 'fulcrum-agent-core'
import { RAG_REBUILD_DOMAINS, readRebuildReport, runRagRebuild } from 'fulcrum-memory'
import type { RagRebuildActor, RagRebuildDomain, RagRebuildReport } from 'fulcrum-memory'

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
}

export interface RagRebuildAuthorization {
  authorized: boolean
  reason: string
}

function normalizeActor(actor: Partial<RagRebuildActor> | undefined, fallbackRole: AgentRole = 'software_engineer'): RagRebuildActor {
  return {
    kind: actor?.kind ?? 'human',
    role: actor?.role ?? fallbackRole,
    id: actor?.id ?? 'local-operator',
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
    profile_manifest?: RuntimeDataProfileManifest
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

function openProfileDb(profile_manifest: RuntimeDataProfileManifest, db: Db | undefined): Db {
  if (db) return db
  const profileDb = getDbAtPath(profile_manifest.paths.db)
  runMigrations(profileDb)
  return profileDb
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
  return {
    report_id: newId('rag_rebuild_report'),
    status: 'failed',
    mode: input.mode,
    scope: {
      workspace_id: input.workspace_id,
      project_id: input.project_id,
      runtime_profile: profile,
      domains: input.domains && input.domains.length > 0 ? input.domains : [...RAG_REBUILD_DOMAINS],
    },
    profile_manifest,
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
      errors: [{ code: 'runtime_profile_unsafe', message: 'runtime profile path resolution is unsafe', details: profile_manifest.errors }],
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

  const mismatch = db ? runtimeProfileDbMismatch(db, profile_manifest) : null
  if (mismatch) {
    return failedProfileReport({
      workspace_id,
      project_id,
      mode: input.mode,
      runtime_profile,
      data_dir: input.data_dir,
      domains: input.domains,
      errors: [{ code: mismatch.code, message: 'database connection does not match selected runtime profile', details: mismatch }],
    })
  }

  const activeDb = openProfileDb(profile_manifest, db)

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

export function getRagRebuildReport(input: { report_id: string; workspace_id?: string; runtime_profile?: RuntimeDataProfile; data_dir?: string }, db?: Db): RagRebuildReport {
  const ids = projectIdsFromPath(process.cwd())
  if (input.runtime_profile) {
    const profile_manifest = resolveRuntimeDataProfile({ profile: input.runtime_profile, data_dir: input.data_dir })
    const mismatch = db ? runtimeProfileDbMismatch(db, profile_manifest) : null
    if (mismatch) throw new Error(`database connection does not match selected runtime profile: ${mismatch.code}`)
    if (!db && !existsSync(profile_manifest.paths.db)) throw new Error(`rebuild report not found: ${input.report_id}`)
    const activeDb = openProfileDb(profile_manifest, db)
    return readRebuildReport(input.report_id, input.workspace_id ?? ids.workspace_id, activeDb)
  }
  return readRebuildReport(input.report_id, input.workspace_id ?? ids.workspace_id, db ?? getDb())
}
