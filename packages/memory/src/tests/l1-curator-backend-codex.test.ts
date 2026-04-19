// packages/memory/src/tests/l1-curator-backend-codex.test.ts
//
// Memory v3 PR 3 unit 3.2 — codex app-server backend (JSON-RPC).
//
// Tests run against a stub `codex` binary (a Node script) installed in a
// tmpdir and pointed at via `FULCRUM_CODEX_BINARY`. The stub speaks the
// `codex app-server` JSON-RPC protocol: it reads JSONL requests on stdin
// (initialize, thread/start, turn/start) and writes {id,result} responses
// + {method,params} server notifications on stdout. No real LLM call is
// made. Protocol shape is verified against the plugin's lib/codex.mjs
// client (see ~/.claude/plugins/cache/openai-codex/<ver>/scripts/lib).

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { codexBackend, invokeCodex } from '../l1/curator-backend/codex.js'
import type { CuratorBackendInput } from '../l1/curator.js'

let stubDir: string
let stubPath: string
let prevBinary: string | undefined

// A canned-happy-path stub: responds to initialize, thread/start, turn/start
// in order, then emits an item/completed+turn/completed notification. The
// final agent_message text and usage figures are the parameters supplied
// as env vars (so each test can customise).
const STUB_HAPPY = `
  const readline = require('readline')
  const rl = readline.createInterface({ input: process.stdin })
  function send(obj) { process.stdout.write(JSON.stringify(obj) + '\\n') }
  const agentText = process.env.STUB_AGENT_TEXT || '{"ok":true}'
  const usage = {
    input_tokens: Number(process.env.STUB_INPUT_TOKENS || 100),
    cached_input_tokens: Number(process.env.STUB_CACHED_INPUT_TOKENS || 40),
    output_tokens: Number(process.env.STUB_OUTPUT_TOKENS || 20),
  }
  // Optional log-to-stderr for assertion of the argv / cwd / env.
  if (process.env.STUB_LOG_CALLS) {
    process.stderr.write('CWD=' + process.cwd() + '\\n')
    process.stderr.write('ARGV=' + JSON.stringify(process.argv.slice(2)) + '\\n')
  }
  rl.on('line', (line) => {
    const msg = JSON.parse(line)
    if (process.env.STUB_LOG_REQUESTS) {
      process.stderr.write('REQ=' + line + '\\n')
    }
    if (msg.method === 'initialize') {
      send({ id: msg.id, result: { serverInfo: { name: 'stub', version: '0' } } })
    } else if (msg.method === 'initialized') {
      // notification, no reply
    } else if (msg.method === 'thread/start') {
      send({ id: msg.id, result: { thread: { id: 't_' + Math.random().toString(36).slice(2, 8) } } })
    } else if (msg.method === 'turn/start') {
      send({ id: msg.id, result: { turn: { id: 'tu_1', status: 'inProgress' } } })
      // emit the agent message + completion notifications
      send({ method: 'item/completed', params: { threadId: msg.params.threadId, item: { type: 'agentMessage', text: agentText } } })
      send({ method: 'turn/completed', params: { threadId: msg.params.threadId, turn: { id: 'tu_1', status: 'completed' }, usage } })
    }
  })
  rl.on('close', () => process.exit(0))
`

function installStub(script: string): void {
  stubDir = mkdtempSync(join(tmpdir(), 'fulcrum-codex-stub-'))
  stubPath = join(stubDir, 'codex-stub')
  writeFileSync(stubPath, `#!/usr/bin/env node\n${script}`, { encoding: 'utf-8' })
  chmodSync(stubPath, 0o755)
  prevBinary = process.env['FULCRUM_CODEX_BINARY']
  process.env['FULCRUM_CODEX_BINARY'] = stubPath
}

