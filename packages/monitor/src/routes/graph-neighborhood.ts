// PR 19 Task 10.4 — GET /graph/neighborhood/<node-id>?depth= endpoint.
//
// Returns neighborhood subgraph for force-directed visualization.
// Depth capped at 3 to prevent graph explosion.

import { getKuzuClient } from '@moabualruz/fulcrum-memory'

const MAX_DEPTH = 3

export interface GraphNode {
  id: string
  label: string
  kind: string
  properties?: Record<string, unknown>
}

export interface GraphEdge {
  source: string
  target: string
  type: string
}

export interface NeighborhoodResult {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export type GraphNeighborhoodResponse =
  | { body: NeighborhoodResult }
  | { error: string; status: number }

export async function handleGraphNeighborhood(
  nodeId: string | undefined,
  depth = 2
): Promise<GraphNeighborhoodResponse> {
  if (!nodeId) {
    return { error: 'Missing node-id parameter', status: 400 }
  }

  const safeDepth = Math.min(Math.max(1, depth), MAX_DEPTH)
  const kuzuClient = getKuzuClient()

  if (!kuzuClient?.isReady) {
    // Graceful degradation: Kuzu not ready
    return { body: { nodes: [], edges: [] } }
  }

  try {
    const rows = await kuzuClient.query<Record<string, unknown>>(
      `MATCH path = (n)-[*1..${safeDepth}]-(neighbor)
       WHERE n.id = $nodeId OR n.name = $nodeId OR n.memory_id = $nodeId
       RETURN n, neighbor, relationships(path) AS rels
       LIMIT 100`,
      { nodeId }
    )

    const nodes = new Map<string, GraphNode>()
    const edges: GraphEdge[] = []

    for (const row of rows) {
      const n = row['n'] as Record<string, unknown> | undefined
      const neighbor = row['neighbor'] as Record<string, unknown> | undefined
      const rels = row['rels'] as unknown[] | undefined

      if (n) {
        const id = String(n['id'] ?? n['name'] ?? n['memory_id'] ?? 'unknown')
        if (!nodes.has(id)) {
          nodes.set(id, { id, label: String(n['title'] ?? n['name'] ?? id), kind: 'unknown', properties: n })
        }
      }
      if (neighbor) {
        const id = String(neighbor['id'] ?? neighbor['name'] ?? neighbor['memory_id'] ?? 'unknown')
        if (!nodes.has(id)) {
          nodes.set(id, { id, label: String(neighbor['title'] ?? neighbor['name'] ?? id), kind: 'unknown', properties: neighbor })
        }
      }
      if (rels && Array.isArray(rels)) {
        for (const rel of rels) {
          const r = rel as Record<string, unknown>
          edges.push({
            source: String(r['_srcID'] ?? 'unknown'),
            target: String(r['_dstID'] ?? 'unknown'),
            type: String(r['_label'] ?? 'RELATED'),
          })
        }
      }
    }

    return { body: { nodes: Array.from(nodes.values()), edges } }
  } catch {
    return { body: { nodes: [], edges: [] } }
  }
}
