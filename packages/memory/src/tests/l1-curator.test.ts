// packages/memory/src/tests/l1-curator.test.ts
//
// Memory v3 PR 3 unit 3.1 — curator prompt + parser + dispatcher.
//
// These tests cover the curator runtime that is backend-independent:
//   - composePrompt delimits L0 bodies via <USER_CONTENT> (constraint §14)
//     and correction entries via <AGENT_CORRECTION>.
//   - getOutputSchema is a strict JSON Schema (additionalProperties:false,
//     required listed for every object).
//   - parseCuratorOutput enforces Constraint #15 (curator sources must live
//     in the input batch) as a defense-in-depth gate before the apply-layer.
//   - selectBackend honors the env override + fallback order from the plan
//     (§L0→L1 curation pipeline): codex → pi → openai → anthropic.
//   - runCurator composes, dispatches, and parses end-to-end via a stub
//     backend (no real LLM call).
//
// Backend implementations (3.2-3.4) are registered at import time; this test
// clears the registry and re-registers stubs so it runs in isolation.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  PROMPT_VERSION,
  TASK_DEFAULTS,
  composePrompt,
  getOutputSchema,
  parseCuratorOutput,
  registerBackend,
  clearBackendsForTest,
  selectBackend,
  runCurator,
  type CuratorBackend,
  type CuratorBackendInput,
  type CuratorBackendResult,
  type CuratorInput,
  type CuratorOutput,
} from '../l1/curator.js'

function stubBackend(
  name: 'codex' | 'pi' | 'openai' | 'anthropic',
  opts: {
    available?: boolean
    raw_text?: string
    lastInput?: { input?: CuratorBackendInput }
    throwOnCall?: Error
  } = {},
): CuratorBackend {
  return {
    name,
    async isAvailable() {
      return opts.available ?? true
    },
    async curate(input: CuratorBackendInput): Promise<CuratorBackendResult> {
      if (opts.throwOnCall) throw opts.throwOnCall
      if (opts.lastInput) opts.lastInput.input = input
      return {
        raw_text: opts.raw_text ?? JSON.stringify({
          new_pages: [],
          updates: [],
          supersessions: [],
          new_edges: [],
        }),
        backend: name,
        model: input.model,
        duration_ms: 1,
      }
    },
  }
}

function baseInput(overrides: Partial<CuratorInput> = {}): CuratorInput {
  return {
    task: 'extraction',
    l0_sources: [
      {
        source_id: '01KL0SRC_A',
        source_type: 'bash_trace',
        created_at: '2026-04-18T12:00:00Z',
        body: 'fulcrum memory status\nVault path : /tmp',
      },
    ],
    workspace_id: 'ws_cur',
    project_id: 'proj_cur',
    ...overrides,
  }
}

beforeEach(() => {
  clearBackendsForTest()
  delete process.env['FULCRUM_CURATOR_BACKEND']
  delete process.env['FULCRUM_CURATOR_MODEL']
  delete process.env['FULCRUM_CURATOR_MODEL_EXTRACTION']
  delete process.env['FULCRUM_CURATOR_REASONING']
})

afterEach(() => {
  clearBackendsForTest()
})

describe('PROMPT_VERSION + TASK_DEFAULTS', () => {
  it('exposes a pinned prompt_version string', () => {
    expect(typeof PROMPT_VERSION).toBe('string')
    expect(PROMPT_VERSION).toMatch(/^v\d+\.\d+\.\d+$/)
  })

  it('pins per-task defaults per the plan', () => {
    expect(TASK_DEFAULTS.extraction).toEqual({ model: 'gpt-5-mini', reasoning: 'minimal' })
    expect(TASK_DEFAULTS.consolidation).toEqual({ model: 'gpt-5-nano', reasoning: 'minimal' })
    expect(TASK_DEFAULTS.synthesis).toEqual({ model: 'gpt-5', reasoning: 'medium' })
  })
})