beforeEach(() => {
  prevBinary = process.env['FULCRUM_CODEX_BINARY']
  delete process.env['STUB_AGENT_TEXT']
  delete process.env['STUB_INPUT_TOKENS']
  delete process.env['STUB_CACHED_INPUT_TOKENS']
  delete process.env['STUB_OUTPUT_TOKENS']
  delete process.env['STUB_LOG_CALLS']
  delete process.env['STUB_LOG_REQUESTS']
})

afterEach(() => {
  if (prevBinary === undefined) delete process.env['FULCRUM_CODEX_BINARY']
  else process.env['FULCRUM_CODEX_BINARY'] = prevBinary
  try { rmSync(stubDir, { recursive: true, force: true }) } catch { /* ignore */ }
})

function baseInput(overrides: Partial<CuratorBackendInput> = {}): CuratorBackendInput {
  return {
    task: 'extraction',
    model: 'gpt-5.1-codex-mini',
    reasoning: 'low',
    prompt: '<task>pretend</task>',
    schema: { type: 'object', additionalProperties: false, required: [], properties: {} },
    ...overrides,
  }
}

describe('codexBackend.isAvailable', () => {
  it('returns true when the binary exits 0 on `app-server --help`', async () => {
    installStub(`
      if (process.argv[2] === 'app-server' && process.argv[3] === '--help') { console.log('codex app-server — help'); process.exit(0) }
      process.exit(1)
    `)
    expect(await codexBackend.isAvailable()).toBe(true)
  })

  it('returns false when the binary is missing', async () => {
    process.env['FULCRUM_CODEX_BINARY'] = '/nonexistent/definitely-not-codex'
    expect(await codexBackend.isAvailable()).toBe(false)
  })

  it('returns false when the binary exits non-zero on `app-server --help`', async () => {
    installStub(`process.exit(3)`)
    expect(await codexBackend.isAvailable()).toBe(false)
  })
})

