// packages/memory/src/graph-types.ts

export interface GraphEntity {
  entity_id: string
  workspace_id: string
  name: string
  entity_type: string
  properties: Record<string, unknown>
  valid_from?: string
  valid_until?: string
  created_at: string
  updated_at: string
}

export interface GraphEdge {
  edge_id: string
  workspace_id: string
  source_id: string
  target_id: string
  relation: string
  weight: number
  properties: Record<string, unknown>
  valid_from?: string
  valid_until?: string
  created_at: string
}

export interface GraphEpisode {
  episode_id: string
  workspace_id: string
  entity_id: string
  content: string
  episode_type: string
  valid_from?: string
  valid_until?: string
  created_at: string
}

export interface AddEntityInput {
  workspace_id: string
  name: string
  entity_type: string
  properties?: Record<string, unknown>
  valid_from?: string
  valid_until?: string
}

export interface AddEdgeInput {
  workspace_id: string
  source_id: string
  target_id: string
  relation: string
  weight?: number
  properties?: Record<string, unknown>
  valid_from?: string
  valid_until?: string
}

export interface AddEpisodeInput {
  workspace_id: string
  entity_id: string
  content: string
  episode_type?: string
  valid_from?: string
  valid_until?: string
}

export interface GetNeighborsInput {
  workspace_id: string
  entity_id: string
  relation?: string
  direction?: 'outbound' | 'inbound' | 'both'
  at?: string  // ISO timestamp — filter by temporal validity
}

export interface SearchEntitiesInput {
  workspace_id: string
  query: string
  entity_type?: string
  at?: string  // ISO timestamp — filter by temporal validity
  limit?: number
}
