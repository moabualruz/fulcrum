// PR 19 Task 10.3 — GET /a2a/cards/<role> + GET /a2a/cards endpoints.
//
// Returns Google A2A AgentCard JSON derived from agent_definitions row at request
// time (not cached) per Part 02 §"A2A agent cards" lines 246-254.

import type { Db } from 'fulcrum-core'
import { getDb, getAgentDefinition, listAgentDefinitions, buildA2ACard } from 'fulcrum-core'

export type A2ACardResult =
  | { body: Record<string, unknown> }
  | { error: string; status: number }

export type A2ACardListResult =
  | { body: unknown[] }
  | { error: string; status: number }

/** GET /a2a/cards/:role — returns A2A AgentCard for a single role. */
export function handleA2ACard(
  role: string,
  db: Db = getDb(),
  baseUrl = 'http://127.0.0.1:4721'
): A2ACardResult {
  const def = getAgentDefinition(role, undefined, db)
  if (!def) {
    return { error: `No agent definition found for role: ${role}`, status: 404 }
  }
  const card = buildA2ACard(def, `${baseUrl}/agents/${role}`)
  return { body: card as unknown as Record<string, unknown> }
}

/** GET /a2a/cards — returns array of A2A AgentCards for all registered definitions. */
export function handleA2ACardList(
  db: Db = getDb(),
  baseUrl = 'http://127.0.0.1:4721'
): A2ACardListResult {
  const defs = listAgentDefinitions(undefined, undefined, db)
  const cards = defs.map(def => buildA2ACard(def, `${baseUrl}/agents/${def.role}`))
  return { body: cards }
}
