// packages/memory/src/tests/l1-curator-backend-openai.test.ts
//
// Memory v3 PR 3 unit 3.4 — OpenAI Structured Outputs backend.
//
// Tests run against a local HTTP server that mimics the chat completions
// endpoint. `FULCRUM_CURATOR_OPENAI_BASE_URL` points the backend at it; no
// real network call is made. Contract verified against the OpenAI docs
// (ctx7 /websites/developers_openai_api — POST /v1/chat/completions with
// `response_format.json_schema.strict:true` + top-level `reasoning_effort`).

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServer, type Server, type IncomingMessage } from 'http'
import { openaiBackend, invokeOpenAI } from '../l1/curator-backend/openai.js'
import type { CuratorBackendInput } from '../l1/curator.js'

let server: Server
let capturedRequest: { headers?: Record<string, unknown>; body?: Record<string, unknown>; method?: string; url?: string } = {}
let prevApiKey: string | undefined
let prevBaseUrl: string | undefined

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let buf = ''
    req.on('data', (chunk) => (buf += chunk.toString('utf-8')))
    req.on('end', () => resolve(buf))
  })
}

function startServer(
  responder: (req: IncomingMessage, body: string) => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>,
): Promise<void> {
  return new Promise((resolve) => {
    server = createServer(async (req, res) => {
      const body = await readBody(req)
      capturedRequest = {
        method: req.method ?? 'POST',
        url: req.url ?? '',
        headers: { ...req.headers },
      }
      try {
        capturedRequest.body = JSON.parse(body) as Record<string, unknown>
      } catch {
        capturedRequest.body = undefined
      }
      const { status, body: respBody } = await responder(req, body)
      res.statusCode = status
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(respBody))
    })
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      process.env['FULCRUM_CURATOR_OPENAI_BASE_URL'] = `http://127.0.0.1:${port}/v1/chat/completions`
      resolve()
    })
  })
}

function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (!server) return resolve()
    server.close(() => resolve())
  })
}

beforeEach(() => {
  prevApiKey = process.env['OPENAI_API_KEY']
  prevBaseUrl = process.env['FULCRUM_CURATOR_OPENAI_BASE_URL']
  capturedRequest = {}
})

afterEach(async () => {
  if (prevApiKey === undefined) delete process.env['OPENAI_API_KEY']
  else process.env['OPENAI_API_KEY'] = prevApiKey
  if (prevBaseUrl === undefined) delete process.env['FULCRUM_CURATOR_OPENAI_BASE_URL']
  else process.env['FULCRUM_CURATOR_OPENAI_BASE_URL'] = prevBaseUrl
  await stopServer()
})

function baseInput(overrides: Partial<CuratorBackendInput> = {}): CuratorBackendInput {
  return {
    task: 'extraction',
    model: 'gpt-5-mini',
    reasoning: 'minimal',
    prompt: '<task>curate</task>',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['ok'],
      properties: { ok: { type: 'boolean' } },
    },
    ...overrides,
  }
}

describe('openaiBackend.isAvailable', () => {
  it('returns true when OPENAI_API_KEY is set', async () => {
    process.env['OPENAI_API_KEY'] = 'sk-test'
    expect(await openaiBackend.isAvailable()).toBe(true)
  })

  it('returns false when OPENAI_API_KEY is missing', async () => {
    delete process.env['OPENAI_API_KEY']
    expect(await openaiBackend.isAvailable()).toBe(false)
  })

  it('returns false when OPENAI_API_KEY is empty', async () => {
    process.env['OPENAI_API_KEY'] = ''
    expect(await openaiBackend.isAvailable()).toBe(false)
  })
})

