// PR 20 Task 11.3 — Agent-adapter reducer for Kuzu graph.
//
// Writes AgentAdapter nodes on registerAgentAdapter() + EXECUTED_BY edges on
// start_agent_run. Adapter id: sha256({executor_uri}:{model}:{version})[:32]
// per architecture decision §12.28.
//
// HIGH-7: the prior version wrote `adapter_id/provider/display_name` columns
// that do not exist in the AgentAdapter Kuzu schema. The CREATE threw and
// the try/catch swallowed it silently so no graph edges ever landed. Fixed:
// column list matches `packages/memory/src/kuzu/schema.ts` AgentAdapter
// definition (id, workspace_id, project_id, executor_uri, model, version,
// created_at); EXECUTED_BY MATCHes AgentRun by `id` not `run_id`.

import { createHash } from 'node:crypto'
import type { KuzuClient } from 'fulcrum-memory'

export interface AgentAdapterInput {
  executor_uri: string
  model: string
  version: string
  workspace_id: string
  project_id?: string
}

/** Compute deterministic 32-char adapter ID from executor_uri + model + version. */
export function computeAdapterId(executorUri: string, model: string, version: string): string {
  return createHash('sha256')
    .update(`${executorUri}:${model}:${version}`)
    .digest('hex')
    .slice(0, 32)
}

/**
 * MERGE an AgentAdapter node for this (executor_uri, model, version) tuple.
 * Idempotent on re-invocation thanks to MERGE semantics.
 */
export async function reduceAgentAdapter(
  client: KuzuClient,
  input: AgentAdapterInput,
): Promise<void> {
  if (!client.isReady) return

  const adapterId = computeAdapterId(input.executor_uri, input.model, input.version)
  await client.query(
    `MERGE (a:AgentAdapter {id: $id})
     ON CREATE SET
       a.workspace_id = $workspace_id,
       a.project_id = $project_id,
       a.executor_uri = $executor_uri,
       a.model = $model,
       a.version = $version,
       a.created_at = $created_at`,
    {
      id: adapterId,
      workspace_id: input.workspace_id,
      project_id: input.project_id ?? '',
      executor_uri: input.executor_uri,
      model: input.model,
      version: input.version,
      created_at: new Date().toISOString(),
    },
  )
}

/** Write an EXECUTED_BY edge from an AgentRun to an AgentAdapter (idempotent). */
export async function reduceExecutedBy(
  client: KuzuClient,
  runId: string,
  adapterId: string,
): Promise<void> {
  if (!client.isReady) return
  // Create the edge only when it doesn't already exist — prevents duplicate edges on retry.
  await client.query(
    `MATCH (r:AgentRun {id: $run_id}), (a:AgentAdapter {id: $adapter_id})
     OPTIONAL MATCH (r)-[e:EXECUTED_BY]->(a)
     WITH r, a, e
     WHERE e IS NULL
     CREATE (r)-[:EXECUTED_BY]->(a)`,
    { run_id: runId, adapter_id: adapterId },
  )
}
