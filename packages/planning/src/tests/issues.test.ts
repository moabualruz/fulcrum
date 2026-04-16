// packages/planning/src/tests/issues.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seed } from './helpers.js'
import { getDb } from '@moabualruz/fulcrum-core'
import { createEpic } from '../epics.js'
import { createIssue, updateIssue, listIssues } from '../issues.js'

beforeEach(() => { const db = createTestDb(); seed(db) })
afterEach(() => resetTestDb())

describe('createIssue', () => {
  it('creates an issue with backlog status and version 0', async () => {
    const issue = await createIssue({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'Fix login bug',
    })
    expect(issue.status).toBe('backlog')
    expect(issue.status_category).toBe('backlog')
    expect(issue.priority).toBe('medium')
    expect(issue.version).toBe(0)
    expect(issue.labels).toEqual([])
    expect(issue.issue_id).toMatch(/^iss_[0-9A-Z]{26}$/)
    expect(issue.display_id).toMatch(/^ISS-\d+$/)
  })

  it('assigns incremental display_ids', async () => {
    const i1 = await createIssue({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'A' })
    const i2 = await createIssue({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'B' })
    expect(i1.display_id).toBe('ISS-1')
    expect(i2.display_id).toBe('ISS-2')
  })

  it('links to an epic', async () => {
    const epic = await createEpic({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'E' })
    const issue = await createIssue({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'Issue under epic',
      epic_id: epic.epic_id,
    })
    expect(issue.epic_id).toBe(epic.epic_id)
  })

  it('creates a sub-issue via parent_issue_id', async () => {
    const parent = await createIssue({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Parent' })
    const child = await createIssue({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'Sub-issue',
      parent_issue_id: parent.issue_id,
    })
    expect(child.parent_issue_id).toBe(parent.issue_id)
    expect(child.display_id).toMatch(/^ISS-\d+$/)
  })

  it('throws invalid_input for empty title', async () => {
    await expect(
      createIssue({ workspace_id: 'ws_1', project_id: 'proj_1', title: '' })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('accepts estimate_type and estimate_value', async () => {
    const issue = await createIssue({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'Sized issue',
      estimate_type: 'story_points',
      estimate_value: 5,
    })
    expect(issue.estimate_type).toBe('story_points')
    expect(issue.estimate_value).toBe(5)
  })
})

describe('listIssues', () => {
  it('returns all issues for a workspace', async () => {
    await createIssue({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'I1' })
    await createIssue({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'I2' })
    const issues = await listIssues({ workspace_id: 'ws_1' })
    expect(issues).toHaveLength(2)
  })

  it('filters by project_id', async () => {
    const db = getDb()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_2','ws_1','p2')").run()
    await createIssue({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'In proj_1' })
    await createIssue({ workspace_id: 'ws_1', project_id: 'proj_2', title: 'In proj_2' })
    const issues = await listIssues({ workspace_id: 'ws_1', project_id: 'proj_1' })
    expect(issues).toHaveLength(1)
    expect(issues[0].title).toBe('In proj_1')
  })

  it('filters by epic_id', async () => {
    const epic = await createEpic({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'E' })
    await createIssue({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'With epic', epic_id: epic.epic_id })
    await createIssue({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Without epic' })
    const issues = await listIssues({ workspace_id: 'ws_1', epic_id: epic.epic_id })
    expect(issues).toHaveLength(1)
    expect(issues[0].title).toBe('With epic')
  })

  it('filters by parent_issue_id to get sub-issues', async () => {
    const parent = await createIssue({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Parent' })
    const child = await createIssue({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Child', parent_issue_id: parent.issue_id })
    const subs = await listIssues({ workspace_id: 'ws_1', parent_issue_id: parent.issue_id })
    expect(subs).toHaveLength(1)
    expect(subs[0].issue_id).toBe(child.issue_id)
  })

  it('filters by status', async () => {
    const i = await createIssue({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'I' })
    await updateIssue({ issue_id: i.issue_id, workspace_id: 'ws_1', status: 'done', expected_version: 0 })
    const backlog = await listIssues({ workspace_id: 'ws_1', status: 'backlog' })
    const done = await listIssues({ workspace_id: 'ws_1', status: 'done' })
    expect(backlog).toHaveLength(0)
    expect(done).toHaveLength(1)
  })

  it('filters by assignee_agent_id', async () => {
    await createIssue({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Assigned', assignee_agent_id: 'agent_1' })
    await createIssue({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Unassigned' })
    const assigned = await listIssues({ workspace_id: 'ws_1', assignee_agent_id: 'agent_1' })
    expect(assigned).toHaveLength(1)
    expect(assigned[0].title).toBe('Assigned')
  })

  it('does not return issues from a different workspace', async () => {
    const db = getDb()
    db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_2','ws2')").run()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_2','ws_2','p2')").run()
    await createIssue({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'In ws_1' })
    await createIssue({ workspace_id: 'ws_2', project_id: 'proj_2', title: 'In ws_2' })
    const issues = await listIssues({ workspace_id: 'ws_1' })
    expect(issues).toHaveLength(1)
    expect(issues[0].title).toBe('In ws_1')
  })
})

describe('updateIssue', () => {
  it('increments version and updates status_category', async () => {
    const i = await createIssue({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'I' })
    const updated = await updateIssue({ issue_id: i.issue_id, workspace_id: 'ws_1', status: 'in_progress', expected_version: 0 })
    expect(updated.version).toBe(1)
    expect(updated.status).toBe('in_progress')
    expect(updated.status_category).toBe('active')
  })

  it('updates labels — replaces all labels', async () => {
    const i = await createIssue({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'I' })
    const updated = await updateIssue({ issue_id: i.issue_id, workspace_id: 'ws_1', labels: ['bug', 'frontend'], expected_version: 0 })
    expect(updated.labels).toEqual(expect.arrayContaining(['bug', 'frontend']))
    expect(updated.labels).toHaveLength(2)
  })

  it('throws version_conflict when expected_version mismatches', async () => {
    const i = await createIssue({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'I' })
    await updateIssue({ issue_id: i.issue_id, workspace_id: 'ws_1', title: 'v1', expected_version: 0 })
    await expect(
      updateIssue({ issue_id: i.issue_id, workspace_id: 'ws_1', title: 'conflict', expected_version: 0 })
    ).rejects.toMatchObject({ code: 'version_conflict' })
  })

  it('throws not_found for unknown issue_id', async () => {
    await expect(
      updateIssue({ issue_id: 'iss_NONEXISTENT', workspace_id: 'ws_1', status: 'done', expected_version: 0 })
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('throws not_found when issue belongs to different workspace', async () => {
    const db = getDb()
    db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_2','ws2')").run()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_2','ws_2','p2')").run()
    const i = await createIssue({ workspace_id: 'ws_2', project_id: 'proj_2', title: 'I' })
    await expect(
      updateIssue({ issue_id: i.issue_id, workspace_id: 'ws_1', status: 'done', expected_version: 0 })
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})