describe('codexBackend.curate — app-server RPC happy path', () => {
  it('captures agent_message text and propagates usage from turn/completed', async () => {
    installStub(STUB_HAPPY)
    process.env['STUB_AGENT_TEXT'] = '{"ok":true}'
    process.env['STUB_INPUT_TOKENS'] = '100'
    process.env['STUB_CACHED_INPUT_TOKENS'] = '40'
    process.env['STUB_OUTPUT_TOKENS'] = '20'
    const out = await invokeCodex(baseInput())
    expect(out.raw_text).toBe('{"ok":true}')
    expect(out.backend).toBe('codex')
    expect(out.model).toBe('gpt-5.1-codex-mini')
    expect(out.usage).toEqual({ input_tokens: 100, cached_input_tokens: 40, output_tokens: 20 })
    expect(out.duration_ms).toBeGreaterThanOrEqual(0)
  })

  it('invokes the `app-server` subcommand (not `exec`)', async () => {
    // Stub asserts argv[2] is 'app-server', then continues with the happy path.
    installStub(`
      if (process.argv[2] !== 'app-server') { process.stderr.write('EXPECTED app-server, got: ' + process.argv[2] + '\\n'); process.exit(9) }
      ${STUB_HAPPY}
    `)
    const out = await invokeCodex(baseInput())
    expect(out.raw_text).toBeDefined()
  })

  it('sends model + schema + effort in the turn/start params', async () => {
    // Stub captures requests, and the happy-path completion echoes them back
    // in the agent message so the test can read + assert.
    installStub(`
      const readline = require('readline')
      const rl = readline.createInterface({ input: process.stdin })
      const seen = {}
      function send(obj) { process.stdout.write(JSON.stringify(obj) + '\\n') }
      rl.on('line', (line) => {
        const msg = JSON.parse(line)
        if (msg.method === 'initialize') { send({ id: msg.id, result: {} }) }
        else if (msg.method === 'thread/start') { seen.thread = msg.params; send({ id: msg.id, result: { thread: { id: 't_ok' } } }) }
        else if (msg.method === 'turn/start') {
          seen.turn = msg.params
          send({ id: msg.id, result: { turn: { id: 'tu_ok', status: 'inProgress' } } })
          send({ method: 'item/completed', params: { threadId: msg.params.threadId, item: { type: 'agentMessage', text: JSON.stringify(seen) } } })
          send({ method: 'turn/completed', params: { threadId: msg.params.threadId, turn: { id: 'tu_ok', status: 'completed' }, usage: {} } })
        }
      })
      rl.on('close', () => process.exit(0))
    `)
    const out = await invokeCodex(baseInput({ model: 'gpt-5.1-codex-mini', reasoning: 'low' }))
    const seen = JSON.parse(out.raw_text) as {
      thread: { model: string; approvalPolicy: string; sandbox: string; ephemeral: boolean }
      turn: { model: string; effort: string; outputSchema: { type: string } }
    }
    expect(seen.thread.model).toBe('gpt-5.1-codex-mini')
    expect(seen.thread.approvalPolicy).toBe('never')
    expect(seen.thread.sandbox).toBe('read-only')
    expect(seen.thread.ephemeral).toBe(true)
    expect(seen.turn.model).toBe('gpt-5.1-codex-mini')
    expect(seen.turn.effort).toBe('low')
    expect(seen.turn.outputSchema.type).toBe('object')
  })

  it('pipes the prompt text on turn/start', async () => {
    installStub(`
      const readline = require('readline')
      const rl = readline.createInterface({ input: process.stdin })
      function send(obj) { process.stdout.write(JSON.stringify(obj) + '\\n') }
      rl.on('line', (line) => {
        const msg = JSON.parse(line)
        if (msg.method === 'initialize') { send({ id: msg.id, result: {} }) }
        else if (msg.method === 'thread/start') { send({ id: msg.id, result: { thread: { id: 't' } } }) }
        else if (msg.method === 'turn/start') {
          send({ id: msg.id, result: { turn: { id: 'tu', status: 'inProgress' } } })
          const text = msg.params.input?.[0]?.text ?? ''
          send({ method: 'item/completed', params: { threadId: msg.params.threadId, item: { type: 'agentMessage', text: JSON.stringify({ seen: text }) } } })
          send({ method: 'turn/completed', params: { threadId: msg.params.threadId, turn: { id: 'tu', status: 'completed' }, usage: {} } })
        }
      })
      rl.on('close', () => process.exit(0))
    `)
    const out = await invokeCodex(baseInput({ prompt: 'HELLO_STDIN_PROMPT' }))
    const parsed = JSON.parse(out.raw_text) as { seen: string }
    expect(parsed.seen).toBe('HELLO_STDIN_PROMPT')
  })
})

