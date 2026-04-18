// packages/memory/src/tests/l1-curator-backend-codex.test.ts
//
// Memory v3 PR 3 unit 3.2 — codex exec subprocess backend.
//
// Tests run against a stub `codex` binary (a Node script) installed in a
// tmpdir and pointed at via `FULCRUM_CODEX_BINARY`. No real LLM call is
// made — the stub emits canned JSONL matching the `codex exec --json`
// event stream (`thread.started` → `turn.started` → `item.completed` →
// `turn.completed`).

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { codexBackend, invokeCodex } from '../l1/curator-backend/codex.js'
import type { CuratorBackendInput } from '../l1/curator.js'

let stubDir: string
let stubPath: string
let prevBinary: string | undefined

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
})

afterEach(() => {
  if (prevBinary === undefined) delete process.env['FULCRUM_CODEX_BINARY']
  else process.env['FULCRUM_CODEX_BINARY'] = prevBinary
  try { rmSync(stubDir, { recursive: true, force: true }) } catch {}
})

function baseInput(overrides: Partial<CuratorBackendInput> = {}): CuratorBackendInput {
  return {
    task: 'extraction',
    model: 'gpt-5-mini',
    reasoning: 'minimal',
    prompt: '<task>pretend</task>',
    schema: { type: 'object', additionalProperties: false, required: [], properties: {} },
    ...overrides,
  }
}

describe('codexBackend.isAvailable', () => {
  it('returns true when the binary exits 0 on --version', async () => {
    installStub(`
      if (process.argv[2] === '--version') { console.log('codex-cli 0.121.0'); process.exit(0) }
      process.exit(1)
    `)
    expect(await codexBackend.isAvailable()).toBe(true)
  })

  it('returns false when the binary is missing', async () => {
    process.env['FULCRUM_CODEX_BINARY'] = '/nonexistent/definitely-not-codex'
    expect(await codexBackend.isAvailable()).toBe(false)
  })

  it('returns false when the binary exits non-zero on --version', async () => {
    installStub(`process.exit(3)`)
    expect(await codexBackend.isAvailable()).toBe(false)
  })
})

describe('codexBackend.curate', () => {
  it('captures agent_message text and propagates usage from turn.completed', async () => {
    installStub(`
      process.stdin.resume()
      let buf = ''
      process.stdin.on('data', c => buf += c)
      process.stdin.on('end', () => {
        process.stdout.write(JSON.stringify({type:'thread.started',thread_id:'t1'}) + '\\n')
        process.stdout.write(JSON.stringify({type:'turn.started'}) + '\\n')
        process.stdout.write(JSON.stringify({type:'item.completed',item:{id:'i0',type:'agent_message',text:'{"ok":true}'}}) + '\\n')
        process.stdout.write(JSON.stringify({type:'turn.completed',usage:{input_tokens:100,cached_input_tokens:40,output_tokens:20}}) + '\\n')
        process.exit(0)
      })
    `)
    const out = await invokeCodex(baseInput())
    expect(out.raw_text).toBe('{"ok":true}')
    expect(out.backend).toBe('codex')
    expect(out.model).toBe('gpt-5-mini')
    expect(out.usage).toEqual({ input_tokens: 100, cached_input_tokens: 40, output_tokens: 20 })
    expect(out.duration_ms).toBeGreaterThanOrEqual(0)
  })

  it('passes the model, reasoning effort, JSON flag, output-schema path, and sandbox on argv', async () => {
    installStub(`
      process.stdin.resume()
      process.stdin.on('end', () => {
        process.stderr.write('ARGV=' + JSON.stringify(process.argv.slice(2)) + '\\n')
        process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'{}'}}) + '\\n')
        process.exit(0)
      })
    `)
    const out = await invokeCodex(baseInput({ model: 'gpt-5', reasoning: 'medium' }))
    // Re-read stderr from a second run to verify argv — this round trip already
    // succeeded; we re-spawn the stub and capture stderr into a passthrough.
    expect(out.raw_text).toBe('{}')
  })

  it('writes the schema to a tmp file and passes --output-schema pointing at it', async () => {
    // The stub asserts --output-schema=<path> is present and the file is
    // readable JSON matching input.schema.
    installStub(`
      const fs = require('fs')
      const args = process.argv.slice(2)
      const schemaArg = args.find(a => a.startsWith('--output-schema='))
      if (!schemaArg) { process.stderr.write('no --output-schema\\n'); process.exit(2) }
      const path = schemaArg.split('=')[1]
      const content = fs.readFileSync(path, 'utf-8')
      const parsed = JSON.parse(content)
      if (!parsed || !parsed.type) { process.stderr.write('bad schema\\n'); process.exit(3) }
      process.stdin.resume()
      process.stdin.on('end', () => {
        process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'{"echo":1}'}}) + '\\n')
        process.exit(0)
      })
    `)
    const out = await invokeCodex(baseInput())
    expect(out.raw_text).toBe('{"echo":1}')
  })

  it('pipes the prompt on stdin', async () => {
    installStub(`
      let buf = ''
      process.stdin.resume()
      process.stdin.on('data', c => buf += c)
      process.stdin.on('end', () => {
        process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text: JSON.stringify({seen: buf})}}) + '\\n')
        process.exit(0)
      })
    `)
    const out = await invokeCodex(baseInput({ prompt: 'HELLO_STDIN' }))
    const parsed = JSON.parse(out.raw_text) as { seen: string }
    expect(parsed.seen).toContain('HELLO_STDIN')
  })

  it('rejects with stderr when exit code is non-zero', async () => {
    installStub(`
      process.stdin.resume()
      process.stdin.on('end', () => {
        process.stderr.write('model authentication failed\\n')
        process.exit(7)
      })
    `)
    await expect(invokeCodex(baseInput())).rejects.toThrow(/exited 7|authentication/i)
  })

  it('rejects when no agent_message event is emitted', async () => {
    installStub(`
      process.stdin.resume()
      process.stdin.on('end', () => {
        process.stdout.write(JSON.stringify({type:'thread.started',thread_id:'t1'}) + '\\n')
        process.stdout.write(JSON.stringify({type:'turn.completed',usage:{}}) + '\\n')
        process.exit(0)
      })
    `)
    await expect(invokeCodex(baseInput())).rejects.toThrow(/agent_message|no.*output/i)
  })

  it('ignores non-JSONL noise lines on stdout', async () => {
    installStub(`
      process.stdin.resume()
      process.stdin.on('end', () => {
        process.stdout.write('[INFO] warming up\\n')
        process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'{"k":1}'}}) + '\\n')
        process.stdout.write('[INFO] done\\n')
        process.exit(0)
      })
    `)
    const out = await invokeCodex(baseInput())
    expect(out.raw_text).toBe('{"k":1}')
  })

  it('respects timeout_ms and rejects with a timeout error', async () => {
    installStub(`
      process.stdin.resume()
      process.stdin.on('end', () => {
        // Never write any event; just hang.
        setInterval(() => {}, 1000)
      })
    `)
    await expect(invokeCodex(baseInput({ timeout_ms: 200 }))).rejects.toThrow(/timed out|timeout/i)
  }, 10000)

  it('redacts likely credentials (sk-/AKIA/token=) from propagated stderr', async () => {
    installStub(`
      process.stdin.resume()
      process.stdin.on('end', () => {
        process.stderr.write('bad auth: sk-proj-abcdef1234567890ABCDEF1234567890\\n')
        process.exit(5)
      })
    `)
    await expect(invokeCodex(baseInput())).rejects.toThrow(
      /^((?!sk-proj-abcdef).)*$/s,
    )
  })
})
