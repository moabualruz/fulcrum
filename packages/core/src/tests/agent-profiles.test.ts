import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb } from './helpers.js'
import { createWorkspace } from '../workspaces.js'
import {
  createAgentProfile,
  getAgentProfile,
  listAgentProfileRows,
  updateAgentProfile,
  deleteAgentProfile,
} from '../agent-profiles.js'
import { FulcrumError } from '../types.js'

describe('agent profiles (L-3)', () => {
  beforeEach(async () => {
    createTestDb()
    await createWorkspace({ workspace_id: 'ws_1', name: 'w1' })
  })
  afterEach(() => resetTestDb())

  it('creates a profile with default base_role=custom', async () => {
    const p = await createAgentProfile({
      workspace_id: 'ws_1',
      name: 'senior-security-auditor',
      description: 'Reviews crypto code for constant-time operations.',
    })
    expect(p.profile_id).toMatch(/^ap_/)
    expect(p.base_role).toBe('custom')
    expect(p.name).toBe('senior-security-auditor')
    expect(p.capabilities).toEqual({})
    expect(p.system_prompt).toBeNull()
  })

  it('accepts an explicit base_role and stores capabilities', async () => {
    const p = await createAgentProfile({
      workspace_id: 'ws_1',
      name: 'k8s-specialist',
      description: 'Owns the cluster.',
      base_role: 'devops_engineer',
      capabilities: { can_deploy: true, cluster: 'prod' },
      system_prompt: 'You are a kubernetes specialist.',
      created_by: 'agent_cos',
    })
    expect(p.base_role).toBe('devops_engineer')
    expect(p.capabilities).toEqual({ can_deploy: true, cluster: 'prod' })
    expect(p.system_prompt).toBe('You are a kubernetes specialist.')
    expect(p.created_by).toBe('agent_cos')
  })

  it('rejects invalid base_role with FulcrumError', async () => {
    await expect(
      createAgentProfile({
        workspace_id: 'ws_1',
        name: 'bad',
        description: 'x',
        base_role: 'nope' as never,
      }),
    ).rejects.toThrow(FulcrumError)
  })

  it('rejects empty name / description', async () => {
    await expect(
      createAgentProfile({ workspace_id: 'ws_1', name: '', description: 'x' }),
    ).rejects.toThrow(FulcrumError)
    await expect(
      createAgentProfile({ workspace_id: 'ws_1', name: 'x', description: '   ' }),
    ).rejects.toThrow(FulcrumError)
  })

  it('enforces unique (workspace_id, name) constraint', async () => {
    await createAgentProfile({ workspace_id: 'ws_1', name: 'dup', description: 'first' })
    await expect(
      createAgentProfile({ workspace_id: 'ws_1', name: 'dup', description: 'second' }),
    ).rejects.toThrow(/already exists/)
  })

  it('same name is allowed in different workspaces', async () => {
    await createWorkspace({ workspace_id: 'ws_2', name: 'w2' })
    await createAgentProfile({ workspace_id: 'ws_1', name: 'same', description: 'a' })
    await expect(
      createAgentProfile({ workspace_id: 'ws_2', name: 'same', description: 'b' }),
    ).resolves.toBeDefined()
  })

  it('listAgentProfileRows filters by workspace_id', async () => {
    await createWorkspace({ workspace_id: 'ws_2', name: 'w2' })
    await createAgentProfile({ workspace_id: 'ws_1', name: 'p1', description: 'x' })
    await createAgentProfile({ workspace_id: 'ws_2', name: 'p2', description: 'y' })
    const rows1 = await listAgentProfileRows('ws_1')
    expect(rows1.length).toBe(1)
    expect(rows1[0].name).toBe('p1')

    const allRows = await listAgentProfileRows()
    expect(allRows.length).toBe(2)
  })

  it('updateAgentProfile changes description + capabilities', async () => {
    const p = await createAgentProfile({
      workspace_id: 'ws_1',
      name: 'u',
      description: 'old',
    })
    const updated = await updateAgentProfile({
      profile_id: p.profile_id,
      description: 'new',
      capabilities: { can_write_code: false },
    })
    expect(updated.description).toBe('new')
    expect(updated.capabilities).toEqual({ can_write_code: false })
  })

  it('updateAgentProfile rejects invalid base_role', async () => {
    const p = await createAgentProfile({
      workspace_id: 'ws_1',
      name: 'v',
      description: 'x',
    })
    await expect(
      updateAgentProfile({ profile_id: p.profile_id, base_role: 'nope' as never }),
    ).rejects.toThrow(FulcrumError)
  })

  it('updateAgentProfile throws not_found for missing profile', async () => {
    await expect(
      updateAgentProfile({ profile_id: 'ap_missing', description: 'x' }),
    ).rejects.toThrow(/not found/)
  })

  it('deleteAgentProfile removes the row', async () => {
    const p = await createAgentProfile({
      workspace_id: 'ws_1',
      name: 'd',
      description: 'x',
    })
    await deleteAgentProfile(p.profile_id)
    expect(await getAgentProfile(p.profile_id)).toBeNull()
  })

  it('listAgentProfiles (status.ts) merges hardcoded + DB profiles when workspace_id is given', async () => {
    await createAgentProfile({
      workspace_id: 'ws_1',
      name: 'merged-test',
      description: 'check merge',
      base_role: 'custom',
    })
    const { listAgentProfiles } = await import('../status.js')
    const merged = await listAgentProfiles({ workspace_id: 'ws_1' })
    // Hardcoded list has 24 entries; plus our one DB row.
    expect(merged.length).toBeGreaterThanOrEqual(25)
    const dbEntry = merged.find(p => p.name === 'merged-test')
    expect(dbEntry).toBeDefined()
    expect(dbEntry?.source).toBe('db')
    expect(dbEntry?.profile_id).toMatch(/^ap_/)

    // Hardcoded entries still carry source='hardcoded'
    const cosEntry = merged.find(p => p.role === 'chief_of_staff' && p.source === 'hardcoded')
    expect(cosEntry).toBeDefined()
  })

  it('getTeamOps / setTeamOps (L-4) IoC registry works', async () => {
    const { getTeamOps, setTeamOps } = await import('../index.js')
    const fakeOps = {
      createTeamTemplate: vi.fn(),
      invokeTeam: vi.fn(),
      heartbeatTeam: vi.fn(),
      completeTeam: vi.fn(),
      listTeamInstances: vi.fn(),
      listTeamTemplates: vi.fn(),
      getTeamStatus: vi.fn(),
      canStartTeam: vi.fn(),
    }
    setTeamOps(fakeOps as never)
    expect(getTeamOps()).toBe(fakeOps)
  })

  it('listAgentProfiles without workspace_id returns hardcoded only', async () => {
    await createAgentProfile({
      workspace_id: 'ws_1',
      name: 'db-only',
      description: 'x',
    })
    const { listAgentProfiles } = await import('../status.js')
    const all = await listAgentProfiles()
    expect(all.every(p => p.source === 'hardcoded')).toBe(true)
    expect(all.find(p => p.name === 'db-only')).toBeUndefined()
  })
})
