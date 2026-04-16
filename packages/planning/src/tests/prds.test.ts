// packages/planning/src/tests/prds.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seed } from './helpers.js'
import { getDb } from '@moabualruz/fulcrum-core'
import { createEpic } from '../epics.js'
import { createPRD, updatePRD, listPRDs } from '../prds.js'

beforeEach(() => { const db = createTestDb(); seed(db) })
afterEach(() => resetTestDb())

describe('createPRD', () => {
  it('creates a PRD with draft status and version 0', async () => {
    const prd = await createPRD({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'Auth system PRD',
    })
    expect(prd.status).toBe('draft')
    expect(prd.status_category).toBe('active')
    expect(prd.version).toBe(0)
    expect(prd.prd_id).toMatch(/^prd_[0-9A-Z]{26}$/)
    expect(prd.display_id).toMatch(/^PRD-\d+$/)
  })

  it('assigns incremental display_ids', async () => {
    const p1 = await createPRD({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'A' })
    const p2 = await createPRD({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'B' })
    expect(p1.display_id).toBe('PRD-1')
    expect(p2.display_id).toBe('PRD-2')
  })

  it('links to an epic', async () => {
    const epic = await createEpic({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'E' })
    const prd = await createPRD({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'PRD with epic',
      linked_epic_id: epic.epic_id,
    })
    expect(prd.linked_epic_id).toBe(epic.epic_id)
  })

  it('stores file_path when provided', async () => {
    const prd = await createPRD({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'PRD with file',
      file_path: '/docs/prd/auth.md',
    })
    expect(prd.file_path).toBe('/docs/prd/auth.md')
  })

  it('PRD.linked_epic_id roundtrips correctly', async () => {
    const epic = await createEpic({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'Epic for roundtrip' })
    const prd = await createPRD({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      title: 'PRD with linked_epic_id',
      linked_epic_id: epic.epic_id,
    })
    expect(prd.linked_epic_id).toBe(epic.epic_id)
  })

  it('throws invalid_input for empty title', async () => {
    await expect(
      createPRD({ workspace_id: 'ws_1', project_id: 'proj_1', title: '' })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })
})

describe('listPRDs', () => {
  it('returns all PRDs for a workspace', async () => {
    await createPRD({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'P1' })
    await createPRD({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'P2' })
    const prds = await listPRDs({ workspace_id: 'ws_1' })
    expect(prds).toHaveLength(2)
  })

  it('filters by status', async () => {
    const p = await createPRD({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'P' })
    await updatePRD({ prd_id: p.prd_id, workspace_id: 'ws_1', status: 'approved', expected_version: 0 })
    const draft = await listPRDs({ workspace_id: 'ws_1', status: 'draft' })
    const approved = await listPRDs({ workspace_id: 'ws_1', status: 'approved' })
    expect(draft).toHaveLength(0)
    expect(approved).toHaveLength(1)
  })

  it('filters by status_category', async () => {
    const p = await createPRD({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'P' })
    await updatePRD({ prd_id: p.prd_id, workspace_id: 'ws_1', status: 'archived', expected_version: 0 })
    const active = await listPRDs({ workspace_id: 'ws_1', status_category: 'active' })
    const done = await listPRDs({ workspace_id: 'ws_1', status_category: 'done' })
    expect(active).toHaveLength(0)
    expect(done).toHaveLength(1)
  })

  it('does not return PRDs from a different workspace', async () => {
    const db = getDb()
    db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_2','ws2')").run()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_2','ws_2','p2')").run()
    await createPRD({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'In ws_1' })
    await createPRD({ workspace_id: 'ws_2', project_id: 'proj_2', title: 'In ws_2' })
    const prds = await listPRDs({ workspace_id: 'ws_1' })
    expect(prds).toHaveLength(1)
    expect(prds[0].title).toBe('In ws_1')
  })
})

describe('updatePRD', () => {
  it('increments version and updates status_category when status changes', async () => {
    const p = await createPRD({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'P' })
    const updated = await updatePRD({ prd_id: p.prd_id, workspace_id: 'ws_1', status: 'review', expected_version: 0 })
    expect(updated.version).toBe(1)
    expect(updated.status).toBe('review')
    expect(updated.status_category).toBe('active')
  })

  it('throws version_conflict when expected_version mismatches', async () => {
    const p = await createPRD({ workspace_id: 'ws_1', project_id: 'proj_1', title: 'P' })
    await updatePRD({ prd_id: p.prd_id, workspace_id: 'ws_1', title: 'v1', expected_version: 0 })
    await expect(
      updatePRD({ prd_id: p.prd_id, workspace_id: 'ws_1', title: 'conflict', expected_version: 0 })
    ).rejects.toMatchObject({ code: 'version_conflict' })
  })

  it('throws not_found for unknown prd_id', async () => {
    await expect(
      updatePRD({ prd_id: 'prd_NONEXISTENT', workspace_id: 'ws_1', status: 'approved', expected_version: 0 })
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})
