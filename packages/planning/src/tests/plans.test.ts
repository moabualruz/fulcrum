// packages/planning/src/tests/plans.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seed } from './helpers.js'
import { getDb } from '@fulcrum/core'
import { createPRD } from '../prds.js'
import { createIssue } from '../issues.js'
import { createPlan, updatePlan, listPlans, linkIssueToPlan } from '../plans.js'

beforeEach(() => { const db = createTestDb(); seed(db) })
afterEach(() => resetTestDb())

describe('createPlan', () => {
  it('creates a plan with draft status and version 0', async () => {
    const plan = await createPlan({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'Sprint 1 Plan',
    })
    expect(plan.status).toBe('draft')
    expect(plan.status_category).toBe('active')
    expect(plan.version).toBe(0)
    expect(plan.plan_id).toMatch(/^plan_[0-9A-Z]{26}$/)
    expect(plan.display_id).toMatch(/^PLAN-\d+$/)
  })

  it('assigns incremental display_ids', async () => {
    const p1 = await createPlan({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'A' })
    const p2 = await createPlan({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'B' })
    expect(p1.display_id).toBe('PLAN-1')
    expect(p2.display_id).toBe('PLAN-2')
  })

  it('links to a PRD', async () => {
    const prd = await createPRD({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'PRD' })
    const plan = await createPlan({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'Plan from PRD',
      prd_id: prd.prd_id,
    })
    expect(plan.prd_id).toBe(prd.prd_id)
  })

  it('stores file_path when provided', async () => {
    const plan = await createPlan({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'Plan',
      file_path: '/docs/plans/sprint1.md',
    })
    expect(plan.file_path).toBe('/docs/plans/sprint1.md')
  })

  it('throws invalid_input for empty title', async () => {
    await expect(
      createPlan({ workspace_id: 'ws_1', project_id: 'proj_1', title: '' })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })
})

describe('listPlans', () => {
  it('returns all plans for a workspace', async () => {
    await createPlan({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'P1' })
    await createPlan({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'P2' })
    const plans = await listPlans({ workspace_id: 'ws_1' })
    expect(plans).toHaveLength(2)
  })

  it('filters by status', async () => {
    const p = await createPlan({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'P' })
    await updatePlan({ plan_id: p.plan_id, workspace_id: 'ws_1', status: 'active', expected_version: 0 })
    const draft = await listPlans({ workspace_id: 'ws_1', status: 'draft' })
    const active = await listPlans({ workspace_id: 'ws_1', status: 'active' })
    expect(draft).toHaveLength(0)
    expect(active).toHaveLength(1)
  })

  it('filters by status_category', async () => {
    const p = await createPlan({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'P' })
    await updatePlan({ plan_id: p.plan_id, workspace_id: 'ws_1', status: 'completed', expected_version: 0 })
    const active = await listPlans({ workspace_id: 'ws_1', status_category: 'active' })
    const done = await listPlans({ workspace_id: 'ws_1', status_category: 'done' })
    expect(active).toHaveLength(0)
    expect(done).toHaveLength(1)
  })

  it('does not return plans from a different workspace', async () => {
    const db = getDb()
    db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_2','ws2')").run()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_2','ws_2','p2')").run()
    await createPlan({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'In ws_1' })
    await createPlan({ workspace_id: 'ws_2', project_id: 'proj_2', title: 'In ws_2' })
    const plans = await listPlans({ workspace_id: 'ws_1' })
    expect(plans).toHaveLength(1)
    expect(plans[0].title).toBe('In ws_1')
  })
})

describe('updatePlan', () => {
  it('increments version and updates status_category when status changes', async () => {
    const p = await createPlan({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'P' })
    const updated = await updatePlan({ plan_id: p.plan_id, workspace_id: 'ws_1', status: 'active', expected_version: 0 })
    expect(updated.version).toBe(1)
    expect(updated.status).toBe('active')
    expect(updated.status_category).toBe('active')
  })

  it('throws version_conflict when expected_version mismatches', async () => {
    const p = await createPlan({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'P' })
    await updatePlan({ plan_id: p.plan_id, workspace_id: 'ws_1', title: 'v1', expected_version: 0 })
    await expect(
      updatePlan({ plan_id: p.plan_id, workspace_id: 'ws_1', title: 'conflict', expected_version: 0 })
    ).rejects.toMatchObject({ code: 'version_conflict' })
  })

  it('throws not_found for unknown plan_id', async () => {
    await expect(
      updatePlan({ plan_id: 'plan_NONEXISTENT', workspace_id: 'ws_1', status: 'active', expected_version: 0 })
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('linkIssueToPlan', () => {
  it('links an issue to a plan', async () => {
    const plan = await createPlan({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'P' })
    const issue = await createIssue({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'I' })
    await linkIssueToPlan({ plan_id: plan.plan_id, issue_id: issue.issue_id, workspace_id: 'ws_1' })
    const db = getDb()
    const link = db.prepare('SELECT * FROM plan_issues WHERE plan_id = ? AND issue_id = ?')
      .get(plan.plan_id, issue.issue_id) as Record<string, unknown> | undefined
    expect(link).toBeDefined()
  })

  it('is idempotent — linking twice does not throw', async () => {
    const plan = await createPlan({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'P' })
    const issue = await createIssue({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'I' })
    await linkIssueToPlan({ plan_id: plan.plan_id, issue_id: issue.issue_id, workspace_id: 'ws_1' })
    await expect(
      linkIssueToPlan({ plan_id: plan.plan_id, issue_id: issue.issue_id, workspace_id: 'ws_1' })
    ).resolves.toBeUndefined()
  })

  it('throws not_found when plan does not exist', async () => {
    const issue = await createIssue({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'I' })
    await expect(
      linkIssueToPlan({ plan_id: 'plan_NONE', issue_id: issue.issue_id, workspace_id: 'ws_1' })
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('throws not_found when issue does not exist', async () => {
    const plan = await createPlan({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'P' })
    await expect(
      linkIssueToPlan({ plan_id: plan.plan_id, issue_id: 'iss_NONE', workspace_id: 'ws_1' })
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})
