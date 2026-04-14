import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { createWorkspace } from '../workspaces.js'
import { createProject, getProject, listProjects, updateProject } from '../projects.js'
import { FulcrumError } from '../types.js'

describe('projects CRUD (G-1, G-2)', () => {
  beforeEach(async () => {
    createTestDb()
    await createWorkspace({ workspace_id: 'ws_1', name: 'w' })
  })
  afterEach(() => resetTestDb())

  it('createProject defaults type=git, status=active, write_mode=worktree', async () => {
    const p = await createProject({ workspace_id: 'ws_1', name: 'alpha' })
    expect(p.project_id).toMatch(/^proj_/)
    expect(p.type).toBe('git')
    expect(p.status).toBe('active')
    expect(p.write_mode).toBe('worktree')
    expect(p.git_url).toBeNull()
    expect(p.parent_project_id).toBeNull()
  })

  it('accepts non_git/submodule/logical types', async () => {
    const p = await createProject({ workspace_id: 'ws_1', name: 'logical', type: 'logical' })
    expect(p.type).toBe('logical')
    const q = await createProject({ workspace_id: 'ws_1', name: 'sm', type: 'submodule' })
    expect(q.type).toBe('submodule')
  })

  it('rejects invalid type with FulcrumError (not raw sqlite)', async () => {
    await expect(
      createProject({ workspace_id: 'ws_1', name: 'bad', type: 'nope' as any })
    ).rejects.toThrow(FulcrumError)
  })

  it('rejects invalid status with FulcrumError', async () => {
    await expect(
      createProject({ workspace_id: 'ws_1', name: 'bad', status: 'nope' as any })
    ).rejects.toThrow(FulcrumError)
  })

  it('rejects invalid write_mode with FulcrumError', async () => {
    await expect(
      createProject({ workspace_id: 'ws_1', name: 'bad', write_mode: 'nope' as any })
    ).rejects.toThrow(FulcrumError)
  })

  it('rejects empty name', async () => {
    await expect(createProject({ workspace_id: 'ws_1', name: '' })).rejects.toThrow(FulcrumError)
    await expect(createProject({ workspace_id: 'ws_1', name: '   ' })).rejects.toThrow(FulcrumError)
  })

  it('rejects missing workspace (FK violation)', async () => {
    await expect(createProject({ workspace_id: 'ws_missing', name: 'x' })).rejects.toThrow()
  })

  it('accepts a caller-supplied project_id', async () => {
    const p = await createProject({ workspace_id: 'ws_1', project_id: 'proj_custom', name: 'x' })
    expect(p.project_id).toBe('proj_custom')
  })

  it('accepts git_url and parent_project_id', async () => {
    const parent = await createProject({ workspace_id: 'ws_1', name: 'parent' })
    const child = await createProject({
      workspace_id: 'ws_1',
      name: 'child',
      type: 'submodule',
      git_url: 'git@github.com:x/y.git',
      parent_project_id: parent.project_id,
    })
    expect(child.git_url).toBe('git@github.com:x/y.git')
    expect(child.parent_project_id).toBe(parent.project_id)
  })

  it('getProject returns row or null', async () => {
    const p = await createProject({ workspace_id: 'ws_1', name: 'a' })
    const got = await getProject(p.project_id)
    expect(got?.name).toBe('a')
    expect(await getProject('proj_missing')).toBeNull()
  })

  it('listProjects filters by workspace_id', async () => {
    await createWorkspace({ workspace_id: 'ws_2', name: 'w2' })
    await createProject({ workspace_id: 'ws_1', name: 'p1' })
    await createProject({ workspace_id: 'ws_2', name: 'p2' })
    const rows = await listProjects({ workspace_id: 'ws_1' })
    expect(rows.length).toBe(1)
    expect(rows[0].name).toBe('p1')
  })

  it('listProjects without filter returns all', async () => {
    await createWorkspace({ workspace_id: 'ws_2', name: 'w2' })
    await createProject({ workspace_id: 'ws_1', name: 'p1' })
    await createProject({ workspace_id: 'ws_2', name: 'p2' })
    const rows = await listProjects()
    expect(rows.length).toBe(2)
  })

  it('updateProject archives and sets git_url', async () => {
    const p = await createProject({ workspace_id: 'ws_1', name: 'a' })
    const updated = await updateProject({
      project_id: p.project_id,
      status: 'archived',
      git_url: 'git@github.com:x/y.git',
    })
    expect(updated.status).toBe('archived')
    expect(updated.git_url).toBe('git@github.com:x/y.git')
  })

  it('updateProject rejects invalid status', async () => {
    const p = await createProject({ workspace_id: 'ws_1', name: 'a' })
    await expect(
      updateProject({ project_id: p.project_id, status: 'nope' as any })
    ).rejects.toThrow(FulcrumError)
  })

  it('updateProject throws on missing project', async () => {
    await expect(
      updateProject({ project_id: 'proj_missing', status: 'archived' })
    ).rejects.toThrow(FulcrumError)
  })
})
