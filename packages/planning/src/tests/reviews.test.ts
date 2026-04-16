// packages/planning/src/tests/reviews.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, resetTestDb, seed } from './helpers.js'
import { createReview, updateReview, getReview, listReviews } from '../reviews.js'

beforeEach(() => { const db = createTestDb(); seed(db) })
afterEach(() => resetTestDb())

describe('createReview', () => {
  it('creates a review with pending status and correct fields', async () => {
    const review = await createReview({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      target_type: 'task',
      target_id: 'task_abc',
    })
    expect(review.status).toBe('pending')
    expect(review.review_id).toMatch(/^rev_[0-9A-Z]{26}$/)
    expect(review.display_id).toMatch(/^REV-\d+$/)
    expect(review.workspace_id).toBe('ws_1')
    expect(review.project_id).toBe('proj_1')
    expect(review.target_type).toBe('task')
    expect(review.target_id).toBe('task_abc')
    expect(review.reviewer_agent_id).toBeUndefined()
    expect(review.summary).toBeUndefined()
    expect(review.file_path).toBeUndefined()
    expect(review.created_at).toBeDefined()
    expect(review.updated_at).toBeDefined()
  })

  it('assigns incremental display_ids', async () => {
    const r1 = await createReview({ workspace_id: 'ws_1', project_id: 'proj_1', target_type: 'task', target_id: 't1' })
    const r2 = await createReview({ workspace_id: 'ws_1', project_id: 'proj_1', target_type: 'task', target_id: 't2' })
    expect(r1.display_id).toBe('REV-1')
    expect(r2.display_id).toBe('REV-2')
  })

  it('stores optional fields when provided', async () => {
    const review = await createReview({
      workspace_id: 'ws_1',
      project_id: 'proj_1',
      target_type: 'artifact',
      target_id: 'art_xyz',
      reviewer_agent_id: 'agent_42',
      summary: 'Looks good overall',
      file_path: '/reviews/r1.md',
    })
    expect(review.reviewer_agent_id).toBe('agent_42')
    expect(review.summary).toBe('Looks good overall')
    expect(review.file_path).toBe('/reviews/r1.md')
  })

  it('throws invalid_input when project_id is missing', async () => {
    await expect(
      createReview({ workspace_id: 'ws_1', target_type: 'task', target_id: 't1' })
    ).rejects.toMatchObject({ code: 'invalid_input' })
  })

  it('supports all target_type values', async () => {
    const t = await createReview({ workspace_id: 'ws_1', project_id: 'proj_1', target_type: 'task', target_id: 'tid' })
    const a = await createReview({ workspace_id: 'ws_1', project_id: 'proj_1', target_type: 'artifact', target_id: 'aid' })
    const w = await createReview({ workspace_id: 'ws_1', project_id: 'proj_1', target_type: 'worktree', target_id: 'wid' })
    expect(t.target_type).toBe('task')
    expect(a.target_type).toBe('artifact')
    expect(w.target_type).toBe('worktree')
  })
})

describe('getReview', () => {
  it('returns the review by id and workspace', async () => {
    const created = await createReview({ workspace_id: 'ws_1', project_id: 'proj_1', target_type: 'task', target_id: 't1' })
    const found = await getReview(created.review_id, 'ws_1')
    expect(found).not.toBeNull()
    expect(found!.review_id).toBe(created.review_id)
  })

  it('returns null when review_id does not exist', async () => {
    const found = await getReview('rev_NONEXISTENT', 'ws_1')
    expect(found).toBeNull()
  })

  it('returns null when workspace_id does not match', async () => {
    const created = await createReview({ workspace_id: 'ws_1', project_id: 'proj_1', target_type: 'task', target_id: 't1' })
    const found = await getReview(created.review_id, 'ws_other')
    expect(found).toBeNull()
  })
})

describe('updateReview', () => {
  it('changes status and updates updated_at', async () => {
    const review = await createReview({ workspace_id: 'ws_1', project_id: 'proj_1', target_type: 'task', target_id: 't1' })
    const updated = await updateReview({ review_id: review.review_id, workspace_id: 'ws_1', status: 'approved' })
    expect(updated.status).toBe('approved')
    expect(updated.updated_at).toBeDefined()
  })

  it('updates summary when provided', async () => {
    const review = await createReview({ workspace_id: 'ws_1', project_id: 'proj_1', target_type: 'task', target_id: 't1' })
    const updated = await updateReview({
      review_id: review.review_id,
      workspace_id: 'ws_1',
      status: 'changes_requested',
      summary: 'Please fix the linting errors',
    })
    expect(updated.summary).toBe('Please fix the linting errors')
  })

  it('throws not_found for unknown review_id', async () => {
    await expect(
      updateReview({ review_id: 'rev_NONEXISTENT', workspace_id: 'ws_1', status: 'approved' })
    ).rejects.toMatchObject({ code: 'not_found' })
  })

  it('throws not_found when review belongs to different workspace', async () => {
    const review = await createReview({ workspace_id: 'ws_1', project_id: 'proj_1', target_type: 'task', target_id: 't1' })
    await expect(
      updateReview({ review_id: review.review_id, workspace_id: 'ws_other', status: 'approved' })
    ).rejects.toMatchObject({ code: 'not_found' })
  })
})

