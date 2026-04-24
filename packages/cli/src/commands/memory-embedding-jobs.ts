import {
  canEditFiles,
  canWriteCode,
  emitEvent,
  getDb,
  isL1,
  projectIdsFromPath,
} from 'fulcrum-agent-core'
import type { AgentRole, Db, EmbeddingJobSourceDomain, FulcrumConfig } from 'fulcrum-agent-core'
import {
  cancelEmbeddingJob,
  createEmbeddingJob,
  getEmbeddingJobStatus,
  listRagJobEvents,
  resumeEmbeddingJob,
  retryFailedEmbeddingJob,
} from 'fulcrum-memory'

export interface EmbeddingJobActor {
  kind: 'human' | 'agent'
  role: AgentRole
  id: string
}

export interface EmbeddingJobCommandInput {
  workspace_id?: string
  project_id?: string
  source_domain?: EmbeddingJobSourceDomain
  scope?: 'memories' | 'l1-pages' | 'code'
  allow_empty?: boolean
  provider?: string
  model?: string
  requested_device?: string
  dimensions?: number
  batch_size?: number
  max_items?: number
  job_id?: string
  actor?: Partial<EmbeddingJobActor>
}

export interface EmbeddingJobAuthorization {
  authorized: boolean
  reason: string
}

interface EmbeddingJobNextAction {
  command: string
  reason: string
}

function normalizeActor(actor: Partial<EmbeddingJobActor> | undefined, fallbackRole: AgentRole = 'software_engineer'): EmbeddingJobActor {
  return {
    kind: actor?.kind ?? 'human',
    role: actor?.role ?? fallbackRole,
    id: actor?.id ?? 'local-operator',
  }
}

export function authorizeEmbeddingJobOperation(actor: EmbeddingJobActor): EmbeddingJobAuthorization {
  if (actor.kind === 'human') return { authorized: true, reason: 'human_operator' }
  if (isL1(actor.role)) return { authorized: true, reason: 'l1_role' }
  if (canWriteCode(actor.role) || canEditFiles(actor.role)) return { authorized: true, reason: 'write_capable_role' }
  return { authorized: false, reason: 'actor_lacks_rag_maintenance_capability' }
}

function sourceDomainFromScope(scope: EmbeddingJobCommandInput['scope'], fallback?: EmbeddingJobSourceDomain): EmbeddingJobSourceDomain {
  if (scope === 'l1-pages') return 'l1_pages'
  if (scope === 'code') return 'code_chunks'
  if (scope === 'memories') return 'memories'
  return fallback ?? 'memories'
}

function auditEmbeddingJob(
  input: {
    workspace_id: string
    project_id?: string
    actor: EmbeddingJobActor
    operation: 'embed' | 'resume' | 'retry' | 'cancel'
    authorized: EmbeddingJobAuthorization
    job_id?: string
  },
  db: Db,
): void {
  emitEvent({
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    evt_type: 'rag_maintenance_audit',
    object_type: 'embedding_job',
    object_id: input.job_id,
    actor_type: input.actor.kind,
    actor_id: input.actor.id,
    severity: input.authorized.authorized ? 'info' : 'warn',
    payload: {
      operation: input.operation,
      actor_role: input.actor.role,
      authorized: input.authorized.authorized,
      authorization_reason: input.authorized.reason,
      job_id: input.job_id,
    },
  }, db)
}

function resolveIds(input: EmbeddingJobCommandInput): { workspace_id: string; project_id: string } {
  const ids = projectIdsFromPath(process.cwd())
  return {
    workspace_id: input.workspace_id ?? ids.workspace_id,
    project_id: input.project_id ?? ids.project_id,
  }
}

function assertAuthorized(input: {
  workspace_id: string
  project_id?: string
  actor: EmbeddingJobActor
  operation: 'embed' | 'resume' | 'retry' | 'cancel'
  job_id?: string
}, db: Db): void {
  const auth = authorizeEmbeddingJobOperation(input.actor)
  auditEmbeddingJob({ ...input, authorized: auth }, db)
  if (!auth.authorized) {
    throw new Error(`not authorized to ${input.operation} embedding job: ${auth.reason}`)
  }
}

function nextActionForJob(job: { job_id: string; status: string }): EmbeddingJobNextAction | null {
  if (job.status === 'pending' || job.status === 'running') {
    return {
      command: `fulcrum jobs resume ${job.job_id} --json`,
      reason: `embedding_job_${job.status}`,
    }
  }
  if (job.status === 'degraded') {
    return {
      command: `fulcrum jobs retry ${job.job_id} --failed --json`,
      reason: 'embedding_job_degraded',
    }
  }
  return null
}

