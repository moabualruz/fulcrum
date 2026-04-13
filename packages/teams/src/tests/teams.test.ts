// packages/teams/src/tests/teams.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seed } from './helpers.js'
import type Database from 'better-sqlite3'
import {
  createTeamTemplate,
  invokeTeam,
  heartbeatTeam,
  completeTeam,
  listTeamInstances,
  getTeamStatus,
} from '../teams.js'

let db: Database.Database
let workspace_id: string
let project_id: string

beforeEach(() => {
  db = createTestDb()
  const seeded = seed(db)
  workspace_id = seeded.workspace_id
  project_id = seeded.project_id
})

afterEach(() => {
  resetTestDb()
})

const SAMPLE_SLOTS = [
  {
    slot_id: 'slot_lead',
    role: 'tech_lead' as const,
    min_count: 1,
    max_count: 1,
    concurrency_cap: 1,
    required: true,
    description: 'Technical lead',
  },
  {
    slot_id: 'slot_eng',
    role: 'software_engineer' as const,
    min_count: 1,
    max_count: 3,
    concurrency_cap: 2,
    required: true,
    description: 'Engineers',
  },
]

describe('createTeamTemplate', () => {
  it('creates a template with slots and returns persisted record', async () => {
    const tmpl = await createTeamTemplate({
      name: 'feature-squad',
      description: 'Standard feature squad',
      slots: SAMPLE_SLOTS,
    })

    expect(tmpl.template_id).toMatch(/^team_/)
    expect(tmpl.name).toBe('feature-squad')
    expect(tmpl.description).toBe('Standard feature squad')
    expect(tmpl.slots).toHaveLength(2)
    expect(tmpl.slots[0].slot_id).toBe('slot_lead')
    expect(tmpl.slots[1].role).toBe('software_engineer')
    expect(tmpl.policy).toEqual({})
    expect(tmpl.created_at).toBeTruthy()
    expect(tmpl.updated_at).toBeTruthy()
  })

  it('stores custom policy on the template', async () => {
    const tmpl = await createTeamTemplate({
      name: 'policy-squad',
      slots: SAMPLE_SLOTS,
      policy: { max_parallel_tasks: 5, allow_external_tools: false },
    })

    expect(tmpl.policy).toEqual({ max_parallel_tasks: 5, allow_external_tools: false })
  })
})

describe('invokeTeam', () => {
  it('creates a team instance when caller_role is chief_of_staff', async () => {
    const tmpl = await createTeamTemplate({ name: 'invoke-squad', slots: SAMPLE_SLOTS })

    const instance = await invokeTeam({
      template_id: tmpl.template_id,
      workspace_id,
      project_id,
      purpose: 'Build the auth module',
      caller_agent_id: 'agent_cos_01',
      caller_role: 'chief_of_staff',
    })

    expect(instance.instance_id).toMatch(/^ti_/)
    expect(instance.display_id).toBeTruthy()
    expect(instance.template_id).toBe(tmpl.template_id)
    expect(instance.workspace_id).toBe(workspace_id)
    expect(instance.project_id).toBe(project_id)
    expect(instance.status).toBe('created')
    expect(instance.status_category).toBe('active')
    expect(instance.purpose).toBe('Build the auth module')
    expect(instance.created_by_agent_id).toBe('agent_cos_01')
    expect(instance.version).toBe(0)
  })

  it('throws POLICY_DENIED when caller_role is not chief_of_staff', async () => {
    const tmpl = await createTeamTemplate({ name: 'deny-squad', slots: SAMPLE_SLOTS })

    await expect(
      invokeTeam({
        template_id: tmpl.template_id,
        workspace_id,
        purpose: 'Should be denied',
        caller_agent_id: 'agent_eng_01',
        caller_role: 'software_engineer',
      })
    ).rejects.toThrow('POLICY_DENIED: only chief_of_staff may invoke teams')
  })

  it('sets resolved_slots from initial_slots if provided', async () => {
    const tmpl = await createTeamTemplate({ name: 'slotted-squad', slots: SAMPLE_SLOTS })

    const instance = await invokeTeam({
      template_id: tmpl.template_id,
      workspace_id,
      purpose: 'Pre-filled slots',
      caller_agent_id: 'agent_cos_02',
      caller_role: 'chief_of_staff',
      initial_slots: { slot_lead: ['agent_lead_01'] },
    })

    expect(instance.resolved_slots).toEqual({ slot_lead: ['agent_lead_01'] })
  })
})