describe('openaiBackend.curate — request shape', () => {
  beforeEach(async () => {
    process.env['OPENAI_API_KEY'] = 'sk-test-shape'
    await startServer(() => ({
      status: 200,
      body: {
        choices: [{ message: { role: 'assistant', content: '{"ok":true}' } }],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 20,
          total_tokens: 120,
          prompt_tokens_details: { cached_tokens: 40 },
        },
      },
    }))
  })

  it('POSTs to the chat completions endpoint with Bearer auth', async () => {
    await invokeOpenAI(baseInput())
    expect(capturedRequest.method).toBe('POST')
    expect(capturedRequest.url).toContain('/v1/chat/completions')
    expect((capturedRequest.headers as Record<string, string>)['authorization']).toBe('Bearer sk-test-shape')
  })

  it('sends the prompt as a user message', async () => {
    await invokeOpenAI(baseInput({ prompt: 'HELLO_PROMPT' }))
    const messages = (capturedRequest.body as { messages: { role: string; content: string }[] }).messages
    expect(messages).toHaveLength(1)
    expect(messages[0]!.role).toBe('user')
    expect(messages[0]!.content).toBe('HELLO_PROMPT')
  })

  it('sends model + reasoning_effort + response_format.json_schema.strict', async () => {
    await invokeOpenAI(baseInput({ model: 'gpt-5', reasoning: 'medium' }))
    const body = capturedRequest.body as Record<string, unknown>
    expect(body['model']).toBe('gpt-5')
    expect(body['reasoning_effort']).toBe('medium')
    const rf = body['response_format'] as Record<string, unknown>
    expect(rf['type']).toBe('json_schema')
    const js = rf['json_schema'] as Record<string, unknown>
    expect(js['strict']).toBe(true)
    expect(js['name']).toBe('CuratorOutput')
    expect(js['schema']).toEqual(
      expect.objectContaining({ type: 'object', properties: expect.any(Object) }),
    )
  })
})

describe('openaiBackend.curate — response parsing', () => {
  it('extracts raw_text from choices[0].message.content', async () => {
    process.env['OPENAI_API_KEY'] = 'sk-test'
    await startServer(() => ({
      status: 200,
      body: {
        choices: [{ message: { role: 'assistant', content: '{"ok":true,"answer":42}' } }],
        usage: {},
      },
    }))
    const out = await invokeOpenAI(baseInput())
    expect(out.raw_text).toBe('{"ok":true,"answer":42}')
    expect(out.backend).toBe('openai')
    expect(out.model).toBe('gpt-5-mini')
  })

  it('maps usage.prompt_tokens → input_tokens + prompt_tokens_details.cached_tokens → cached_input_tokens', async () => {
    process.env['OPENAI_API_KEY'] = 'sk-test'
    await startServer(() => ({
      status: 200,
      body: {
        choices: [{ message: { role: 'assistant', content: '{"ok":true}' } }],
        usage: {
          prompt_tokens: 150,
          completion_tokens: 30,
          total_tokens: 180,
          prompt_tokens_details: { cached_tokens: 50 },
        },
      },
    }))
    const out = await invokeOpenAI(baseInput())
    expect(out.usage).toEqual({ input_tokens: 150, cached_input_tokens: 50, output_tokens: 30 })
  })

  it('rejects when response is missing choices[0].message.content', async () => {
    process.env['OPENAI_API_KEY'] = 'sk-test'
    await startServer(() => ({
      status: 200,
      body: { choices: [], usage: {} },
    }))
    await expect(invokeOpenAI(baseInput())).rejects.toThrow(/empty|missing|no.*content/i)
  })

  it('rejects with redacted body on non-2xx', async () => {
    process.env['OPENAI_API_KEY'] = 'sk-fail'
    await startServer(() => ({
      status: 401,
      body: {
        error: {
          message: 'Incorrect API key provided: sk-proj-abcdef1234567890',
          type: 'invalid_request_error',
        },
      },
    }))
    const err = await invokeOpenAI(baseInput()).catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/401/)
    // Credential in the body must be redacted before it surfaces.
    expect((err as Error).message).not.toMatch(/sk-proj-abcdef/)
  })
})

describe('openaiBackend.curate — secrets + safety', () => {
  it('throws with an install-guidance message when OPENAI_API_KEY is missing', async () => {
    delete process.env['OPENAI_API_KEY']
    await expect(invokeOpenAI(baseInput())).rejects.toThrow(/OPENAI_API_KEY/)
  })

  it('does not include the API key in its error messages', async () => {
    process.env['OPENAI_API_KEY'] = 'sk-super-secret-key-value'
    await startServer(() => ({
      status: 500,
      body: { error: { message: 'internal error' } },
    }))
    const err = await invokeOpenAI(baseInput()).catch((e: Error) => e)
    expect((err as Error).message).not.toContain('sk-super-secret-key-value')
  })

  it('respects timeout_ms and aborts', async () => {
    process.env['OPENAI_API_KEY'] = 'sk-test'
    await startServer(
      () =>
        new Promise(() => {
          // Never respond.
        }),
    )
    await expect(
      invokeOpenAI(baseInput({ timeout_ms: 150 })),
    ).rejects.toThrow(/timed out|timeout|abort/i)
  }, 5000)
})
