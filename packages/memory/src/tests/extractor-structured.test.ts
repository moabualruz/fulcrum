// packages/memory/src/tests/extractor-structured.test.ts
import { describe, it, expect } from 'vitest'
import { extractStructured } from '../extractors/structured.js'

describe('extractStructured', () => {
  it('extracts wikilinks with type/name format', () => {
    const mentions = extractStructured('Use [[technology/rust]] for performance.', {})
    expect(mentions).toHaveLength(1)
    expect(mentions[0]!.type).toBe('technology')
    expect(mentions[0]!.canonical).toBe('rust')
    expect(mentions[0]!.edgeType).toBe('MENTIONS')
    expect(mentions[0]!.confidence).toBeGreaterThanOrEqual(0.8)
  })

  it('extracts plain wikilinks as concept type', () => {
    const mentions = extractStructured('[[ownership]] is important.', {})
    expect(mentions[0]!.type).toBe('concept')
    expect(mentions[0]!.canonical).toBe('ownership')
  })

  it('extracts tsk_ prefixed IDs as task type', () => {
    const mentions = extractStructured('See tsk_01JBXABC for context.', {})
    const task = mentions.find(m => m.type === 'task')
    expect(task).toBeDefined()
    expect(task!.canonical).toBe('tsk_01jbxabc')
  })

  it('extracts run_ prefixed IDs as run type', () => {
    const mentions = extractStructured('run_xyz123 produced this.', {})
    const run = mentions.find(m => m.type === 'run')
    expect(run).toBeDefined()
  })

  it('extracts file paths ending in .ts', () => {
    const mentions = extractStructured('See src/vault/client.ts for impl.', {})
    const file = mentions.find(m => m.type === 'file')
    expect(file).toBeDefined()
    expect(file!.canonical).toContain('client.ts')
  })

  it('emits PRODUCED_IN edge for task_id in context', () => {
    const mentions = extractStructured('Some content.', { task_id: 'tsk_abc123' })
    const edge = mentions.find(m => m.edgeType === 'PRODUCED_IN')
    expect(edge).toBeDefined()
    expect(edge!.canonical).toBe('tsk_abc123')
    expect(edge!.confidence).toBe(1.0)
  })

  it('emits PRODUCED_IN for both task_id and run_id', () => {
    const mentions = extractStructured('body', { task_id: 'tsk_1', run_id: 'run_2' })
    const producedIn = mentions.filter(m => m.edgeType === 'PRODUCED_IN')
    expect(producedIn).toHaveLength(2)
  })

  it('deduplicates identical mentions', () => {
    const mentions = extractStructured('[[technology/rust]] and [[technology/rust]] again.', {})
    const rustMentions = mentions.filter(m => m.canonical === 'rust')
    expect(rustMentions).toHaveLength(1)
  })

  it('returns empty array for content with no patterns', () => {
    const mentions = extractStructured('Just plain text here.', {})
    expect(mentions).toHaveLength(0)
  })

  it('extracts mem_ prefixed IDs as concept type', () => {
    const mentions = extractStructured('See mem_01ABC for details.', {})
    const memory = mentions.find(m => m.type === 'concept' && m.canonical.startsWith('mem_'))
    expect(memory).toBeDefined()
    expect(memory!.canonical).toBe('mem_01abc')
  })

  it('extracts file_ prefixed IDs as file type', () => {
    const mentions = extractStructured('Check file_src_lib_ts for the handler.', {})
    const file = mentions.find(m => m.type === 'file' && m.canonical.startsWith('file_'))
    expect(file).toBeDefined()
    expect(file!.canonical).toBe('file_src_lib_ts')
  })
})