describe('heartbeatTeam', () => {
  it('updates status, resolved_slots, and increments version', async () => {
    const tmpl = await createTeamTemplate({ name: 'hb-squad', slots: SAMPLE_SLOTS })
    const instance = await invokeTeam({
      template_id: tmpl.template_id,
      workspace_id,
      purpose: 'Heartbeat test',
      caller_agent_id: 'agent_cos_03',
      caller_role: 'chief_of_staff',
    })

    const updated = await heartbeatTeam({
      instance_id: instance.instance_id,
      status: 'running',
      resolved_slots: { slot_lead: ['agent_lead_02'], slot_eng: ['agent_eng_02', 'agent_eng_03'] },
    })

    expect(updated.status).toBe('running')
    expect(updated.version).toBe(1)
    expect(updated.resolved_slots).toEqual({
      slot_lead: ['agent_lead_02'],
      slot_eng: ['agent_eng_02', 'agent_eng_03'],
    })
    expect(updated.updated_at).toBeTruthy()
  })

  it('increments version on each heartbeat', async () => {
    const tmpl = await createTeamTemplate({ name: 'version-squad', slots: SAMPLE_SLOTS })
    const instance = await invokeTeam({
      template_id: tmpl.template_id,
      workspace_id,
      purpose: 'Version increment test',
      caller_agent_id: 'agent_cos_04',
      caller_role: 'chief_of_staff',
    })

    const hb1 = await heartbeatTeam({ instance_id: instance.instance_id, status: 'spawning' })
    const hb2 = await heartbeatTeam({ instance_id: instance.instance_id, status: 'running' })

    expect(hb1.version).toBe(1)
    expect(hb2.version).toBe(2)
  })
})

describe('completeTeam', () => {
  it('sets status_category to done when final_status is completed', async () => {
    const tmpl = await createTeamTemplate({ name: 'done-squad', slots: SAMPLE_SLOTS })
    const instance = await invokeTeam({
      template_id: tmpl.template_id,
      workspace_id,
      purpose: 'Completion test',
      caller_agent_id: 'agent_cos_05',
      caller_role: 'chief_of_staff',
    })

    const completed = await completeTeam({
      instance_id: instance.instance_id,
      final_status: 'completed',
    })

    expect(completed.status).toBe('completed')
    expect(completed.status_category).toBe('done')
  })

  it('sets status_category to blocked when final_status is failed', async () => {
    const tmpl = await createTeamTemplate({ name: 'fail-squad', slots: SAMPLE_SLOTS })
    const instance = await invokeTeam({
      template_id: tmpl.template_id,
      workspace_id,
      purpose: 'Failure test',
      caller_agent_id: 'agent_cos_06',
      caller_role: 'chief_of_staff',
    })

    const failed = await completeTeam({
      instance_id: instance.instance_id,
      final_status: 'failed',
    })

    expect(failed.status).toBe('failed')
    expect(failed.status_category).toBe('blocked')
  })

  it('sets status_category to done when final_status is cancelled', async () => {
    const tmpl = await createTeamTemplate({ name: 'cancel-squad', slots: SAMPLE_SLOTS })
    const instance = await invokeTeam({
      template_id: tmpl.template_id,
      workspace_id,
      purpose: 'Cancellation test',
      caller_agent_id: 'agent_cos_07',
      caller_role: 'chief_of_staff',
    })

    const cancelled = await completeTeam({
      instance_id: instance.instance_id,
      final_status: 'cancelled',
    })

    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.status_category).toBe('done')
  })
})

describe('listTeamInstances', () => {
  it('returns instances filtered by workspace_id', async () => {
    const tmpl = await createTeamTemplate({ name: 'list-squad', slots: SAMPLE_SLOTS })
    await invokeTeam({
      template_id: tmpl.template_id,
      workspace_id,
      purpose: 'First',
      caller_agent_id: 'agent_cos_08',
      caller_role: 'chief_of_staff',
    })
    await invokeTeam({
      template_id: tmpl.template_id,
      workspace_id,
      purpose: 'Second',
      caller_agent_id: 'agent_cos_09',
      caller_role: 'chief_of_staff',
    })

    const list = await listTeamInstances({ workspace_id })
    expect(list.length).toBeGreaterThanOrEqual(2)
    expect(list.every(i => i.workspace_id === workspace_id)).toBe(true)
  })

  it('filters by status_category', async () => {
    const tmpl = await createTeamTemplate({ name: 'filter-squad', slots: SAMPLE_SLOTS })
    const instance = await invokeTeam({
      template_id: tmpl.template_id,
      workspace_id,
      purpose: 'Filter test',
      caller_agent_id: 'agent_cos_10',
      caller_role: 'chief_of_staff',
    })
    await completeTeam({ instance_id: instance.instance_id, final_status: 'completed' })

    const active = await listTeamInstances({ workspace_id, status_category: 'active' })
    const done = await listTeamInstances({ workspace_id, status_category: 'done' })

    expect(active.every(i => i.status_category === 'active')).toBe(true)
    expect(done.some(i => i.instance_id === instance.instance_id)).toBe(true)
  })

  it('respects limit and offset pagination', async () => {
    const tmpl = await createTeamTemplate({ name: 'page-squad', slots: SAMPLE_SLOTS })
    for (let n = 0; n < 5; n++) {
      await invokeTeam({
        template_id: tmpl.template_id,
        workspace_id,
        purpose: `Instance ${n}`,
        caller_agent_id: `agent_cos_pg_${n}`,
        caller_role: 'chief_of_staff',
      })
    }

    const page1 = await listTeamInstances({ workspace_id, limit: 2, offset: 0 })
    const page2 = await listTeamInstances({ workspace_id, limit: 2, offset: 2 })

    expect(page1).toHaveLength(2)
    expect(page2).toHaveLength(2)
    expect(page1[0].instance_id).not.toBe(page2[0].instance_id)
  })
})