function shouldFailClosedOnEmbeddingInit(config: FulcrumConfig): boolean {
  return [
    config.embedding.text.device,
    config.embedding.code?.device,
    config.reranker.device,
  ].some((device) => device !== undefined && device !== 'auto')
}

async function warmEmbeddingRuntime(): Promise<void> {
  const { getTextEmbedder, initEmbedding, loadConfig } = await import('fulcrum-agent-core')
  if (getTextEmbedder()) return
  const config = loadConfig()
  try {
    await initEmbedding(config)
  } catch (err) {
    if (shouldFailClosedOnEmbeddingInit(config)) throw err
  }
}

function embeddingWorkRemaining(status: ReturnType<typeof getEmbeddingJobStatus>): boolean {
  return status.progress.pending > 0 || status.progress.stale > 0 || status.progress.running > 0
}

export async function startEmbeddingJobCommand(input: EmbeddingJobCommandInput, db: Db = getDb()) {
  const ids = resolveIds(input)
  const actor = normalizeActor(input.actor)
  assertAuthorized({ ...ids, actor, operation: 'embed' }, db)
  const job = createEmbeddingJob({
    workspace_id: ids.workspace_id,
    project_id: ids.project_id,
    source_domain: sourceDomainFromScope(input.scope, input.source_domain),
    provider: input.provider,
    model: input.model,
    requested_device: input.requested_device,
    dimensions: input.dimensions,
    scope: { allow_empty: input.allow_empty },
  }, db)
  auditEmbeddingJob({ ...ids, actor, operation: 'embed', authorized: { authorized: true, reason: 'started' }, job_id: job.job_id }, db)
  return {
    job_id: job.job_id,
    status: job.status,
    source_domain: job.source_domain,
    preflight_counts: job.preflight_counts,
    requested: {
      provider: job.requested_provider,
      model: job.requested_model,
      device: job.requested_device,
      dimensions: job.dimensions,
    },
    next_action: nextActionForJob(job),
  }
}

export function getEmbeddingJobStatusCommand(input: EmbeddingJobCommandInput, db: Db = getDb()) {
  const ids = resolveIds(input)
  if (!input.job_id) throw new Error('job_id required')
  return getEmbeddingJobStatus({ job_id: input.job_id, workspace_id: ids.workspace_id }, db)
}

export function getEmbeddingJobLogsCommand(input: EmbeddingJobCommandInput, db: Db = getDb()) {
  const ids = resolveIds(input)
  if (!input.job_id) throw new Error('job_id required')
  return { job_id: input.job_id, events: listRagJobEvents({ job_id: input.job_id, workspace_id: ids.workspace_id }, db) }
}

export function cancelEmbeddingJobCommand(input: EmbeddingJobCommandInput, db: Db = getDb()) {
  const ids = resolveIds(input)
  if (!input.job_id) throw new Error('job_id required')
  const actor = normalizeActor(input.actor)
  assertAuthorized({ ...ids, actor, operation: 'cancel', job_id: input.job_id }, db)
  return cancelEmbeddingJob({ job_id: input.job_id, workspace_id: ids.workspace_id }, db)
}

export async function resumeEmbeddingJobCommand(input: EmbeddingJobCommandInput, db: Db = getDb()) {
  const ids = resolveIds(input)
  if (!input.job_id) throw new Error('job_id required')
  const actor = normalizeActor(input.actor)
  assertAuthorized({ ...ids, actor, operation: 'resume', job_id: input.job_id }, db)
  if (embeddingWorkRemaining(getEmbeddingJobStatus({ job_id: input.job_id, workspace_id: ids.workspace_id }, db))) {
    await warmEmbeddingRuntime()
  }
  return resumeEmbeddingJob({ job_id: input.job_id, workspace_id: ids.workspace_id, batch_size: input.batch_size, max_items: input.max_items }, db)
}

export async function retryFailedEmbeddingJobCommand(input: EmbeddingJobCommandInput, db: Db = getDb()) {
  const ids = resolveIds(input)
  if (!input.job_id) throw new Error('job_id required')
  const actor = normalizeActor(input.actor)
  assertAuthorized({ ...ids, actor, operation: 'retry', job_id: input.job_id }, db)
  if (embeddingWorkRemaining(getEmbeddingJobStatus({ job_id: input.job_id, workspace_id: ids.workspace_id }, db))) {
    await warmEmbeddingRuntime()
  }
  return retryFailedEmbeddingJob({ job_id: input.job_id, workspace_id: ids.workspace_id, batch_size: input.batch_size, max_items: input.max_items }, db)
}