describe('composePrompt', () => {
  it('wraps each L0 body in <USER_CONTENT> with provenance attributes', () => {
    const prompt = composePrompt(baseInput())
    expect(prompt).toContain('<USER_CONTENT source_id="01KL0SRC_A" source_type="bash_trace"')
    expect(prompt).toContain('fulcrum memory status')
    expect(prompt).toContain('</USER_CONTENT>')
  })

  it('is deterministic for the same input', () => {
    const a = composePrompt(baseInput())
    const b = composePrompt(baseInput())
    expect(a).toBe(b)
  })

  it('includes the task tag and the structured-output contract tag', () => {
    const prompt = composePrompt(baseInput())
    expect(prompt).toMatch(/<task>/)
    expect(prompt).toMatch(/<\/task>/)
    expect(prompt).toMatch(/<structured_output_contract>/)
    expect(prompt).toMatch(/<\/structured_output_contract>/)
  })

  it('embeds the relevant page templates verbatim', () => {
    const prompt = composePrompt(baseInput())
    // The plan's entity template is pinned literal text.
    expect(prompt).toContain('type: entity')
    expect(prompt).toContain('schema: fulcrum.memory/v3')
  })

  it('wraps correction entries in <AGENT_CORRECTION>, not <USER_CONTENT>', () => {
    const prompt = composePrompt(
      baseInput({
        corrections: [
          {
            source_id: '01KCORR_A',
            page_id: '01KOLDPAGE_X',
            reason: 'fact Y is wrong',
            original_page_content: '---\nid: 01KOLDPAGE_X\n---\n\n# X\n',
          },
        ],
      }),
    )
    expect(prompt).toContain('<AGENT_CORRECTION')
    expect(prompt).toContain('page_id="01KOLDPAGE_X"')
    expect(prompt).toContain('fact Y is wrong')
    expect(prompt).toContain('</AGENT_CORRECTION>')
  })

  it('includes the workspace_id + project_id for provenance grounding', () => {
    const prompt = composePrompt(baseInput())
    expect(prompt).toContain('ws_cur')
    expect(prompt).toContain('proj_cur')
  })

  it('includes the pinned prompt_version', () => {
    const prompt = composePrompt(baseInput())
    expect(prompt).toContain(PROMPT_VERSION)
  })

  it('passes raw L0 body through unmodified — no re-sanitization at prompt layer', () => {
    const dirty = 'tok=\nAKIA12345 secret-looking line'
    const prompt = composePrompt(
      baseInput({
        l0_sources: [
          {
            source_id: '01KL0SRC_B',
            source_type: 'bash_trace',
            created_at: '2026-04-18T12:00:00Z',
            body: dirty,
          },
        ],
      }),
    )
    expect(prompt).toContain(dirty)
  })
})

describe('getOutputSchema', () => {
  it('returns a JSON-serializable object', () => {
    const schema = getOutputSchema()
    expect(() => JSON.stringify(schema)).not.toThrow()
  })

  it('declares additionalProperties:false on the top-level object', () => {
    const schema = getOutputSchema() as Record<string, unknown>
    expect(schema['type']).toBe('object')
    expect(schema['additionalProperties']).toBe(false)
  })

  it('declares required for all top-level keys', () => {
    const schema = getOutputSchema() as { required: string[] }
    expect(schema.required).toEqual(
      expect.arrayContaining(['new_pages', 'updates', 'supersessions', 'new_edges']),
    )
  })

  it('uses no strict-mode-incompatible JSON Schema keywords (allOf/if/then/else/const/pattern)', () => {
    const serialized = JSON.stringify(getOutputSchema())
    expect(serialized).not.toMatch(/"allOf"/)
    expect(serialized).not.toMatch(/"if"/)
    expect(serialized).not.toMatch(/"then"/)
    expect(serialized).not.toMatch(/"else"/)
    expect(serialized).not.toMatch(/"const"/)
    expect(serialized).not.toMatch(/"pattern"/)
  })
})

