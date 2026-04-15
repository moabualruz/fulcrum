// packages/core/src/agent-profiles.ts
// Dynamic agent profiles — workspace-scoped rows that extend the 24 canonical
// AgentRole values. Created at runtime by authorized callers (typically
// chief_of_staff via the mcp__fulcrum__create_agent_profile tool) so that
// custom specializations can be composed into team templates without
// requiring a code change.

import { getDb , Db} from './db/client.js'
import { newId } from './ids.js'
import { FulcrumError } from './types.js'
import type {
  AgentProfileRow,
  CreateAgentProfileInput,
  UpdateAgentProfileInput,
  AgentRole,
} from './types.js'

const VALID_BASE_ROLES: readonly AgentRole[] = [
  'chief_of_staff', 'context_gatherer', 'prd_planner', 'implementation_planner',
  'issue_decomposer', 'software_engineer', 'research_worker', 'refactor_worker',
  'browser_worker', 'data_engineer', 'ml_engineer', 'devops_engineer',
  'architecture_reviewer', 'code_reviewer', 'qa_engineer', 'security_reviewer',
  'integration_worker', 'documentation_writer', 'memory_curator', 'tech_lead',
  'product_manager', 'analyst', 'orchestrator', 'custom',
]

function rowToProfile(row: Record<string, unknown>): AgentProfileRow {
  let capabilities: Record<string, unknown> = {}
  const capsRaw = row['capabilities'] as string | null
  if (capsRaw) {
    try {
      capabilities = JSON.parse(capsRaw) as Record<string, unknown>
    } catch {
      /* keep empty */
    }
  }
  return {
    profile_id: row['profile_id'] as string,
    workspace_id: row['workspace_id'] as string,
    name: row['name'] as string,
    base_role: row['base_role'] as AgentRole,
    description: row['description'] as string,
    system_prompt: (row['system_prompt'] as string | null) ?? null,
    capabilities,
    created_by: (row['created_by'] as string | null) ?? null,
    created_at: row['created_at'] as string,
  }
}

export async function createAgentProfile(input: CreateAgentProfileInput, db: Db = getDb()): Promise<AgentProfileRow> {
  if (!input.name || !input.name.trim()) {
    throw new FulcrumError('agent profile name must not be empty', 'invalid_input')
  }
  if (!input.description || !input.description.trim()) {
    throw new FulcrumError('agent profile description must not be empty', 'invalid_input')
  }
  const base_role: AgentRole = input.base_role ?? 'custom'
  if (!VALID_BASE_ROLES.includes(base_role)) {
    throw new FulcrumError(`invalid base_role: ${base_role}`, 'invalid_input')
  }
  const profile_id = input.profile_id ?? newId('agent_profile')
  const now = new Date().toISOString()
  try {
    db.prepare(
      `INSERT INTO agent_profiles
        (profile_id, workspace_id, name, base_role, description,
         system_prompt, capabilities, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      profile_id,
      input.workspace_id,
      input.name,
      base_role,
      input.description,
      input.system_prompt ?? null,
      JSON.stringify(input.capabilities ?? {}),
      input.created_by ?? null,
      now,
    )
  } catch (err) {
    const msg = (err as Error).message
    if (msg.includes('UNIQUE') || msg.includes('unique')) {
      throw new FulcrumError(
        `agent profile "${input.name}" already exists in workspace`,
        'invalid_input',
      )
    }
    throw err
  }
  return (await getAgentProfile(profile_id, db))!
}

export async function getAgentProfile(profile_id: string, db: Db = getDb()): Promise<AgentProfileRow | null> {
  const row = db
    .prepare(`SELECT * FROM agent_profiles WHERE profile_id = ?`)
    .get(profile_id) as Record<string, unknown> | undefined
  return row ? rowToProfile(row) : null
}

export async function listAgentProfileRows(workspace_id?: string, db: Db = getDb()): Promise<AgentProfileRow[]> {
  const rows = workspace_id
    ? (db
        .prepare(`SELECT * FROM agent_profiles WHERE workspace_id = ? ORDER BY created_at DESC`)
        .all(workspace_id) as Record<string, unknown>[])
    : (db
        .prepare(`SELECT * FROM agent_profiles ORDER BY created_at DESC`)
        .all() as Record<string, unknown>[])
  return rows.map(rowToProfile)
}

export async function updateAgentProfile(input: UpdateAgentProfileInput, db: Db = getDb()): Promise<AgentProfileRow> {
  const existing = await getAgentProfile(input.profile_id, db)
  if (!existing) {
    throw new FulcrumError(`agent profile not found: ${input.profile_id}`, 'not_found')
  }

  const fields: string[] = []
  const values: unknown[] = []
  if (input.name !== undefined) {
    if (!input.name.trim()) {
      throw new FulcrumError('name must not be empty', 'invalid_input')
    }
    fields.push('name = ?')
    values.push(input.name)
  }
  if (input.description !== undefined) {
    if (!input.description.trim()) {
      throw new FulcrumError('description must not be empty', 'invalid_input')
    }
    fields.push('description = ?')
    values.push(input.description)
  }
  if (input.base_role !== undefined) {
    if (!VALID_BASE_ROLES.includes(input.base_role)) {
      throw new FulcrumError(`invalid base_role: ${input.base_role}`, 'invalid_input')
    }
    fields.push('base_role = ?')
    values.push(input.base_role)
  }
  if (input.system_prompt !== undefined) {
    fields.push('system_prompt = ?')
    values.push(input.system_prompt)
  }
  if (input.capabilities !== undefined) {
    fields.push('capabilities = ?')
    values.push(JSON.stringify(input.capabilities))
  }
  if (fields.length > 0) {
    values.push(input.profile_id)
    db.prepare(`UPDATE agent_profiles SET ${fields.join(', ')} WHERE profile_id = ?`)
      .run(...values)
  }
  return (await getAgentProfile(input.profile_id, db))!
}

export async function deleteAgentProfile(profile_id: string, db: Db = getDb()): Promise<void> {
  db.prepare(`DELETE FROM agent_profiles WHERE profile_id = ?`).run(profile_id)
}
