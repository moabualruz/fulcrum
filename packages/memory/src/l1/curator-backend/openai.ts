// packages/memory/src/l1/curator-backend/openai.ts
//
// Memory v3 PR 3 unit 3.4 — OpenAI Structured Outputs backend.
//
// POST /v1/chat/completions with `response_format.json_schema.strict:true`
// and top-level `reasoning_effort`. Contract verified via ctx7 against the
// public developers.openai.com docs (migrate-to-responses + structured-
// outputs). The Chat Completions endpoint is a stable surface for the
// GPT-5 family and supports every field the plan needs: strict schema,
// reasoning_effort, and (optionally) verbosity.
//
// Constraint §16: OPENAI_API_KEY comes from env only, never from project-
// local files. The key never lands in any log, error string, or telemetry
// emitted by this module — `redactCredentials` cleans the response body on
// non-2xx paths before it is included in the thrown Error.

import type {
  CuratorBackend,
  CuratorBackendInput,
  CuratorBackendResult,
} from '../curator.js'

const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/chat/completions'

function endpoint(): string {
  return process.env['FULCRUM_CURATOR_OPENAI_BASE_URL'] ?? DEFAULT_ENDPOINT
}

function redactCredentials(s: string): string {
  return s
    .replaceAll(/\bsk-(?:proj-)?[A-Za-z0-9_-]{10,}/g, 'sk-<redacted>')
    .replaceAll(/Bearer [A-Za-z0-9_\-.=]+/g, 'Bearer <redacted>')
    .replaceAll(/"api_key"\s*:\s*"[^"]+"/g, '"api_key":"<redacted>"')
}

export async function isOpenAIAvailable(): Promise<boolean> {
  const key = process.env['OPENAI_API_KEY']
  return typeof key === 'string' && key.length > 0
}

interface OpenAIChatCompletionsResponse {
  choices?: Array<{ message?: { role?: string; content?: string; refusal?: string | null } }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number }
  }
}

export async function invokeOpenAI(
  input: CuratorBackendInput,
): Promise<CuratorBackendResult> {
  const apiKey = process.env['OPENAI_API_KEY']
  if (!apiKey || apiKey.length === 0) {
    throw new Error('OPENAI_API_KEY not set — cannot invoke OpenAI curator backend')
  }

  const body = {
    model: input.model,
    messages: [{ role: 'user', content: input.prompt }],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'CuratorOutput',
        strict: true,
        schema: input.schema,
      },
    },
    reasoning_effort: input.reasoning,
  }

  const controller = new AbortController()
  let timer: NodeJS.Timeout | null = null
  if (input.timeout_ms && input.timeout_ms > 0) {
    timer = setTimeout(() => controller.abort(), input.timeout_ms)
  }

  const started = Date.now()
  let response: Response
  try {
    response = await fetch(endpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    if (timer) clearTimeout(timer)
    const msg = err instanceof Error ? err.message : String(err)
    if ((err as { name?: string }).name === 'AbortError' || /abort/i.test(msg)) {
      throw new Error(`OpenAI curator call timed out after ${input.timeout_ms}ms`)
    }
    throw new Error(`OpenAI curator call failed: ${redactCredentials(msg)}`)
  } finally {
    if (timer) clearTimeout(timer)
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `OpenAI curator call returned ${response.status}: ${redactCredentials(text).slice(0, 400)}`,
    )
  }

  const json = (await response.json()) as OpenAIChatCompletionsResponse
  const content = json.choices?.[0]?.message?.content
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error('OpenAI curator call returned empty message content')
  }

  const result: CuratorBackendResult = {
    raw_text: content,
    backend: 'openai',
    model: input.model,
    duration_ms: Date.now() - started,
  }
  const usage = json.usage
  if (usage) {
    const mapped: NonNullable<CuratorBackendResult['usage']> = {}
    if (typeof usage.prompt_tokens === 'number') mapped.input_tokens = usage.prompt_tokens
    if (typeof usage.prompt_tokens_details?.cached_tokens === 'number') {
      mapped.cached_input_tokens = usage.prompt_tokens_details.cached_tokens
    }
    if (typeof usage.completion_tokens === 'number') mapped.output_tokens = usage.completion_tokens
    if (Object.keys(mapped).length > 0) result.usage = mapped
  }
  return result
}

export const openaiBackend: CuratorBackend = {
  name: 'openai',
  isAvailable: isOpenAIAvailable,
  curate: invokeOpenAI,
}
