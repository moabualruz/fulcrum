// packages/monitor/src/agent-card.ts
// Build an aggregate A2A Agent Card for the Fulcrum monitor server.
// Spec: https://google.github.io/A2A/specification/#agent-card
//
// Delegates per-definition card building to buildA2ACard() in @fulcrum/core
// so both call-sites produce spec-compliant cards from a single builder.

import { getDb, listAgentDefinitions, buildA2ACard, A2A_PROTOCOL_VERSION, Db} from '@fulcrum/core'
import type { A2ASkill } from '@fulcrum/core'

/**
 * Build a Fulcrum-level A2A Agent Card aggregating all registered agent
 * definitions as skills. Served at GET /.well-known/agent.json.
 */
export function buildAgentCard(options: {
  baseUrl: string
  workspace_id?: string
}): Record<string, unknown> {
  const db: Db = getDb()
  const defs = listAgentDefinitions(undefined, options.workspace_id ?? 'default', db)

  // Collect skills from per-definition cards so each skill is spec-compliant
  // (proper MIME types, examples, tags from CAPABILITY_SKILL_MAP).
  const skills: A2ASkill[] = defs.flatMap(def => {
    const card = buildA2ACard(def, `${options.baseUrl}/agents/${def.role}`)
    return card.skills
  })

  return {
    protocolVersion: A2A_PROTOCOL_VERSION,
    name: 'Fulcrum',
    description: 'Local-first AI agent OS with policy enforcement and team orchestration',
    url: options.baseUrl,
    version: '1.0.0',
    capabilities: {
      streaming: false,
      pushNotifications: false,
    },
    defaultInputModes: ['text/plain', 'application/json'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills,
    authentication: {
      schemes: ['Bearer'],
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'opaque' },
      },
    },
    provider: {
      organization: 'fulcrum',
      url: options.baseUrl,
    },
  }
}