describe('listReviews', () => {
  it('returns all reviews for a workspace', async () => {
    await createReview({ workspace_id: 'ws_1', project_id: 'proj_1', target_type: 'task', target_id: 't1' })
    await createReview({ workspace_id: 'ws_1', project_id: 'proj_1', target_type: 'artifact', target_id: 'a1' })
    const reviews = await listReviews({ workspace_id: 'ws_1' })
    expect(reviews).toHaveLength(2)
  })

  it('filters by status', async () => {
    const r = await createReview({ workspace_id: 'ws_1', project_id: 'proj_1', target_type: 'task', target_id: 't1' })
    await createReview({ workspace_id: 'ws_1', project_id: 'proj_1', target_type: 'task', target_id: 't2' })
    await updateReview({ review_id: r.review_id, workspace_id: 'ws_1', status: 'approved' })
    const pending = await listReviews({ workspace_id: 'ws_1', status: 'pending' })
    const approved = await listReviews({ workspace_id: 'ws_1', status: 'approved' })
    expect(pending).toHaveLength(1)
    expect(approved).toHaveLength(1)
  })

  it('filters by target_id', async () => {
    await createReview({ workspace_id: 'ws_1', project_id: 'proj_1', target_type: 'task', target_id: 'task_1' })
    await createReview({ workspace_id: 'ws_1', project_id: 'proj_1', target_type: 'task', target_id: 'task_2' })
    const results = await listReviews({ workspace_id: 'ws_1', target_id: 'task_1' })
    expect(results).toHaveLength(1)
    expect(results[0].target_id).toBe('task_1')
  })

  it('filters by reviewer_agent_id', async () => {
    await createReview({ workspace_id: 'ws_1', project_id: 'proj_1', target_type: 'task', target_id: 't1', reviewer_agent_id: 'agent_1' })
    await createReview({ workspace_id: 'ws_1', project_id: 'proj_1', target_type: 'task', target_id: 't2' })
    const results = await listReviews({ workspace_id: 'ws_1', reviewer_agent_id: 'agent_1' })
    expect(results).toHaveLength(1)
    expect(results[0].reviewer_agent_id).toBe('agent_1')
  })

  it('does not return reviews from a different workspace', async () => {
    const db = (await import('@moabualruz/fulcrum-core')).getDb()
    db.prepare("INSERT INTO workspaces (workspace_id, name) VALUES ('ws_2','ws2')").run()
    db.prepare("INSERT INTO projects (project_id, workspace_id, name) VALUES ('proj_2','ws_2','p2')").run()
    await createReview({ workspace_id: 'ws_1', project_id: 'proj_1', target_type: 'task', target_id: 't1' })
    await createReview({ workspace_id: 'ws_2', project_id: 'proj_2', target_type: 'task', target_id: 't2' })
    const results = await listReviews({ workspace_id: 'ws_1' })
    expect(results).toHaveLength(1)
    expect(results[0].workspace_id).toBe('ws_1')
  })

  it('respects the limit parameter', async () => {
    await createReview({ workspace_id: 'ws_1', project_id: 'proj_1', target_type: 'task', target_id: 't1' })
    await createReview({ workspace_id: 'ws_1', project_id: 'proj_1', target_type: 'task', target_id: 't2' })
    await createReview({ workspace_id: 'ws_1', project_id: 'proj_1', target_type: 'task', target_id: 't3' })
    const results = await listReviews({ workspace_id: 'ws_1', limit: 2 })
    expect(results).toHaveLength(2)
  })
})

describe('status transitions', () => {
  it('pending → approved', async () => {
    const r = await createReview({ workspace_id: 'ws_1', project_id: 'proj_1', target_type: 'task', target_id: 't1' })
    expect(r.status).toBe('pending')
    const updated = await updateReview({ review_id: r.review_id, workspace_id: 'ws_1', status: 'approved' })
    expect(updated.status).toBe('approved')
  })

  it('pending → rejected', async () => {
    const r = await createReview({ workspace_id: 'ws_1', project_id: 'proj_1', target_type: 'task', target_id: 't1' })
    const updated = await updateReview({ review_id: r.review_id, workspace_id: 'ws_1', status: 'rejected' })
    expect(updated.status).toBe('rejected')
  })

  it('pending → changes_requested', async () => {
    const r = await createReview({ workspace_id: 'ws_1', project_id: 'proj_1', target_type: 'task', target_id: 't1' })
    const updated = await updateReview({ review_id: r.review_id, workspace_id: 'ws_1', status: 'changes_requested' })
    expect(updated.status).toBe('changes_requested')
  })

  it('changes_requested → approved (re-review flow)', async () => {
    const r = await createReview({ workspace_id: 'ws_1', project_id: 'proj_1', target_type: 'task', target_id: 't1' })
    await updateReview({ review_id: r.review_id, workspace_id: 'ws_1', status: 'changes_requested' })
    const final = await updateReview({ review_id: r.review_id, workspace_id: 'ws_1', status: 'approved' })
    expect(final.status).toBe('approved')
  })
})
