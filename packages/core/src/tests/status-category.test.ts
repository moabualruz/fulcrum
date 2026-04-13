import { describe, it, expect } from 'vitest'
import { statusCategory } from '../status-category.js'

describe('statusCategory', () => {
  it('maps queued → backlog', () => { expect(statusCategory('queued')).toBe('backlog') })
  it('maps ready → backlog', () => { expect(statusCategory('ready')).toBe('backlog') })
  it('maps backlog → backlog', () => { expect(statusCategory('backlog')).toBe('backlog') })
  it('maps draft → backlog', () => { expect(statusCategory('draft')).toBe('backlog') })
  it('maps never_synced → backlog', () => { expect(statusCategory('never_synced')).toBe('backlog') })

  it('maps claimed → active', () => { expect(statusCategory('claimed')).toBe('active') })
  it('maps running → active', () => { expect(statusCategory('running')).toBe('active') })
  it('maps starting → active', () => { expect(statusCategory('starting')).toBe('active') })
  it('maps waiting → active', () => { expect(statusCategory('waiting')).toBe('active') })
  it('maps in_progress → active', () => { expect(statusCategory('in_progress')).toBe('active') })
  it('maps in_review → active', () => { expect(statusCategory('in_review')).toBe('active') })
  it('maps syncing → active', () => { expect(statusCategory('syncing')).toBe('active') })
  it('maps created → active', () => { expect(statusCategory('created')).toBe('active') })

  it('maps blocked → blocked', () => { expect(statusCategory('blocked')).toBe('blocked') })
  it('maps waiting_input → blocked', () => { expect(statusCategory('waiting_input')).toBe('blocked') })
  it('maps waiting_dependency → blocked', () => { expect(statusCategory('waiting_dependency')).toBe('blocked') })
  it('maps conflicted → blocked', () => { expect(statusCategory('conflicted')).toBe('blocked') })

  it('maps completed → done', () => { expect(statusCategory('completed')).toBe('done') })
  it('maps done → done', () => { expect(statusCategory('done')).toBe('done') })
  it('maps finished → done', () => { expect(statusCategory('finished')).toBe('done') })
  it('maps cancelled → done', () => { expect(statusCategory('cancelled')).toBe('done') })
  it('maps failed → done', () => { expect(statusCategory('failed')).toBe('done') })
  it('maps aborted → done', () => { expect(statusCategory('aborted')).toBe('done') })
  it('maps archived → done', () => { expect(statusCategory('archived')).toBe('done') })
  it('maps approved → done', () => { expect(statusCategory('approved')).toBe('done') })
  it('maps merged → done', () => { expect(statusCategory('merged')).toBe('done') })
  it('maps discarded → done', () => { expect(statusCategory('discarded')).toBe('done') })

  it('maps unknown status → active (safe default)', () => {
    expect(statusCategory('some_future_status')).toBe('active')
  })
})
