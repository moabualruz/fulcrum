import { getDb , Db} from './db/client.js'
import { newId } from './ids.js'
import { FulcrumError } from './types.js'
import type { Workspace, WorkspaceStatus } from './types.js'

export interface CreateWorkspaceInput {
  name: string
  workspace_id?: string
}

export interface UpdateWorkspaceInput {
  workspace_id: string
  name?: string
  status?: WorkspaceStatus
}

function rowToWorkspace(row: Record<string, unknown>): Workspace {
  return {
    workspace_id: row['workspace_id'] as string,
    name: row['name'] as string,
    status: ((row['status'] as string) || 'active') as WorkspaceStatus,
    config_path: (row['config_path'] as string | undefined) ?? undefined,
    created_at: row['created_at'] as string,
  }
}

export async function createWorkspace(input: CreateWorkspaceInput, db: Db = getDb()): Promise<Workspace> {
  if (!input.name || !input.name.trim()) {
    throw new FulcrumError('name must not be empty', 'invalid_input')
  }
  const workspace_id = input.workspace_id ?? newId('workspace')
  const now = new Date().toISOString()
  db.prepare(
    `INSERT OR IGNORE INTO workspaces (workspace_id, name, status, created_at)
     VALUES (?, ?, 'active', ?)`
  ).run(workspace_id, input.name, now)
  const row = db
    .prepare(`SELECT * FROM workspaces WHERE workspace_id = ?`)
    .get(workspace_id) as Record<string, unknown> | undefined
  if (!row) {
    throw new FulcrumError(`workspace ${workspace_id} not found after insert`, 'not_found')
  }
  return rowToWorkspace(row)
}

export async function getWorkspace(workspace_id: string, db: Db = getDb()): Promise<Workspace | null> {
  const row = db
    .prepare(`SELECT * FROM workspaces WHERE workspace_id = ?`)
    .get(workspace_id) as Record<string, unknown> | undefined
  return row ? rowToWorkspace(row) : null
}

export async function listWorkspaces(db: Db = getDb()): Promise<Workspace[]> {
  const rows = db
    .prepare(`SELECT * FROM workspaces ORDER BY created_at DESC, workspace_id DESC LIMIT 500`)
    .all() as Record<string, unknown>[]
  return rows.map(rowToWorkspace)
}

export async function updateWorkspace(input: UpdateWorkspaceInput, db: Db = getDb()): Promise<Workspace> {
  const existing = await getWorkspace(input.workspace_id, db)
  if (!existing) {
    throw new FulcrumError(`workspace not found: ${input.workspace_id}`, 'not_found')
  }
  const fields: string[] = []
  const values: unknown[] = []
  if (input.name !== undefined) {
    if (!input.name.trim()) throw new FulcrumError('name must not be empty', 'invalid_input')
    fields.push('name = ?')
    values.push(input.name)
  }
  if (input.status !== undefined) {
    fields.push('status = ?')
    values.push(input.status)
  }
  if (fields.length > 0) {
    values.push(input.workspace_id)
    db.prepare(`UPDATE workspaces SET ${fields.join(', ')} WHERE workspace_id = ?`)
      .run(...values)
  }
  const updated = await getWorkspace(input.workspace_id, db)
  if (!updated) {
    throw new FulcrumError(`workspace not found after update: ${input.workspace_id}`, 'not_found')
  }
  return updated
}