describe('parseCuratorOutput', () => {
  it('parses a valid empty payload', () => {
    const raw = JSON.stringify({ new_pages: [], updates: [], supersessions: [], new_edges: [] })
    const out = parseCuratorOutput(raw, baseInput())
    expect(out.new_pages).toEqual([])
  })

  it('parses a full payload with one new_page', () => {
    const raw = JSON.stringify({
      new_pages: [
        {
          type: 'entity',
          name: 'React',
          title: null,
          entity_type: 'library',
          aliases: [],
          confidence: 0.85,
          retention_tier: 'working',
          sources: ['01KL0SRC_A'],
          sources_via: [],
          entities: [],
          body: '# React\n\n[[raw/bash_trace/2026/04/18/01KL0SRC_A]]\n',
        },
      ],
      updates: [],
      supersessions: [],
      new_edges: [],
    })
    const out = parseCuratorOutput(raw, baseInput())
    expect(out.new_pages).toHaveLength(1)
    expect(out.new_pages[0]!.name).toBe('React')
  })

  it('tolerates text before the JSON (markdown fenced output)', () => {
    const raw = '```json\n' +
      JSON.stringify({ new_pages: [], updates: [], supersessions: [], new_edges: [] }) +
      '\n```\n'
    const out = parseCuratorOutput(raw, baseInput())
    expect(out.new_pages).toEqual([])
  })

  it('rejects malformed JSON', () => {
    expect(() => parseCuratorOutput('not json at all', baseInput())).toThrow(/JSON|parse/i)
  })

  it('rejects missing new_pages array', () => {
    const raw = JSON.stringify({ updates: [], supersessions: [], new_edges: [] })
    expect(() => parseCuratorOutput(raw, baseInput())).toThrow(/new_pages/)
  })

  it('rejects new_pages[].sources ULID outside the curator input batch (Constraint #15)', () => {
    const raw = JSON.stringify({
      new_pages: [
        {
          type: 'page',
          name: null,
          title: 'T',
          entity_type: null,
          aliases: null,
          confidence: 0.9,
          retention_tier: 'working',
          sources: ['01KL0SRC_A', '01KL0SRC_FABRICATED'],
          sources_via: [],
          entities: [],
          body: '# T\n\n[[raw/bash_trace/2026/04/18/01KL0SRC_A]]\n',
        },
      ],
      updates: [],
      supersessions: [],
      new_edges: [],
    })
    expect(() => parseCuratorOutput(raw, baseInput())).toThrow(/01KL0SRC_FABRICATED|batch/)
  })

  it('rejects confidence out of [0,1]', () => {
    const raw = JSON.stringify({
      new_pages: [
        {
          type: 'page',
          name: null,
          title: 'T',
          entity_type: null,
          aliases: null,
          confidence: 1.5,
          retention_tier: 'working',
          sources: ['01KL0SRC_A'],
          sources_via: [],
          entities: [],
          body: '# T\n\n[[raw/bash_trace/2026/04/18/01KL0SRC_A]]\n',
        },
      ],
      updates: [],
      supersessions: [],
      new_edges: [],
    })
    expect(() => parseCuratorOutput(raw, baseInput())).toThrow(/confidence/)
  })

  it('rejects invalid page type', () => {
    const raw = JSON.stringify({
      new_pages: [
        {
          type: 'banana',
          confidence: 0.5,
          retention_tier: 'working',
          sources: ['01KL0SRC_A'],
          sources_via: [],
          entities: [],
          body: '# B',
        },
      ],
      updates: [],
      supersessions: [],
      new_edges: [],
    })
    expect(() => parseCuratorOutput(raw, baseInput())).toThrow(/type/)
  })

  it('rejects invalid retention_tier', () => {
    const raw = JSON.stringify({
      new_pages: [
        {
          type: 'page',
          title: 'T',
          confidence: 0.5,
          retention_tier: 'forever',
          sources: ['01KL0SRC_A'],
          sources_via: [],
          entities: [],
          body: '# T',
        },
      ],
      updates: [],
      supersessions: [],
      new_edges: [],
    })
    expect(() => parseCuratorOutput(raw, baseInput())).toThrow(/retention_tier/)
  })

  it('accepts correction source_ids in the allowlist (they are legitimate L0 entries)', () => {
    const input = baseInput({
      corrections: [
        {
          source_id: '01KCORR_X',
          page_id: '01KPAGE_Y',
          reason: 'Z was wrong',
          original_page_content: '',
        },
      ],
    })
    const raw = JSON.stringify({
      new_pages: [
        {
          type: 'page',
          title: 'T',
          confidence: 0.5,
          retention_tier: 'working',
          sources: ['01KCORR_X', '01KL0SRC_A'],
          sources_via: [],
          entities: [],
          body: '# T\n\n[[raw/correction/2026/04/18/01KCORR_X]]\n',
        },
      ],
      updates: [],
      supersessions: [],
      new_edges: [],
    })
    expect(() => parseCuratorOutput(raw, input)).not.toThrow()
  })
})

