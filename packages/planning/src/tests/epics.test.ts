// packages/planning/src/tests/epics.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seed } from './helpers.js'
import { getDb } from 'fulcrum-core'
import { createEpic, updateEpic, listEpics } from '../epics.js'

beforeEach(() => { const db = createTestDb(); seed(db) })
afterEach(() => resetTestDb())

describe('createEpic', () => {
  it('creates an epic with backlog status and version 0', async () => {
    const epic = await createEpic({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'Auth epic',
    })
    expect(epic.status).toBe('backlog')
    expect(epic.status_category).toBe('backlog')
    expect(epic.priority).toBe('medium')
    expect(epic.version).toBe(0)
    expect(epic.title).toBe('Auth epic')
    expect(epic.epic_id).toMatch(/^epic_[0-9A-Z]{26}$/)
    expect(epic.display_id).toMatch(/^EPIC-\d+$/)
  })

  it('assigns incremental display_ids per project', async () => {
    const e1 = await createEpic({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'A' })
    const e2 = await createEpic({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'B' })
    expect(e1.display_id).toBe('EPIC-1')
    expect(e2.display_id).toBe('EPIC-2')
  })

  it('accepts optional priority and milestone_id', async () => {
    const epic = await createEpic({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'E',
      priority: 'critical',
      milestone_id: 'mile_abc',
    })
    expect(epic.priority).toBe('critical')
    expect(epic.milestone_id).toBe('mile_abc')
  })

  it('creates epic with priority=high and milestone_id that roundtrip correctly', async () => {
    const epic = await createEpic({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'Milestone epic',
      priority: 'high',
      milestone_id: 'mile_123',
    })
    expect(epic.priority).toBe('high')
    expect(epic.milestone_id).toBe('mile_123')
  })

  it('defaults priority to medium when not specified', async () => {
    const epic = await createEpic({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'Default priority epic',
    })
    expect(epic.priority).toBe('medium')
  })

  it('throws invalid_input for empty title', async () => {
    await expect(
      createEpic({ workspace_id: 'ws_1', project_id: 'proj_1', title: '' })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('throws invalid_input for whitespace-only title', async () => {
    await expect(
      createEpic({ workspace_id: 'ws_1', project_id: 'proj_1', title: '   ' })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })
})

describe('listEpics', () => {
  it('returns all epics for a workspace', async () => {
    await createEpic({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'E1' })
    await createEpic({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'E2' })
    const epics = await listEpics({ workspace_id: 'ws_1' })
    expect(epics).toHaveLength(2)
  })

  it('filters by project_id', async () => {
    const db = getDb()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_2','ws_1','p2')").run()
    await createEpic({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'In proj_1' })
    await createEpic({ workspace_id: 'ws_1', project_id: 'proj_2', title: 'In proj_2' })
    const epics = await listEpics({ workspace_id: 'ws_1', project_id: 'proj_1' })
    expect(epics).toHaveLength(1)
    expect(epics[0].title).toBe('In proj_1')
  })

  it('filters by status', async () => {
    const e = await createEpic({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'E' })
    await updateEpic({ epic_id: e.epic_id, workspace_id: 'ws_1', status: 'done', expected_version: 0 })
    const backlog = await listEpics({ workspace_id: 'ws_1', status: 'backlog' })
    const done = await listEpics({ workspace_id: 'ws_1', status: 'done' })
    expect(backlog).toHaveLength(0)
    expect(done).toHaveLength(1)
  })

  it('filters by status_category', async () => {
    await createEpic({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'E' })
    const backlog = await listEpics({ workspace_id: 'ws_1', status_category: 'backlog' })
    const active = await listEpics({ workspace_id: 'ws_1', status_category: 'active' })
    expect(backlog).toHaveLength(1)
    expect(active).toHaveLength(0)
  })

  it('does not return epics from a different workspace', async () => {
    const db = getDb()
    db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_2','ws2')").run()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_2','ws_2','p2')").run()
    await createEpic({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'In ws_1' })
    await createEpic({ workspace_id: 'ws_2', project_id: 'proj_2', title: 'In ws_2' })
    const epics = await listEpics({ workspace_id: 'ws_1' })
    expect(epics).toHaveLength(1)
    expect(epics[0].title).toBe('In ws_1')
  })
})

describe('updateEpic', () => {
  it('increments version on update', async () => {
    const e = await createEpic({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'E' })
    const updated = await updateEpic({ epic_id: e.epic_id, workspace_id: 'ws_1', title: 'New', expected_version: 0 })
    expect(updated.version).toBe(1)
    expect(updated.title).toBe('New')
  })

  it('updates status_category when status changes', async () => {
    const e = await createEpic({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'E' })
    const updated = await updateEpic({ epic_id: e.epic_id, workspace_id: 'ws_1', status: 'in_progress', expected_version: 0 })
    expect(updated.status).toBe('in_progress')
    expect(updated.status_category).toBe('active')
  })

  it('throws version_conflict when expected_version mismatches', async () => {
    const e = await createEpic({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'E' })
    await updateEpic({ epic_id: e.epic_id, workspace_id: 'ws_1', title: 'changed', expected_version: 0 })
    await expect(
      updateEpic({ epic_id: e.epic_id, workspace_id: 'ws_1', title: 'conflict', expected_version: 0 })
    ).rejects.toMatchObject({ code: 'version_conflict' })
  })

  it('throws not_found for unknown epic_id', async () => {
    await expect(
      updateEpic({ epic_id: 'epic_NONEXISTENT', workspace_id: 'ws_1', status: 'done', expected_version: 0 })
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('throws not_found when epic belongs to different workspace', async () => {
    const db = getDb()
    db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_2','ws2')").run()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_2','ws_2','p2')").run()
    const e = await createEpic({ workspace_id: 'ws_2', project_id: 'proj_2', title: 'E' })
    await expect(
      updateEpic({ epic_id: e.epic_id, workspace_id: 'ws_1', status: 'done', expected_version: 0 })
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('FTS5 search on epics', () => {
  it('finds epic by title keyword after insert', async () => {
    await createEpic({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Authentication system' })
    const db = getDb()
    const rows = db.prepare(
      "SELECT e.* FROM epics e JOIN epics_fts f ON e.rowid = f.rowid WHERE epics_fts MATCH 'authentication'"
    ).all() as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect(rows[0].title).toBe('Authentication system')
  })

  it('finds updated title in FTS5 index after update', async () => {
    const e = await createEpic({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Old title' })
    await updateEpic({ epic_id: e.epic_id, workspace_id: 'ws_1', title: 'New searchable title', expected_version: 0 })
    const db = getDb()
    const old_results = db.prepare(
      "SELECT e.* FROM epics e JOIN epics_fts f ON e.rowid = f.rowid WHERE epics_fts MATCH 'old'"
    ).all() as Record<string, unknown>[]
    expect(old_results).toHaveLength(0)
    const new_results = db.prepare(
      "SELECT e.* FROM epics e JOIN epics_fts f ON e.rowid = f.rowid WHERE epics_fts MATCH 'searchable'"
    ).all() as Record<string, unknown>[]
    expect(new_results).toHaveLength(1)
  })
})
