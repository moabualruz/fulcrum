import {
  canEditFiles,
  canWriteCode,
  emitEvent,
  getDb,
  isL1,
  projectIdsFromPath,
} from 'fulcrum-agent-core'
import type { AgentRole, Db, RagRebuildMode } from 'fulcrum-agent-core'
import { readRebuildReport, runRagRebuild } from 'fulcrum-memory'
import type { RagRebuildActor, RagRebuildDomain, RagRebuildReport } from 'fulcrum-memory'

export interface RagRebuildCommandInput {
  workspace_id?: string
  project_id?: string
  mode: RagRebuildMode
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
      actor_role: input.actor.role,
      authorized: input.authorized.authorized,
      authorization_reason: input.authorized.reason,
    },
  }, db)
}

export async function executeRagRebuildCommand(input: RagRebuildCommandInput, db: Db = getDb()): Promise<RagRebuildReport> {
  const ids = projectIdsFromPath(process.cwd())
  const workspace_id = input.workspace_id ?? ids.workspace_id
  const project_id = input.project_id ?? ids.project_id
  const actor = normalizeActor(input.actor)
  const auth = authorizeRagRebuild(actor)

  if (input.mode === 'execute' && !auth.authorized) {
    auditRagRebuild({ workspace_id, project_id, actor, mode: input.mode, authorized: auth }, db)
    throw new Error(`not authorized to execute RAG rebuild: ${auth.reason}`)
  }

  const result = await runRagRebuild({
    workspace_id,
    project_id,
    mode: input.mode,
    domains: input.domains,
    allow_empty: input.allow_empty,
    actor,
  }, db)

  auditRagRebuild({ workspace_id, project_id, actor, mode: input.mode, authorized: auth, report_id: result.report_id }, db)
  return result
}

export function getRagRebuildReport(input: { report_id: string; workspace_id?: string }, db: Db = getDb()): RagRebuildReport {
  const ids = projectIdsFromPath(process.cwd())
  return readRebuildReport(input.report_id, input.workspace_id ?? ids.workspace_id, db)
}
