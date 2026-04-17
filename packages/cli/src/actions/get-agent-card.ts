// PR 20 Task 11.4 — A2A agent_card derivation actions.
//
// Renders Google A2A AgentCard JSON from agent_definitions row at query time
// per Part 02 §"A2A agent cards".

import type { Db } from '@moabualruz/fulcrum-core'
import { getDb, getAgentDefinition, listAgentDefinitions, buildA2ACard } from '@moabualruz/fulcrum-core'

const BASE_URL = process.env['FULCRUM_BASE_URL'] ?? 'http://127.0.0.1:4721'

export function getAgentCard(role: string, db: Db = getDb()): Record<string, unknown> | null {
  const def = getAgentDefinition(role, undefined, db)
  if (!def) return null
  return buildA2ACard(def, `${BASE_URL}/agents/${role}`) as Record<string, unknown>
}

export function listAgentCards(db: Db = getDb()): Record<string, unknown>[] {
  const defs = listAgentDefinitions(undefined, undefined, db)
  return defs.map(def => buildA2ACard(def, `${BASE_URL}/agents/${def.role}`) as Record<string, unknown>)
}
