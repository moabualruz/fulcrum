import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb, resetTestDb, seedWorkspaceAndProject } from './helpers.js'
import { classifyVectorMetadata, writeVectorMetadata } from '../l2/vector-metadata.js'

beforeEach(() => {
  const db = createTestDb()
  seedWorkspaceAndProject(db)
})

afterEach(() => {
  resetTestDb()
})

describe('vector metadata freshness classification', () => {
  it('classifies missing metadata as legacy, exact matches as current, and mixed model/hash rows as stale', () => {
    expect(classifyVectorMetadata({
      workspace_id: 'ws_1',
      source_domain: 'memory',
      source_id: 'mem_1',
      content_hash: 'hash-a',
      provider: 'local',
      model: 'model-a',
      requested_device: 'auto',
      dimensions: 1024,
    })).toBe('legacy')

    writeVectorMetadata({
      workspace_id: 'ws_1',
      source_domain: 'memory',
      source_id: 'mem_1',
      content_hash: 'hash-a',
      provider: 'local',
      model: 'model-a',
      requested_device: 'auto',
      actual_device: 'cpu',
      dimensions: 1024,
      vector_table: 'vec_memories',
      status: 'current',
    })

    expect(classifyVectorMetadata({
      workspace_id: 'ws_1',
      source_domain: 'memory',
      source_id: 'mem_1',
      content_hash: 'hash-a',
      provider: 'local',
      model: 'model-a',
      requested_device: 'auto',
      dimensions: 1024,
    })).toBe('current')

    expect(classifyVectorMetadata({
      workspace_id: 'ws_1',
      source_domain: 'memory',
      source_id: 'mem_1',
      content_hash: 'hash-a',
      provider: 'local',
      model: 'model-a',
      requested_device: 'cuda',
      dimensions: 1024,
    })).toBe('stale')

    expect(classifyVectorMetadata({
      workspace_id: 'ws_1',
      source_domain: 'memory',
      source_id: 'mem_1',
      content_hash: 'hash-a',
      provider: 'local',
      model: 'model-b',
      requested_device: 'auto',
      dimensions: 1024,
    })).toBe('stale')

    expect(classifyVectorMetadata({
      workspace_id: 'ws_1',
      source_domain: 'memory',
      source_id: 'mem_1',
      content_hash: 'hash-b',
      provider: 'local',
      model: 'model-a',
      requested_device: 'auto',
      dimensions: 1024,
    })).toBe('stale')
  })

  it('classifies the latest exact failed attempt without hiding unrelated current vectors', () => {
    writeVectorMetadata({
      workspace_id: 'ws_1',
      source_domain: 'memory',
      source_id: 'mem_2',
      content_hash: 'hash-a',
      provider: 'local',
      model: 'model-a',
      requested_device: 'auto',
      actual_device: 'cpu',
      dimensions: 1024,
      vector_table: 'vec_memories',
      status: 'current',
    })
    writeVectorMetadata({
      workspace_id: 'ws_1',
      source_domain: 'memory',
      source_id: 'mem_2',
      content_hash: 'hash-a',
      provider: 'local',
      model: 'model-b',
      requested_device: 'auto',
      dimensions: 1024,
      vector_table: 'vec_memories',
      status: 'failed',
      error_message: 'model-b failed',
    })

    expect(classifyVectorMetadata({
      workspace_id: 'ws_1',
      source_domain: 'memory',
      source_id: 'mem_2',
      content_hash: 'hash-a',
      provider: 'local',
      model: 'model-b',
      requested_device: 'auto',
      dimensions: 1024,
    })).toBe('failed')

    expect(classifyVectorMetadata({
      workspace_id: 'ws_1',
      source_domain: 'memory',
      source_id: 'mem_2',
      content_hash: 'hash-a',
      provider: 'local',
      model: 'model-a',
      requested_device: 'auto',
      dimensions: 1024,
    })).toBe('current')
  })
})
