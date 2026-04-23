import { getDb } from 'fulcrum-agent-core'
import type { Db } from 'fulcrum-agent-core'
import { redactRagDetails, redactRoadmapArtifact } from '../../setup/rag-redaction.js'
import type { ContextPack } from '../context-pack.js'
import type { TypedContextResult } from '../context-types.js'
import {
  persistRagContextResults,
  persistRagQueryTrace,
  type GraphContributionDetail,
  type QueryTraceStage,
} from '../query-trace.js'
import { assertPlannerPersistenceScope, shouldPersistPlannerArtifacts, type SearchPlannerContract } from './contract.js'

export interface PersistSearchContextObservabilityInput extends SearchPlannerContract {
  query_trace_id: string
  query: string
  stages: QueryTraceStage[]
  results: TypedContextResult[]
  fusion: Record<string, unknown>
  rerank: Record<string, unknown>
  runtime_truth: Record<string, unknown>
  freshness: Record<string, unknown>
  provenance: Record<string, unknown>
  graph_contributions: GraphContributionDetail[]
  context_pack?: ContextPack
}

export function persistSearchContextObservability(
  input: PersistSearchContextObservabilityInput,
  db: Db = getDb(),
): void {
  if (!shouldPersistPlannerArtifacts(input)) return
  assertPlannerPersistenceScope(input)

  persistRagQueryTrace({
    query_trace_id: input.query_trace_id,
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    query: input.query,
    stages: input.stages,
    fusion: input.fusion,
    rerank: input.rerank,
    runtime_truth: input.runtime_truth,
    freshness: input.freshness,
    provenance: input.provenance,
    graph_contributions: input.graph_contributions,
  }, db)

  persistRagContextResults({
    query_trace_id: input.query_trace_id,
    workspace_id: input.workspace_id,
    project_id: input.project_id,
    results: input.results,
  }, db)

  if (!input.context_pack) return
  db.prepare(`
    INSERT INTO context_packs (
      context_pack_id, query_trace_id, workspace_id, project_id,
      budget, source_diversity, results
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.context_pack.pack_id,
    input.context_pack.query_trace_id,
    input.workspace_id,
    input.project_id,
    JSON.stringify(input.context_pack.budget),
    JSON.stringify(input.context_pack.source_diversity),
    JSON.stringify(redactRoadmapArtifact(redactRagDetails(input.context_pack.results))),
  )
}