describe('getTeamStatus', () => {
  it('returns slot_occupancy with correct counts from template slots', async () => {
    const tmpl = await createTeamTemplate({ name: 'status-squad', slots: SAMPLE_SLOTS })
    const instance = await invokeTeam({
      template_id: tmpl.template_id,
      workspace_id,
      purpose: 'Status check test',
      caller_agent_id: 'agent_cos_11',
      caller_role: 'chief_of_staff',
      initial_slots: { slot_lead: ['agent_lead_10'], slot_eng: ['agent_eng_10', 'agent_eng_11'] },
    })

    // Insert team_members rows to simulate assigned agents
    db.prepare(
      `INSERT INTO team_members(instance_id, slot_id, agent_id, role, joined_at)
       VALUES (?, 'slot_lead', 'agent_lead_10', 'tech_lead', datetime('now'))`
    ).run(instance.instance_id)
    db.prepare(
      `INSERT INTO team_members(instance_id, slot_id, agent_id, role, joined_at)
       VALUES (?, 'slot_eng', 'agent_eng_10', 'software_engineer', datetime('now'))`
    ).run(instance.instance_id)
    db.prepare(
      `INSERT INTO team_members(instance_id, slot_id, agent_id, role, joined_at)
       VALUES (?, 'slot_eng', 'agent_eng_11', 'software_engineer', datetime('now'))`
    ).run(instance.instance_id)

    const status = await getTeamStatus({ instance_id: instance.instance_id, workspace_id })

    expect(status.instance_id).toBe(instance.instance_id)
    expect(status.status).toBe('created')
    expect(status.status_category).toBe('active')
    expect(status.active_member_count).toBe(3)
    expect(status.slot_occupancy['slot_lead']).toEqual({
      current: 1,
      max: 1,
      agents: ['agent_lead_10'],
    })
    expect(status.slot_occupancy['slot_eng'].current).toBe(2)
    expect(status.slot_occupancy['slot_eng'].max).toBe(3)
    expect(status.slot_occupancy['slot_eng'].agents).toContain('agent_eng_10')
    expect(status.slot_occupancy['slot_eng'].agents).toContain('agent_eng_11')
  })

  it('flags concurrency_cap_violations when agents exceed cap', async () => {
    const cappedSlots = [
      {
        slot_id: 'slot_capped',
        role: 'software_engineer' as const,
        min_count: 1,
        max_count: 5,
        concurrency_cap: 1, // cap = 1
        required: true,
      },
    ]
    const tmpl = await createTeamTemplate({ name: 'cap-squad', slots: cappedSlots })
    const instance = await invokeTeam({
      template_id: tmpl.template_id,
      workspace_id,
      purpose: 'Cap violation test',
      caller_agent_id: 'agent_cos_12',
      caller_role: 'chief_of_staff',
    })

    // Add 2 members to a slot with cap=1
    db.prepare(
      `INSERT INTO team_members(instance_id, slot_id, agent_id, role, joined_at)
       VALUES (?, 'slot_capped', 'agent_a', 'software_engineer', datetime('now'))`
    ).run(instance.instance_id)
    db.prepare(
      `INSERT INTO team_members(instance_id, slot_id, agent_id, role, joined_at)
       VALUES (?, 'slot_capped', 'agent_b', 'software_engineer', datetime('now'))`
    ).run(instance.instance_id)

    const status = await getTeamStatus({ instance_id: instance.instance_id, workspace_id })
    expect(status.concurrency_cap_violations).toContain('slot_capped')
  })
})
