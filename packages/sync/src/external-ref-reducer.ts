// PR 20 Task 11.2 — External sync reducer for Kuzu graph.
//
// Writes external_ref nodes + shadow_of edges from sync_states / sync_conflicts rows.
// Plane + GitHub: webhook adapters (real-time).
// Jira: 5-min poll cadence per architecture decision §12.27.

import type { KuzuClient } from '@moabualruz/fulcrum-memory'

export const ADAPTER_PLANE = 'plane'
export const ADAPTER_GITHUB = 'github'
export const ADAPTER_JIRA = 'jira'

export type ExternalAdapter = typeof ADAPTER_PLANE | typeof ADAPTER_GITHUB | typeof ADAPTER_JIRA | string

export interface ExternalRefInput {
  adapter: ExternalAdapter
  external_id: string
  title: string
  url: string
  workspace_id: string
  fulcrum_task_id?: string
  status?: string
  labels?: string[]
}

export async function reduceExternalRef(
  client: KuzuClient,
  input: ExternalRefInput
): Promise<void> {
  if (!client.isReady) return

  try {
    // Upsert external_ref node
    await client.query(
      `CREATE (e:ExternalRef {
        adapter: $adapter,
        external_id: $external_id,
        title: $title,
        url: $url,
        workspace_id: $workspace_id,
        status: $status
      })`,
      {
        adapter: input.adapter,
        external_id: input.external_id,
        title: input.title.slice(0, 500),
        url: input.url,
        workspace_id: input.workspace_id,
        status: input.status ?? 'open',
      }
    )

    // shadow_of edge from external_ref → fulcrum task (if known)
    if (input.fulcrum_task_id) {
      await client.query(
        `MATCH (e:ExternalRef {external_id: $external_id, adapter: $adapter}),
               (t:Task {task_id: $task_id})
         CREATE (e)-[:SHADOW_OF]->(t)`,
        {
          external_id: input.external_id,
          adapter: input.adapter,
          task_id: input.fulcrum_task_id,
        }
      ).catch(() => { /* task node may not be in graph yet — best effort */ })
    }
  } catch { /* no-op — reducer errors never block ingest */ }
}
