import { getDb } from './db/client.js'
import { newId } from './ids.js'
import { FulcrumError, type ProjectStatus, type ProjectType, type WriteMode } from './types.js'

export interface Project {
  project_id: string
  workspace_id: string
  name: string
  description: string | null
  type: ProjectType
  status: ProjectStatus
  write_mode: WriteMode
  git_url: string | null
  parent_project_id: string | null
  created_at: string
}

export interface CreateProjectInput {
  workspace_id: string
  name: string
  description?: string | null
  project_id?: string
  type?: ProjectType
  status?: ProjectStatus
  write_mode?: WriteMode
  git_url?: string
  parent_project_id?: string
}

export interface UpdateProjectInput {
  project_id: string
  name?: string
  description?: string | null
  type?: ProjectType
  status?: ProjectStatus
  write_mode?: WriteMode
  git_url?: string | null
  parent_project_id?: string | null
}

export interface ListProjectsInput {
  workspace_id?: string
  limit?: number
}

const VALID_TYPES: ProjectType[] = ['git', 'non_git', 'submodule', 'logical']
const VALID_STATUSES: ProjectStatus[] = ['active', 'archived', 'paused']
const VALID_WRITE_MODES: WriteMode[] = ['worktree', 'in_place', 'sequential']

function rowToProject(row: Record<string, unknown>): Project {
  return {
    project_id: row['project_id'] as string,
    workspace_id: row['workspace_id'] as string,
    name: row['name'] as string,
    description: (row['description'] as string) ?? null,
    type: row['type'] as ProjectType,
    status: row['status'] as ProjectStatus,
    write_mode: row['write_mode'] as WriteMode,
    git_url: (row['git_url'] as string) ?? null,
    parent_project_id: (row['parent_project_id'] as string) ?? null,
    created_at: row['created_at'] as string,
  }
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  if (!input.name || !input.name.trim()) {
    throw new FulcrumError('name must not be empty', 'invalid_input')
  }
  const type: ProjectType = input.type ?? 'git'
  const status: ProjectStatus = input.status ?? 'active'
  const write_mode: WriteMode = input.write_mode ?? 'worktree'
  if (!VALID_TYPES.includes(type)) {
    throw new FulcrumError(`invalid type: ${type}`, 'invalid_input')
  }
  if (!VALID_STATUSES.includes(status)) {
    throw new FulcrumError(`invalid status: ${status}`, 'invalid_input')
  }
  if (!VALID_WRITE_MODES.includes(write_mode)) {
    throw new FulcrumError(`invalid write_mode: ${write_mode}`, 'invalid_input')
  }

  const db = getDb()
  const project_id = input.project_id ?? newId('project')
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO projects (project_id, workspace_id, name, description, type, status, write_mode, git_url, parent_project_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    project_id,
    input.workspace_id,
    input.name,
    input.description ?? null,
    type,
    status,
    write_mode,
    input.git_url ?? null,
    input.parent_project_id ?? null,
    now,
  )
  const row = db
    .prepare(`SELECT * FROM projects WHERE project_id = ?`)
    .get(project_id) as Record<string, unknown> | undefined
  if (!row) {
    throw new FulcrumError(`project ${project_id} not found after insert`, 'not_found')
  }
  return rowToProject(row)
}

export async function getProject(project_id: string): Promise<Project | null> {
  const db = getDb()
  const row = db
    .prepare(`SELECT * FROM projects WHERE project_id = ?`)
    .get(project_id) as Record<string, unknown> | undefined
  return row ? rowToProject(row) : null
}

export async function listProjects(input: ListProjectsInput = {}): Promise<Project[]> {
  const db = getDb()
  const limit = input.limit ?? 200
  const rows = input.workspace_id
    ? (db
        .prepare(
          `SELECT * FROM projects WHERE workspace_id = ? ORDER BY created_at DESC, project_id DESC LIMIT ?`
        )
        .all(input.workspace_id, limit) as Record<string, unknown>[])
    : (db
        .prepare(`SELECT * FROM projects ORDER BY created_at DESC, project_id DESC LIMIT ?`)
        .all(limit) as Record<string, unknown>[])
  return rows.map(rowToProject)
}

export async function updateProject(input: UpdateProjectInput): Promise<Project> {
  const existing = await getProject(input.project_id)
  if (!existing) {
    throw new FulcrumError(`project not found: ${input.project_id}`, 'not_found')
  }
  const fields: string[] = []
  const values: unknown[] = []
  if (input.name !== undefined) {
    if (!input.name.trim()) throw new FulcrumError('name must not be empty', 'invalid_input')
    fields.push('name = ?')
    values.push(input.name)
  }
  if (input.description !== undefined) {
    fields.push('description = ?')
    values.push(input.description)
  }
  if (input.type !== undefined) {
    if (!VALID_TYPES.includes(input.type)) {
      throw new FulcrumError(`invalid type: ${input.type}`, 'invalid_input')
    }
    fields.push('type = ?')
    values.push(input.type)
  }
  if (input.status !== undefined) {
    if (!VALID_STATUSES.includes(input.status)) {
      throw new FulcrumError(`invalid status: ${input.status}`, 'invalid_input')
    }
    fields.push('status = ?')
    values.push(input.status)
  }
  if (input.write_mode !== undefined) {
    if (!VALID_WRITE_MODES.includes(input.write_mode)) {
      throw new FulcrumError(`invalid write_mode: ${input.write_mode}`, 'invalid_input')
    }
    fields.push('write_mode = ?')
    values.push(input.write_mode)
  }
  if (input.git_url !== undefined) {
    fields.push('git_url = ?')
    values.push(input.git_url)
  }
  if (input.parent_project_id !== undefined) {
    fields.push('parent_project_id = ?')
    values.push(input.parent_project_id)
  }
  if (fields.length > 0) {
    values.push(input.project_id)
    getDb()
      .prepare(`UPDATE projects SET ${fields.join(', ')} WHERE project_id = ?`)
      .run(...values)
  }
  const updated = await getProject(input.project_id)
  if (!updated) {
    throw new FulcrumError(`project not found after update: ${input.project_id}`, 'not_found')
  }
  return updated
}
