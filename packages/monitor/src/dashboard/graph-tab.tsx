// PR 19 Task 10.4 — Graph tab for the Fulcrum monitor dashboard.
//
// Force-directed graph view of the current project's Kuzu knowledge graph.
// Hits GET /graph/neighborhood/<node-id>?depth=2 for visualization data.
// Route: http://127.0.0.1:4721/#graph

import React, { useEffect, useState, useCallback } from 'react'

interface GraphNode {
  id: string
  label: string
  kind: string
}

interface GraphEdge {
  source: string
  target: string
  type: string
}

interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

interface GraphTabProps {
  baseUrl?: string
  workspaceId?: string
  seedNodeId?: string
}

export function GraphTab({ baseUrl = '', seedNodeId }: GraphTabProps) {
  const [data, setData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')

  const fetchNeighborhood = useCallback(async (nodeId: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${baseUrl}/graph/neighborhood/${encodeURIComponent(nodeId)}?depth=2`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json() as GraphData
      setData(json)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [baseUrl])

  useEffect(() => {
    if (seedNodeId) fetchNeighborhood(seedNodeId)
  }, [seedNodeId, fetchNeighborhood])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) fetchNeighborhood(query.trim())
  }

  return (
    <div className="graph-tab" data-testid="graph-tab">
      <h2>Knowledge Graph</h2>

      <form onSubmit={handleSearch} className="graph-search">
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Node ID or name (e.g. mem_001, src/auth.ts)"
          aria-label="Graph seed node"
        />
        <button type="submit">Explore</button>
      </form>

      {loading && <p aria-live="polite">Loading graph...</p>}
      {error && <p role="alert" style={{ color: 'red' }}>Error: {error}</p>}

      {data && (
        <div className="graph-stats">
          <span data-testid="node-count">{data.nodes.length} nodes</span>
          {' · '}
          <span data-testid="edge-count">{data.edges.length} edges</span>
        </div>
      )}

      {/* Force-directed rendering placeholder.
          Production implementation: use a canvas/WebGL lib (e.g. sigma.js, vis-network).
          The data contract (nodes[] + edges[]) is stable. */}
      <div
        id="graph-canvas"
        data-testid="graph-canvas"
        style={{ width: '100%', height: '600px', border: '1px solid #ddd', borderRadius: 4 }}
        aria-label="Graph visualization"
      >
        {data && data.nodes.length === 0 && (
          <p style={{ padding: 16, color: '#888' }}>
            No graph data found. Try seeding memories or indexing your project.
          </p>
        )}
        {!data && !loading && (
          <p style={{ padding: 16, color: '#888' }}>
            Enter a node ID above to explore the knowledge graph.
          </p>
        )}
      </div>
    </div>
  )
}

export default GraphTab
