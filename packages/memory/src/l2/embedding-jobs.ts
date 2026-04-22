import { getDb, newId } from 'fulcrum-agent-core'
import type { Db, EmbeddingJobSourceDomain, EmbeddingJobStatus } from 'fulcrum-agent-core'
import { redactRagDetails } from '../setup/rag-redaction.js'

export interface EmbeddingJobRow {
  job_id: string
  workspace_id: string
  project_id: string
  source_domain: EmbeddingJobSourceDomain
  status: EmbeddingJobStatus
}

export function createEmbeddingJobPlaceholder(
  input: { workspace_id: string; project_id: string; source_domain: EmbeddingJobSourceDomain; scope?: Record<string, unknown> },
  db: Db = getDb(),
): EmbeddingJobRow {
  const job_id = newId('embedding_job')
  db.prepare(`
    INSERT INTO embedding_jobs (job_id, workspace_id, project_id, source_domain, status, scope)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).run(job_id, input.workspace_id, input.project_id, input.source_domain, JSON.stringify(redactRagDetails(input.scope ?? {})))
  return { job_id, workspace_id: input.workspace_id, project_id: input.project_id, source_domain: input.source_domain, status: 'pending' }
}

