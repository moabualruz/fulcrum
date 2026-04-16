// packages/planning/src/tests/integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seed } from './helpers.js'
import { createTask, getDb } from '@moabualruz/fulcrum-core'
import { createEpic } from '../epics.js'
import { createIssue, updateIssue } from '../issues.js'
import { createPRD, updatePRD } from '../prds.js'
import { createPlan, updatePlan, linkIssueToPlan } from '../plans.js'
import { addTaskRelation, getBlockers } from '../relations.js'

beforeEach(() => { const db = createTestDb(); seed(db) })
afterEach(() => resetTestDb())

describe('Full planning hierarchy: PRD → Plan → Issue → Task chain', () => {
  it('creates and links the full hierarchy', async () => {
    // 1. Create an epic
    const epic = await createEpic({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'Build auth system',
      priority: 'high',
    })
    expect(epic.display_id).toBe('EPIC-1')

    // 2. Create a PRD linked to the epic
    const prd = await createPRD({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'Auth PRD',
      linked_epic_id: epic.epic_id,
      description: 'Describes the authentication requirements',
    })
    expect(prd.display_id).toBe('PRD-1')
    expect(prd.linked_epic_id).toBe(epic.epic_id)
    expect(prd.status).toBe('draft')

    // 3. Approve the PRD
    const approvedPrd = await updatePRD({
      prd_id: prd.prd_id,
      workspace_id: 'ws_1',
      status: 'approved',
      expected_version: 0,
    })
    expect(approvedPrd.status).toBe('approved')
    expect(approvedPrd.status_category).toBe('done')

    // 4. Create a plan linked to the PRD
    const plan = await createPlan({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'Auth implementation plan',
      prd_id: prd.prd_id,
    })
    expect(plan.display_id).toBe('PLAN-1')
    expect(plan.prd_id).toBe(prd.prd_id)

    // 5. Create an issue linked to the epic
    const issue = await createIssue({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      epic_id: epic.epic_id,
      title: 'Implement OAuth2 flow',
      priority: 'high',
    })
    expect(issue.display_id).toBe('ISS-1')
    expect(issue.epic_id).toBe(epic.epic_id)

    // 6. Create a sub-issue
    const subIssue = await createIssue({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      epic_id: epic.epic_id,
      parent_issue_id: issue.issue_id,
      title: 'Implement token refresh',
    })
    expect(subIssue.display_id).toBe('ISS-2')
    expect(subIssue.parent_issue_id).toBe(issue.issue_id)

    // 7. Link the issue to the plan
    await linkIssueToPlan({ plan_id: plan.plan_id, issue_id: issue.issue_id, workspace_id: 'ws_1' })
    const db = getDb()
    const link = db.prepare('SELECT * FROM plan_issues WHERE plan_id = ? AND issue_id = ?')
      .get(plan.plan_id, issue.issue_id) as Record<string, unknown> | undefined
    expect(link).toBeDefined()

    // 8. Create a task for the issue
    const task = await createTask({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'Write OAuth2 provider integration',
    })

    // 9. Create a blocker task and link it
    const blockerTask = await createTask({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'Set up secrets management',
    })
    await addTaskRelation({
      task_id: blockerTask.task_id,
      target_task_id: task.task_id,
      relation_type: 'blocks',
    })

    // 10. Verify blocker is found
    const blockers = await getBlockers(task.task_id)
    expect(blockers).toHaveLength(1)
    expect(blockers[0].task_id).toBe(blockerTask.task_id)

    // 11. Move plan to active
    const activePlan = await updatePlan({
      plan_id: plan.plan_id,
      workspace_id: 'ws_1',
      status: 'active',
      expected_version: 0,
    })
    expect(activePlan.status).toBe('active')
    expect(activePlan.status_category).toBe('active')

    // 12. Move issue to in_progress
    const updatedIssue = await updateIssue({
      issue_id: issue.issue_id,
      workspace_id: 'ws_1',
      status: 'in_progress',
      expected_version: 0,
    })
    expect(updatedIssue.status).toBe('in_progress')
    expect(updatedIssue.status_category).toBe('active')
  })
})
