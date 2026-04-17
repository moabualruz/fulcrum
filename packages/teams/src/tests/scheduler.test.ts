// packages/teams/src/tests/scheduler.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seed } from './helpers.js'
import type Database from 'better-sqlite3'
import { canStartTeam } from '../scheduler.js'
import { invokeTeam, createTeamTemplate, heartbeatTeam } from '../teams.js'
import { FulcrumError } from 'fulcrum-core'
import { ulid } from 'ulidx'

let db: Database.Database
let workspace_id: string
let project_id: string

const MINIMAL_SLOTS = [
  {
    slot_id: 'slot_lead',
    role: 'chief_of_staff' as const,
    min_count: 1,
    max_count: 1,
    concurrency_cap: 1,
    required: true,
  },
]

beforeEach(() => {
  db = createTestDb()
  const seeded = seed(db)
  workspace_id = seeded.workspace_id
  project_id = seeded.project_id
})

afterEach(() => {
  resetTestDb()
})

// Helper: insert a raw team instance with a given status directly into the DB
// (bypasses the cap check so we can set up test state)
function insertActiveInstance(
  overrides: { template_id: string; status?: string; project_id?: string }
): void {
  const instance_id = `ti_${ulid()}`
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO team_instances(
       instance_id, template_id, workspace_id, project_id, display_id,
       status, status_category, purpose, created_by_agent_id,
       resolved_slots, version, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, 'active', 'test purpose', 'agent_test',
               '{}', 0, ?, ?)`
  ).run(
    instance_id,
    overrides.template_id,
    workspace_id,
    overrides.project_id ?? null,
    `TEAM-${instance_id.slice(-4)}`,
    overrides.status ?? 'running',
    now,
    now
  )
}

describe('canStartTeam', () => {
  it('returns allowed=true when under all caps', async () => {
    const tmpl = await createTeamTemplate({ name: 'sched-squad-1', slots: MINIMAL_SLOTS })

    const decision = canStartTeam(db, {
      workspace_id,
      project_id,
      template_id: tmpl.template_id,
    })

    expect(decision.allowed).toBe(true)
    expect(decision.counts.global).toBe(0)
    expect(decision.counts.project).toBe(0)
    expect(decision.counts.template).toBe(0)
    expect(decision.reason).toBeUndefined()
  })

  it('returns allowed=false and reason when global cap (8) is hit', async () => {
    const tmpl = await createTeamTemplate({ name: 'sched-squad-global', slots: MINIMAL_SLOTS })
    const tmpl2 = await createTeamTemplate({ name: 'sched-squad-global-2', slots: MINIMAL_SLOTS })

    // Insert 8 active instances to hit global cap
    for (let i = 0; i < 8; i++) {
      insertActiveInstance({ template_id: i % 2 === 0 ? tmpl.template_id : tmpl2.template_id })
    }

    const decision = canStartTeam(db, {
      workspace_id,
      template_id: tmpl.template_id,
    })

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toMatch(/global concurrency cap reached/)
    expect(decision.counts.global).toBe(8)
  })

  it('returns allowed=false when template cap (2) is hit', async () => {
    const tmpl = await createTeamTemplate({ name: 'sched-squad-tmpl', slots: MINIMAL_SLOTS })

    // Insert 2 active instances for this specific template
    insertActiveInstance({ template_id: tmpl.template_id })
    insertActiveInstance({ template_id: tmpl.template_id })

    const decision = canStartTeam(db, {
      workspace_id,
      template_id: tmpl.template_id,
    })

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toMatch(/per-template concurrency cap reached/)
    expect(decision.counts.template).toBe(2)
  })

  it('returns allowed=false when per-project cap (4) is hit', async () => {
    const tmpl = await createTeamTemplate({ name: 'sched-squad-proj', slots: MINIMAL_SLOTS })
    const tmpl2 = await createTeamTemplate({ name: 'sched-squad-proj-2', slots: MINIMAL_SLOTS })
    const tmpl3 = await createTeamTemplate({ name: 'sched-squad-proj-3', slots: MINIMAL_SLOTS })
    const tmpl4 = await createTeamTemplate({ name: 'sched-squad-proj-4', slots: MINIMAL_SLOTS })

    // Insert 4 active instances for this project using different templates to avoid template cap
    insertActiveInstance({ template_id: tmpl.template_id, project_id })
    insertActiveInstance({ template_id: tmpl2.template_id, project_id })
    insertActiveInstance({ template_id: tmpl3.template_id, project_id })
    insertActiveInstance({ template_id: tmpl4.template_id, project_id })

    const tmpl5 = await createTeamTemplate({ name: 'sched-squad-proj-5', slots: MINIMAL_SLOTS })
    const decision = canStartTeam(db, {
      workspace_id,
      project_id,
      template_id: tmpl5.template_id,
    })

    expect(decision.allowed).toBe(false)
    expect(decision.reason).toMatch(/per-project concurrency cap reached/)
    expect(decision.counts.project).toBe(4)
  })

  it('does not count terminal (completed/failed/cancelled) instances', async () => {
    const tmpl = await createTeamTemplate({ name: 'sched-squad-terminal', slots: MINIMAL_SLOTS })

    // Insert 3 terminal instances — should not count towards cap
    insertActiveInstance({ template_id: tmpl.template_id, status: 'completed' })
    insertActiveInstance({ template_id: tmpl.template_id, status: 'failed' })
    insertActiveInstance({ template_id: tmpl.template_id, status: 'cancelled' })

    const decision = canStartTeam(db, {
      workspace_id,
      template_id: tmpl.template_id,
    })

    expect(decision.allowed).toBe(true)
    expect(decision.counts.template).toBe(0)
  })

  it('respects custom config overrides', async () => {
    const tmpl = await createTeamTemplate({ name: 'sched-squad-custom', slots: MINIMAL_SLOTS })

    // Insert 1 active instance
    insertActiveInstance({ template_id: tmpl.template_id })

    // With default config (template_cap=2): should still be allowed
    const decisionDefault = canStartTeam(db, { workspace_id, template_id: tmpl.template_id })
    expect(decisionDefault.allowed).toBe(true)

    // With per_template_cap=1: should be denied
    const decisionStrict = canStartTeam(
      db,
      { workspace_id, template_id: tmpl.template_id },
      { per_template_cap: 1 }
    )
    expect(decisionStrict.allowed).toBe(false)
    expect(decisionStrict.reason).toMatch(/per-template concurrency cap reached/)
  })
})

describe('invokeTeam cap enforcement', () => {
  it('throws rate_limited FulcrumError when template cap is exceeded', async () => {
    const tmpl = await createTeamTemplate({ name: 'cap-enforce-squad', slots: MINIMAL_SLOTS })

    // Fill template cap with direct DB inserts (bypasses cap check)
    insertActiveInstance({ template_id: tmpl.template_id })
    insertActiveInstance({ template_id: tmpl.template_id })

    // Now invokeTeam should throw
    await expect(
      invokeTeam({
        template_id: tmpl.template_id,
        workspace_id,
        purpose: 'Should be blocked by cap',
        caller_agent_id: 'agent_cos_cap',
        caller_role: 'chief_of_staff',
      })
    ).rejects.toSatisfy((err: unknown) => {
      return err instanceof FulcrumError && err.code === 'rate_limited'
    })
  })

  it('throws rate_limited FulcrumError when global cap is exceeded', async () => {
    // Create 8 different templates and fill global cap
    const templates = []
    for (let i = 0; i < 9; i++) {
      templates.push(await createTeamTemplate({ name: `global-cap-squad-${i}`, slots: MINIMAL_SLOTS }))
    }

    // Insert 8 active instances using different templates (to avoid template cap)
    for (let i = 0; i < 8; i++) {
      insertActiveInstance({ template_id: templates[i].template_id })
    }

    // The 9th template should be blocked by global cap
    await expect(
      invokeTeam({
        template_id: templates[8].template_id,
        workspace_id,
        purpose: 'Should be blocked by global cap',
        caller_agent_id: 'agent_cos_gcap',
        caller_role: 'chief_of_staff',
      })
    ).rejects.toSatisfy((err: unknown) => {
      return err instanceof FulcrumError && err.code === 'rate_limited'
    })
  })
})
