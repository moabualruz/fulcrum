// packages/memory/src/tests/extractor-semantic.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { extractSemantic } from '../extractors/semantic.js'

const VALID_CONTENT = 'TypeScript is a statically typed language that extends JavaScript. It prevents type errors and recommends strict mode for large projects.'

function makeMockResponse(body: object, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: async () => body,
  } as unknown as Response
}

function makeAnthropicResponse(llmJson: object): object {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(llmJson),
      },
    ],
  }
}

describe('extractSemantic', () => {
  let originalApiKey: string | undefined
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    originalApiKey = process.env.ANTHROPIC_API_KEY
    originalFetch = global.fetch
  })

  afterEach(() => {
    if (originalApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY
    } else {
      process.env.ANTHROPIC_API_KEY = originalApiKey
    }
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('returns [] when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy

    const result = await extractSemantic('mem_001', VALID_CONTENT, 'ws_test')

    expect(result).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns [] when content is shorter than 50 characters', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key'
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy

    const result = await extractSemantic('mem_001', 'short text', 'ws_test')

    expect(result).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns [] when content is empty', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key'
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy

    const result = await extractSemantic('mem_001', '', 'ws_test')

    expect(result).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns entities from a valid API response', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key'

    const llmPayload = {
      entities: [
        { name: 'TypeScript', type: 'technology', description: 'statically typed language' },
        { name: 'JavaScript', type: 'technology', description: 'dynamic scripting language' },
        { name: 'strict mode', type: 'concept', description: 'TypeScript strict compilation option' },
      ],
      relationships: [
        { subject: 'TypeScript', predicate: 'ABOUT', object: 'JavaScript' },
        { subject: 'TypeScript', predicate: 'RECOMMENDS', object: 'strict mode' },
      ],
    }

    global.fetch = vi.fn().mockResolvedValue(
      makeMockResponse(makeAnthropicResponse(llmPayload))
    )

    const result = await extractSemantic('mem_001', VALID_CONTENT, 'ws_test')

    expect(result.length).toBeGreaterThan(0)
    expect(result.every(e => e.fromId === 'mem_001')).toBe(true)
    expect(result.every(e => e.source === 'llm')).toBe(true)
    expect(result.every(e => e.confidence > 0)).toBe(true)

    const edgeTypes = result.map(e => e.edgeType)
    expect(edgeTypes).toContain('ABOUT')
    expect(edgeTypes).toContain('RECOMMENDS')
  })

  it('returns [] when API returns a non-OK status', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key'

    global.fetch = vi.fn().mockResolvedValue(
      makeMockResponse({ error: { message: 'Unauthorized' } }, 401)
    )

    const result = await extractSemantic('mem_001', VALID_CONTENT, 'ws_test')

    expect(result).toEqual([])
  })

  it('returns [] when API call throws a network error', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key'

    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const result = await extractSemantic('mem_001', VALID_CONTENT, 'ws_test')

    expect(result).toEqual([])
  })

  it('returns [] when API returns invalid JSON', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key'

    global.fetch = vi.fn().mockResolvedValue(
      makeMockResponse({
        content: [{ type: 'text', text: 'not valid json at all' }],
      })
    )

    const result = await extractSemantic('mem_001', VALID_CONTENT, 'ws_test')

    expect(result).toEqual([])
  })

  it('returns [] when API response has no relationships', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key'

    const llmPayload = {
      entities: [
        { name: 'TypeScript', type: 'technology', description: 'typed language' },
      ],
      relationships: [],
    }

    global.fetch = vi.fn().mockResolvedValue(
      makeMockResponse(makeAnthropicResponse(llmPayload))
    )

    const result = await extractSemantic('mem_001', VALID_CONTENT, 'ws_test')

    expect(result).toEqual([])
  })

  it('filters out relationships with invalid predicate types', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key'

    const llmPayload = {
      entities: [
        { name: 'TypeScript', type: 'technology', description: 'typed language' },
        { name: 'JavaScript', type: 'technology', description: 'dynamic language' },
      ],
      relationships: [
        { subject: 'TypeScript', predicate: 'INVALID_EDGE', object: 'JavaScript' },
        { subject: 'TypeScript', predicate: 'ABOUT', object: 'JavaScript' },
      ],
    }

    global.fetch = vi.fn().mockResolvedValue(
      makeMockResponse(makeAnthropicResponse(llmPayload))
    )

    const result = await extractSemantic('mem_001', VALID_CONTENT, 'ws_test')

    // Only the valid ABOUT edge should be returned
    expect(result.every(e => ['ABOUT', 'CRITIQUES', 'RECOMMENDS', 'AVOIDS', 'CAUSES', 'PREVENTS'].includes(e.edgeType))).toBe(true)
    expect(result.some(e => e.edgeType === 'ABOUT')).toBe(true)
  })

  it('handles LLM response wrapped in markdown code blocks', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key'

    const llmPayload = {
      entities: [
        { name: 'TypeScript', type: 'technology', description: 'typed language' },
        { name: 'strict mode', type: 'concept', description: 'strict compilation' },
      ],
      relationships: [
        { subject: 'TypeScript', predicate: 'RECOMMENDS', object: 'strict mode' },
      ],
    }

    const wrappedText = `Here is the extraction:\n\`\`\`json\n${JSON.stringify(llmPayload)}\n\`\`\``

    global.fetch = vi.fn().mockResolvedValue(
      makeMockResponse({
        content: [{ type: 'text', text: wrappedText }],
      })
    )

    const result = await extractSemantic('mem_001', VALID_CONTENT, 'ws_test')

    expect(result.length).toBeGreaterThan(0)
    expect(result[0]!.edgeType).toBe('RECOMMENDS')
  })

  it('sends correct headers to Anthropic API', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test-key-123'

    const llmPayload = {
      entities: [
        { name: 'TypeScript', type: 'technology', description: 'typed' },
        { name: 'JavaScript', type: 'technology', description: 'dynamic' },
      ],
      relationships: [
        { subject: 'TypeScript', predicate: 'ABOUT', object: 'JavaScript' },
      ],
    }

    const fetchSpy = vi.fn().mockResolvedValue(
      makeMockResponse(makeAnthropicResponse(llmPayload))
    )
    global.fetch = fetchSpy

    await extractSemantic('mem_001', VALID_CONTENT, 'ws_test')

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    const headers = options.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('sk-test-key-123')
    expect(headers['anthropic-version']).toBe('2023-06-01')
    expect(headers['content-type']).toBe('application/json')
  })
})