describe('registry + selectBackend', () => {
  it('honors FULCRUM_CURATOR_BACKEND env override', async () => {
    registerBackend(stubBackend('codex'))
    registerBackend(stubBackend('openai'))
    process.env['FULCRUM_CURATOR_BACKEND'] = 'openai'
    const backend = await selectBackend(baseInput())
    expect(backend.name).toBe('openai')
  })

  it('auto-selects codex first when available', async () => {
    registerBackend(stubBackend('codex', { available: true }))
    registerBackend(stubBackend('pi', { available: true }))
    registerBackend(stubBackend('openai', { available: true }))
    const backend = await selectBackend(baseInput())
    expect(backend.name).toBe('codex')
  })

  it('falls through to pi when codex is unavailable', async () => {
    registerBackend(stubBackend('codex', { available: false }))
    registerBackend(stubBackend('pi', { available: true }))
    registerBackend(stubBackend('openai', { available: true }))
    const backend = await selectBackend(baseInput())
    expect(backend.name).toBe('pi')
  })

  it('falls through to openai when codex + pi unavailable', async () => {
    registerBackend(stubBackend('codex', { available: false }))
    registerBackend(stubBackend('pi', { available: false }))
    registerBackend(stubBackend('openai', { available: true }))
    const backend = await selectBackend(baseInput())
    expect(backend.name).toBe('openai')
  })

  it('falls through to anthropic as the last resort', async () => {
    registerBackend(stubBackend('codex', { available: false }))
    registerBackend(stubBackend('pi', { available: false }))
    registerBackend(stubBackend('openai', { available: false }))
    registerBackend(stubBackend('anthropic', { available: true }))
    const backend = await selectBackend(baseInput())
    expect(backend.name).toBe('anthropic')
  })

  it('throws with an actionable message when no backend is available', async () => {
    registerBackend(stubBackend('codex', { available: false }))
    await expect(selectBackend(baseInput())).rejects.toThrow(/install|authenticate|backend/i)
  })

  it('rejects FULCRUM_CURATOR_BACKEND value that points at an unregistered backend', async () => {
    registerBackend(stubBackend('codex', { available: true }))
    process.env['FULCRUM_CURATOR_BACKEND'] = 'openai'
    await expect(selectBackend(baseInput())).rejects.toThrow(/openai/)
  })
})

describe('runCurator', () => {
  it('produces a parsed CuratorOutput end-to-end via a stub backend', async () => {
    const captured: { input?: CuratorBackendInput } = {}
    registerBackend(
      stubBackend('codex', {
        available: true,
        raw_text: JSON.stringify({
          new_pages: [
            {
              type: 'page',
              name: null,
              title: 'From A',
              entity_type: null,
              aliases: null,
              confidence: 0.7,
              retention_tier: 'working',
              sources: ['01KL0SRC_A'],
              sources_via: [],
              entities: [],
              body: '# From A\n\n[[raw/bash_trace/2026/04/18/01KL0SRC_A]]\n',
            },
          ],
          updates: [],
          supersessions: [],
          new_edges: [],
        }),
        lastInput: captured,
      }),
    )
    const result = await runCurator(baseInput())
    expect(result.backend).toBe('codex')
    expect(result.model).toBe(TASK_DEFAULTS.extraction.model)
    expect(result.prompt_version).toBe(PROMPT_VERSION)
    const out = result.output as CuratorOutput
    expect(out.new_pages).toHaveLength(1)
    expect(out.new_pages[0]!.title).toBe('From A')
    // The composed prompt was passed to the backend.
    expect(captured.input!.prompt).toContain('<USER_CONTENT')
    // The backend was asked to constrain output to the schema.
    expect(typeof captured.input!.schema).toBe('object')
  })

  it('propagates model_override + reasoning_override to the backend', async () => {
    const captured: { input?: CuratorBackendInput } = {}
    registerBackend(stubBackend('codex', { lastInput: captured }))
    await runCurator(
      baseInput({ model_override: 'gpt-5', reasoning_override: 'high' }),
    )
    expect(captured.input!.model).toBe('gpt-5')
    expect(captured.input!.reasoning).toBe('high')
  })

  it('honors backend_override on the input', async () => {
    registerBackend(stubBackend('codex', { available: true }))
    registerBackend(stubBackend('openai', { available: true }))
    const result = await runCurator(baseInput({ backend_override: 'openai' }))
    expect(result.backend).toBe('openai')
  })

  it('surfaces the curator_input_sources allowlist to the parser (blocks fabricated ULIDs)', async () => {
    registerBackend(
      stubBackend('codex', {
        raw_text: JSON.stringify({
          new_pages: [
            {
              type: 'page',
              name: null,
              title: 'Fab',
              entity_type: null,
              aliases: null,
              confidence: 0.5,
              retention_tier: 'working',
              sources: ['01KL0SRC_FAKE'],
              sources_via: [],
              entities: [],
              body: '# Fab\n\n[[raw/bash_trace/2026/04/18/01KL0SRC_FAKE]]\n',
            },
          ],
          updates: [],
          supersessions: [],
          new_edges: [],
        }),
      }),
    )
    await expect(runCurator(baseInput())).rejects.toThrow(/01KL0SRC_FAKE|batch/)
  })
})