describe('codexBackend.curate — app-server RPC error paths', () => {
  it('rejects when the initialize RPC returns an error', async () => {
    installStub(`
      const readline = require('readline')
      const rl = readline.createInterface({ input: process.stdin })
      rl.on('line', (line) => {
        const msg = JSON.parse(line)
        if (msg.method === 'initialize') {
          process.stdout.write(JSON.stringify({ id: msg.id, error: { code: -1, message: 'not authorized' } }) + '\\n')
        }
      })
      rl.on('close', () => process.exit(0))
    `)
    await expect(invokeCodex(baseInput())).rejects.toThrow(/initialize failed|not authorized/)
  })

  it('rejects when turn/start returns an error', async () => {
    installStub(`
      const readline = require('readline')
      const rl = readline.createInterface({ input: process.stdin })
      function send(obj) { process.stdout.write(JSON.stringify(obj) + '\\n') }
      rl.on('line', (line) => {
        const msg = JSON.parse(line)
        if (msg.method === 'initialize') { send({ id: msg.id, result: {} }) }
        else if (msg.method === 'thread/start') { send({ id: msg.id, result: { thread: { id: 't' } } }) }
        else if (msg.method === 'turn/start') { send({ id: msg.id, error: { code: 400, message: 'model not supported' } }) }
      })
      rl.on('close', () => process.exit(0))
    `)
    await expect(invokeCodex(baseInput())).rejects.toThrow(/turn\/start failed|model not supported/)
  })

  it('rejects when turn/completed fires without any agent_message', async () => {
    installStub(`
      const readline = require('readline')
      const rl = readline.createInterface({ input: process.stdin })
      function send(obj) { process.stdout.write(JSON.stringify(obj) + '\\n') }
      rl.on('line', (line) => {
        const msg = JSON.parse(line)
        if (msg.method === 'initialize') { send({ id: msg.id, result: {} }) }
        else if (msg.method === 'thread/start') { send({ id: msg.id, result: { thread: { id: 't' } } }) }
        else if (msg.method === 'turn/start') {
          send({ id: msg.id, result: { turn: { id: 'tu', status: 'inProgress' } } })
          send({ method: 'turn/completed', params: { threadId: msg.params.threadId, turn: { id: 'tu', status: 'completed' }, usage: {} } })
        }
      })
      rl.on('close', () => process.exit(0))
    `)
    await expect(invokeCodex(baseInput())).rejects.toThrow(/agent_message|no.*output/i)
  })

  it('rejects with the stub exit-code message when the process dies early', async () => {
    installStub(`
      process.stderr.write('model authentication failed\\n')
      process.exit(7)
    `)
    await expect(invokeCodex(baseInput())).rejects.toThrow(/closed before turn\/completed|exit 7|authentication/i)
  })

  it('ignores non-JSONL noise lines on stdout', async () => {
    installStub(`
      const readline = require('readline')
      const rl = readline.createInterface({ input: process.stdin })
      function send(obj) { process.stdout.write(JSON.stringify(obj) + '\\n') }
      rl.on('line', (line) => {
        const msg = JSON.parse(line)
        if (msg.method === 'initialize') { send({ id: msg.id, result: {} }) }
        else if (msg.method === 'thread/start') {
          process.stdout.write('[INFO] warming up\\n')
          send({ id: msg.id, result: { thread: { id: 't' } } })
        }
        else if (msg.method === 'turn/start') {
          send({ id: msg.id, result: { turn: { id: 'tu', status: 'inProgress' } } })
          process.stdout.write('[INFO] turn running\\n')
          send({ method: 'item/completed', params: { threadId: msg.params.threadId, item: { type: 'agentMessage', text: '{"k":1}' } } })
          send({ method: 'turn/completed', params: { threadId: msg.params.threadId, turn: { id: 'tu', status: 'completed' }, usage: {} } })
        }
      })
      rl.on('close', () => process.exit(0))
    `)
    const out = await invokeCodex(baseInput())
    expect(out.raw_text).toBe('{"k":1}')
  })

  it('respects timeout_ms and rejects with a timeout error', async () => {
    installStub(`
      const readline = require('readline')
      const rl = readline.createInterface({ input: process.stdin })
      function send(obj) { process.stdout.write(JSON.stringify(obj) + '\\n') }
      rl.on('line', (line) => {
        const msg = JSON.parse(line)
        if (msg.method === 'initialize') { send({ id: msg.id, result: {} }) }
        // Never respond to thread/start or turn/start — force the caller to time out.
      })
      setInterval(() => {}, 1000)
    `)
    await expect(invokeCodex(baseInput({ timeout_ms: 300 }))).rejects.toThrow(/timed out/i)
  }, 10_000)

  it('redacts likely credentials (sk-/AKIA/token=) from propagated stderr', async () => {
    installStub(`
      process.stderr.write('bad auth: sk-proj-abcdef1234567890ABCDEF1234567890\\n')
      process.exit(5)
    `)
    await expect(invokeCodex(baseInput())).rejects.toThrow(
      /^((?!sk-proj-abcdef).)*$/s,
    )
  })
})
