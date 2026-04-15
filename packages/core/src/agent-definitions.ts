// packages/core/src/agent-definitions.ts
// CRUD for the agent_definitions table (MIGRATION_031).
// Canonical per-role definitions: model, tools_allow/deny, executor_uri, A2A card.

import { getDb } from './db/client.js'
import { newId } from './ids.js'
import { FulcrumError } from './types.js'
import type { AgentDefinition, CreateAgentDefinitionInput, UpdateAgentDefinitionInput } from './types.js'

/**
 * MCP tool names must start with a letter or underscore and contain only
 * letters, digits, underscores, and hyphens. This matches the MCP spec §2.4.
 */
const TOOL_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_-]*$/

function validateToolNames(list: string[] | null | undefined, field: string): void {
  if (!list) return
  for (const name of list) {
    if (!TOOL_NAME_RE.test(name)) {
      throw new FulcrumError(
        `Invalid tool name '${name}' in ${field}: must match /^[a-zA-Z_][a-zA-Z0-9_-]*$/`,
        'invalid_input',
      )
    }
  }
}

function rowToDefinition(row: Record<string, unknown>): AgentDefinition {
  return {
    id: row.id as string,
    workspace_id: (row.workspace_id as string) ?? 'default',
    role: row.role as AgentDefinition['role'],
    display_name: row.display_name as string,
    description: row.description as string,
    version: row.version as string,
    stability: row.stability as AgentDefinition['stability'],
    system_prompt: (row.system_prompt as string | null) ?? null,
    model: (row.model as string | null) ?? null,
    provider: (row.provider as string) ?? 'anthropic',
    tools_allow: row.tools_allow ? (JSON.parse(row.tools_allow as string) as string[]) : null,
    tools_deny: row.tools_deny ? (JSON.parse(row.tools_deny as string) as string[]) : null,
    capabilities: row.capabilities ? (JSON.parse(row.capabilities as string) as string[]) : [],
    output_schema: row.output_schema ? (JSON.parse(row.output_schema as string) as Record<string, unknown>) : null,
    executor_uri: (row.executor_uri as string | null) ?? null,
    a2a_card: row.a2a_card ? (JSON.parse(row.a2a_card as string) as Record<string, unknown>) : null,
    eval_suites: row.eval_suites ? (JSON.parse(row.eval_suites as string) as string[]) : [],
    created_at: row.created_at as number,
    updated_at: row.updated_at as number,
  }
}

export function createAgentDefinition(input: CreateAgentDefinitionInput, db = getDb()): AgentDefinition {
  const workspace_id = input.workspace_id ?? 'default'
  const existing = db.prepare('SELECT id FROM agent_definitions WHERE workspace_id = ? AND role = ?').get(workspace_id, input.role)
  if (existing) {
    throw new FulcrumError(`Agent definition for role '${input.role}' already exists`, 'conflict')
  }
  validateToolNames(input.tools_allow, 'tools_allow')
  validateToolNames(input.tools_deny, 'tools_deny')
  const id = newId('agent_definition')
  const now = Math.floor(Date.now() / 1000)
  db.prepare(`
    INSERT INTO agent_definitions
      (id, workspace_id, role, display_name, description, version, stability, system_prompt, model, provider,
       tools_allow, tools_deny, capabilities, output_schema, executor_uri, a2a_card, eval_suites,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    workspace_id,
    input.role,
    input.display_name,
    input.description,
    input.version ?? '0.1.0',
    input.stability ?? 'experimental',
    input.system_prompt ?? null,
    input.model ?? null,
    input.provider ?? 'anthropic',
    input.tools_allow ? JSON.stringify(input.tools_allow) : null,
    input.tools_deny ? JSON.stringify(input.tools_deny) : null,
    JSON.stringify(input.capabilities ?? []),
    input.output_schema ? JSON.stringify(input.output_schema) : null,
    input.executor_uri ?? null,
    input.a2a_card ? JSON.stringify(input.a2a_card) : null,
    JSON.stringify(input.eval_suites ?? []),
    now,
    now,
  )
  const row = db.prepare('SELECT * FROM agent_definitions WHERE id = ?').get(id) as Record<string, unknown>
  return rowToDefinition(row)
}

export function getAgentDefinition(role: string, workspace_id = 'default', db = getDb()): AgentDefinition | null {
  const row = db.prepare('SELECT * FROM agent_definitions WHERE workspace_id = ? AND role = ?').get(workspace_id, role) as Record<string, unknown> | undefined
  return row ? rowToDefinition(row) : null
}

/** Increments the patch segment of a semver string (e.g. "0.1.0" → "0.1.1"). */
function bumpPatch(version: string): string {
  const parts = version.split('.')
  if (parts.length < 3) return version
  const patch = parseInt(parts[2], 10)
  return `${parts[0]}.${parts[1]}.${isNaN(patch) ? 1 : patch + 1}`
}

export function updateAgentDefinition(input: UpdateAgentDefinitionInput, db = getDb()): AgentDefinition {
  const workspace_id = input.workspace_id ?? 'default'
  const existing = db.prepare('SELECT * FROM agent_definitions WHERE workspace_id = ? AND role = ?').get(workspace_id, input.role) as Record<string, unknown> | undefined
  if (!existing) {
    throw new FulcrumError(`Agent definition for role '${input.role}' not found`, 'not_found')
  }
  const now = Math.floor(Date.now() / 1000)
  const updates: string[] = ['updated_at = ?']
  const params: unknown[] = [now]

  const setField = (col: string, value: unknown, serialize = false): void => {
    if (value === undefined) return
    updates.push(`${col} = ?`)
    params.push(serialize && value !== null ? JSON.stringify(value) : value)
  }

  // Auto-bump patch version when no explicit version is provided
  const resolvedVersion = input.version ?? bumpPatch(existing.version as string)
  setField('display_name', input.display_name)
  setField('description', input.description)
  setField('version', resolvedVersion)
  setField('stability', input.stability)
  setField('system_prompt', input.system_prompt)
  setField('model', input.model)
  setField('provider', input.provider)
  validateToolNames(input.tools_allow, 'tools_allow')
  validateToolNames(input.tools_deny, 'tools_deny')
  setField('tools_allow', input.tools_allow, true)
  setField('tools_deny', input.tools_deny, true)
  setField('capabilities', input.capabilities, true)
  setField('output_schema', input.output_schema, true)
  setField('executor_uri', input.executor_uri)
  setField('a2a_card', input.a2a_card, true)
  setField('eval_suites', input.eval_suites, true)

  params.push(workspace_id, input.role)
  db.prepare(`UPDATE agent_definitions SET ${updates.join(', ')} WHERE workspace_id = ? AND role = ?`).run(...params)
  const row = db.prepare('SELECT * FROM agent_definitions WHERE workspace_id = ? AND role = ?').get(workspace_id, input.role) as Record<string, unknown>
  return rowToDefinition(row)
}

export function listAgentDefinitions(stability?: AgentDefinition['stability'], workspace_id = 'default', db = getDb()): AgentDefinition[] {
  const rows = stability
    ? (db.prepare('SELECT * FROM agent_definitions WHERE workspace_id = ? AND stability = ? ORDER BY role').all(workspace_id, stability) as Record<string, unknown>[])
    : (db.prepare('SELECT * FROM agent_definitions WHERE workspace_id = ? ORDER BY role').all(workspace_id) as Record<string, unknown>[])
  return rows.map(rowToDefinition)
}
