import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { createWorkspace, getWorkspace, listWorkspaces, updateWorkspace } from '../workspaces.js'
import { FulcrumError } from '../types.js'

describe('workspaces CRUD (G-1)', () => {
  beforeEach(() => { createTestDb() })
  afterEach(() => resetTestDb())

  it('createWorkspace inserts a row and returns it', async () => {
    const ws = await createWorkspace({ name: 'alpha' })
    expect(ws.workspace_id).toMatch(/^ws_/)
    expect(ws.name).toBe('alpha')
    expect(ws.status).toBe('active')
    expect(ws.created_at).toBeTruthy()
  })

  it('accepts a caller-supplied workspace_id', async () => {
    const ws = await createWorkspace({ workspace_id: 'ws_explicit', name: 'beta' })
    expect(ws.workspace_id).toBe('ws_explicit')
  })

  it('rejects empty name', async () => {
    await expect(createWorkspace({ name: '' })).rejects.toThrow(FulcrumError)
    await expect(createWorkspace({ name: '   ' })).rejects.toThrow(FulcrumError)
  })

  it('is idempotent on the same workspace_id (INSERT OR IGNORE)', async () => {
    await createWorkspace({ workspace_id: 'ws_x', name: 'x' })
    const again = await createWorkspace({ workspace_id: 'ws_x', name: 'x' })
    expect(again.workspace_id).toBe('ws_x')
  })

  it('getWorkspace returns the row or null', async () => {
    const created = await createWorkspace({ name: 'alpha' })
    const got = await getWorkspace(created.workspace_id)
    expect(got?.name).toBe('alpha')
    expect(await getWorkspace('ws_missing')).toBeNull()
  })

  it('listWorkspaces returns all rows ordered by created_at DESC', async () => {
    await createWorkspace({ workspace_id: 'ws_1', name: 'one' })
    // small delay to ensure created_at ordering is observable
    await new Promise(r => setTimeout(r, 5))
    await createWorkspace({ workspace_id: 'ws_2', name: 'two' })
    const all = await listWorkspaces()
    expect(all.length).toBe(2)
    expect(all[0].workspace_id).toBe('ws_2') // newest first
  })

  it('updateWorkspace changes name and status', async () => {
    const ws = await createWorkspace({ name: 'original' })
    const updated = await updateWorkspace({ workspace_id: ws.workspace_id, name: 'renamed', status: 'archived' })
    expect(updated.name).toBe('renamed')
    expect(updated.status).toBe('archived')
  })

  it('updateWorkspace rejects empty name', async () => {
    const ws = await createWorkspace({ name: 'original' })
    await expect(updateWorkspace({ workspace_id: ws.workspace_id, name: '' })).rejects.toThrow(FulcrumError)
  })

  it('updateWorkspace throws on missing workspace_id', async () => {
    await expect(updateWorkspace({ workspace_id: 'ws_missing', name: 'x' })).rejects.toThrow(FulcrumError)
  })
})
