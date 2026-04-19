// packages/memory/src/tests/vault-formatter.test.ts
import { describe, it, expect } from 'vitest'
import { serializeToFile, parseFromFile } from '../vault/formatter.js'
import type { FullMemory } from '../types.js'

const baseMemory: FullMemory = {
  memory_id: '01JBXK7Z9T8QH0F3VRDE5W2NPM',
  scope: 'project',
  kind: 'decision',
  workspace_id: 'ws_test',
  project_id: 'proj_test',
  file_path: null,
  symbol_path: null,
  title: 'Use Kuzu for L2',
  summary: 'Chose Kuzu for embeddability',
  content: 'Chose Kuzu for embeddability',
  tags: ['architecture', 'kuzu'],
  entities: ['[[component/kuzu]]'],
  confidence: 0.9,
  freshness: 1.0,
  importance: 0.8,
  access_count: 0,
  event_time: null,
  content_hash: 'sha256:abc123',
  task_id: null,
  issue_id: null,
  artifact_id: null,
  provenance_refs: [],
  created_at: '2026-04-14T10:00:00Z',
  updated_at: '2026-04-14T10:00:00Z',
  last_accessed_at: '2026-04-14T10:00:00Z',
}

describe('serializeToFile', () => {
  it('produces valid markdown with frontmatter', () => {
    const result = serializeToFile(baseMemory, 'This is the body text.')
    expect(result).toContain('---')
    expect(result).toContain('id: 01JBXK7Z9T8QH0F3VRDE5W2NPM')
    expect(result).toContain('kind: decision')
    expect(result).toContain('workspace_id: ws_test')
    expect(result).toContain('This is the body text.')
  })

  it('omits null optional fields', () => {
    const result = serializeToFile(baseMemory, 'body')
    expect(result).not.toContain('file_path:')
    expect(result).not.toContain('task_id:')
    expect(result).not.toContain('event_time:')
  })

  it('omits empty arrays', () => {
    const m = { ...baseMemory, tags: [], entities: [], provenance_refs: [] }
    const result = serializeToFile(m, 'body')
    expect(result).not.toContain('tags:')
    expect(result).not.toContain('entities:')
    expect(result).not.toContain('provenance_refs:')
  })
})

describe('parseFromFile', () => {
  it('round-trips through serialize → parse', () => {
    const serialized = serializeToFile(baseMemory, 'Round-trip body.')
    const { frontmatter, body } = parseFromFile(serialized)
    expect(frontmatter.id).toBe('01JBXK7Z9T8QH0F3VRDE5W2NPM')
    expect(frontmatter.schema).toBe('fulcrum.memory/v1')
    expect(frontmatter.kind).toBe('decision')
    expect(frontmatter.workspace_id).toBe('ws_test')
    expect(frontmatter.title).toBe('Use Kuzu for L2')
    expect(body).toBe('Round-trip body.')
  })

  it('throws on missing required field id', () => {
    const bad = '---\nschema: fulcrum.memory/v1\nkind: fact\nscope: global\nworkspace_id: ws\ntitle: T\n---\nbody'
    expect(() => parseFromFile(bad)).toThrow('missing required field: id')
  })

  it('throws on missing title', () => {
    const bad = '---\nid: 01JBX\nschema: fulcrum.memory/v1\nkind: fact\nscope: global\nworkspace_id: ws\n---\nbody'
    expect(() => parseFromFile(bad)).toThrow('missing required field: title')
  })
})
