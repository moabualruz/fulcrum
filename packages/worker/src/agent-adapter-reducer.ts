// PR 20 Task 11.3 — Agent-adapter reducer for Kuzu graph.
//
// Writes agent_adapter nodes on registerAgentAdapter() + executed_by edges on start_agent_run.
// Adapter ID: sha256({executor_uri}:{model}:{version})[:32] per architecture decision §12.28.

import { createHash } from 'node:crypto'
import type { KuzuClient } from 'fulcrum-memory'

export interface AgentAdapterInput {
  executor_uri: string
  model: string
  version: string
  workspace_id: string
  provider?: string
  display_name?: string
}

/** Compute deterministic 32-char adapter ID from executor_uri + model + version. */
export function computeAdapterId(executorUri: string, model: string, version: string): string {
  return createHash('sha256')
    .update(`${executorUri}:${model}:${version}`)
    .digest('hex')
    .slice(0, 32)
}

export async function reduceAgentAdapter(
  client: KuzuClient,
  input: AgentAdapterInput
): Promise<void> {
  if (!client.isReady) return

  const adapterId = computeAdapterId(input.executor_uri, input.model, input.version)

  try {
    await client.query(
      `CREATE (a:AgentAdapter {
        adapter_id: $adapter_id,
        executor_uri: $executor_uri,
        model: $model,
        version: $version,
        provider: $provider,
        display_name: $display_name,
        workspace_id: $workspace_id
      })`,
      {
        adapter_id: adapterId,
        executor_uri: input.executor_uri,
        model: input.model,
        version: input.version,
        provider: input.provider ?? 'anthropic',
        display_name: input.display_name ?? `${input.model}@${input.version}`,
        workspace_id: input.workspace_id,
      }
    )
  } catch { /* no-op — reducer errors never block */ }
}

/** Write executed_by edge from agent_run to agent_adapter. */
export async function reduceExecutedBy(
  client: KuzuClient,
  runId: string,
  adapterId: string
): Promise<void> {
  if (!client.isReady) return
  try {
    await client.query(
      `MATCH (r:AgentRun {run_id: $run_id}), (a:AgentAdapter {adapter_id: $adapter_id})
       CREATE (r)-[:EXECUTED_BY]->(a)`,
      { run_id: runId, adapter_id: adapterId }
    )
  } catch { /* best effort */ }
}
