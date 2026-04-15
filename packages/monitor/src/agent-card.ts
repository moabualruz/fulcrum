// packages/monitor/src/agent-card.ts
// Build an aggregate A2A Agent Card for the Fulcrum monitor server.
// Spec: https://google.github.io/A2A/specification/#agent-card

import { getDb, listAgentDefinitions } from '@fulcrum/core'

/**
 * Build a Fulcrum-level A2A Agent Card aggregating all registered agent
 * definitions as skills. Served at GET /.well-known/agent.json.
 */
export function buildAgentCard(options: {
  baseUrl: string
  workspace_id?: string
}): Record<string, unknown> {
  const db = getDb()
  const defs = listAgentDefinitions(undefined, options.workspace_id ?? 'default', db)

  const skills = defs.map(def => ({
    id: def.role,
    name: def.display_name,
    description: def.description,
    inputModes: ['text'],
    outputModes: ['text'],
    ...(def.capabilities?.length ? { tags: def.capabilities } : {}),
  }))

  return {
    name: 'Fulcrum',
    description: 'Local-first AI agent OS with policy enforcement and team orchestration',
    url: options.baseUrl,
    version: '1.0.0',
    capabilities: {
      streaming: false,
      pushNotifications: false,
    },
    skills,
    authentication: {
      schemes: ['Bearer'],
    },
    provider: {
      organization: 'fulcrum',
      url: options.baseUrl,
    },
  }
}
