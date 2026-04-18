// packages/memory/src/l1/curator-backend/codex.ts
//
// Memory v3 PR 3 unit 3.2 — codex exec subprocess backend.
//
// Shell shape (verified against codex-cli 0.121.0):
//
//   codex exec \
//     -m <model> \
//     -c model_reasoning_effort=<reasoning> \
//     --json \
//     --output-schema=<schema.json> \
//     --ephemeral \
//     --skip-git-repo-check \
//     --sandbox read-only
//
// The prompt is piped to stdin. codex emits a JSONL event stream on stdout:
//   {"type":"thread.started","thread_id":"..."}
//   {"type":"turn.started"}
//   {"type":"item.completed","item":{"id":"...","type":"agent_message","text":"..."}}
//   {"type":"turn.completed","usage":{"input_tokens":...,"cached_input_tokens":...,"output_tokens":...}}
//
// The final agent_message.text is the schema-constrained JSON. `--sandbox
// read-only` is correct for the curator — no tool use is required; we only
// want a JSON response. Writing the schema to `${TMPDIR}/fulcrum-curator-*`
// with 0600 mode satisfies Constraint #16 (secrets never land in cleartext
// on disk — the schema is structural only, but the tmp dir perms keep other
// users off it).

import { spawn } from 'child_process'
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type {
  CuratorBackend,
  CuratorBackendInput,
  CuratorBackendResult,
} from '../curator.js'

function codexBinary(): string {
  return process.env['FULCRUM_CODEX_BINARY'] ?? 'codex'
}

/**
 * Cheap redaction for stderr that may contain OS-level auth errors citing
 * tokens. Matches the common shapes: `sk-...`, `sk-proj-...`, `AKIA...`,
 * `Bearer ...`, `<KEY>=<VALUE>` where KEY ends with `KEY|TOKEN|SECRET`.
 * Fail-open: returns the (partially) redacted string.
 */
function redactCredentials(s: string): string {
  return s
    .replaceAll(/\bsk-(?:proj-)?[A-Za-z0-9_-]{10,}/g, 'sk-<redacted>')
    .replaceAll(/\bAKIA[0-9A-Z]{16}\b/g, 'AKIA<redacted>')
    .replaceAll(/Bearer [A-Za-z0-9_\-.=]+/g, 'Bearer <redacted>')
    .replaceAll(
      /\b([A-Z_]+_(?:KEY|TOKEN|SECRET))\s*[=:]\s*\S+/gi,
      '$1=<redacted>',
    )
}

export async function isCodexAvailable(): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false
    const done = (ok: boolean): void => {
      if (settled) return
      settled = true
      resolve(ok)
    }
    try {
      const p = spawn(codexBinary(), ['--version'], {
        stdio: ['ignore', 'ignore', 'ignore'],
      })
      p.on('error', () => done(false))
      p.on('exit', (code) => done(code === 0))
    } catch {
      done(false)
    }
  })
}

export async function invokeCodex(
  input: CuratorBackendInput,
): Promise<CuratorBackendResult> {
  const dir = mkdtempSync(join(tmpdir(), 'fulcrum-curator-'))
  const schemaPath = join(dir, 'schema.json')
  writeFileSync(schemaPath, JSON.stringify(input.schema), { encoding: 'utf-8' })
  try {
    chmodSync(schemaPath, 0o600)
  } catch {
    // Best-effort on platforms without POSIX perms.
  }

  const args = [
    'exec',
    '-m',
    input.model,
    '-c',
    `model_reasoning_effort=${input.reasoning}`,
    '--json',
    `--output-schema=${schemaPath}`,
    '--ephemeral',
    '--skip-git-repo-check',
    '--sandbox',
    'read-only',
  ]
  const started = Date.now()

  try {
    return await new Promise<CuratorBackendResult>((resolve, reject) => {
      const proc = spawn(codexBinary(), args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env,
        cwd: dir,
      })

      let stdoutBuf = ''
      let stderrBuf = ''
      let text: string | null = null
      let usage: CuratorBackendResult['usage'] | undefined
      let timedOut = false

      let timer: NodeJS.Timeout | null = null
      if (input.timeout_ms && input.timeout_ms > 0) {
        timer = setTimeout(() => {
          timedOut = true
          proc.kill('SIGTERM')
          // Force-kill after a grace period; codex may ignore SIGTERM.
          setTimeout(() => {
            try {
              proc.kill('SIGKILL')
            } catch {
              // ignore
            }
          }, 500).unref?.()
        }, input.timeout_ms)
      }

      const handleEventLine = (line: string): void => {
        const trimmed = line.trim()
        if (!trimmed) return
        let evt: Record<string, unknown>
        try {
          evt = JSON.parse(trimmed) as Record<string, unknown>
        } catch {
          // codex may emit the occasional non-JSONL info line — ignore.
          return
        }
        const type = evt['type']
        if (type === 'item.completed') {
          const item = evt['item'] as Record<string, unknown> | undefined
          if (
            item &&
            item['type'] === 'agent_message' &&
            typeof item['text'] === 'string'
          ) {
            text = item['text']
          }
        } else if (type === 'turn.completed') {
          const u = evt['usage'] as Record<string, unknown> | undefined
          if (u) {
            const parsed: NonNullable<CuratorBackendResult['usage']> = {}
            if (typeof u['input_tokens'] === 'number') parsed.input_tokens = u['input_tokens']
            if (typeof u['cached_input_tokens'] === 'number') {
              parsed.cached_input_tokens = u['cached_input_tokens']
            }
            if (typeof u['output_tokens'] === 'number') parsed.output_tokens = u['output_tokens']
            usage = parsed
          }
        }
      }

      proc.stdout.on('data', (chunk: Buffer) => {
        stdoutBuf += chunk.toString('utf-8')
        let nl = stdoutBuf.indexOf('\n')
        while (nl >= 0) {
          const line = stdoutBuf.slice(0, nl)
          stdoutBuf = stdoutBuf.slice(nl + 1)
          handleEventLine(line)
          nl = stdoutBuf.indexOf('\n')
        }
      })

      proc.stderr.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString('utf-8')
      })

      proc.on('error', (err) => {
        if (timer) clearTimeout(timer)
        reject(err)
      })

      proc.on('close', (code) => {
        if (timer) clearTimeout(timer)
        if (stdoutBuf.length > 0) handleEventLine(stdoutBuf)
        if (timedOut) {
          reject(new Error(`codex exec timed out after ${input.timeout_ms}ms`))
          return
        }
        const redactedStderr = redactCredentials(stderrBuf).trim().slice(0, 400)
        if (code !== 0) {
          reject(
            new Error(
              `codex exec exited ${code}${redactedStderr ? `: ${redactedStderr}` : ''}`,
            ),
          )
          return
        }
        if (text === null) {
          reject(
            new Error(
              `codex exec produced no agent_message (stderr: ${redactedStderr.slice(0, 200) || 'empty'})`,
            ),
          )
          return
        }
        const result: CuratorBackendResult = {
          raw_text: text,
          backend: 'codex',
          model: input.model,
          duration_ms: Date.now() - started,
        }
        if (usage) result.usage = usage
        resolve(result)
      })

      proc.stdin.on('error', () => {
        // codex closed stdin before we finished writing; exit handler
        // surfaces the failure with stderr context.
      })
      proc.stdin.end(input.prompt)
    })
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // best-effort cleanup
    }
  }
}

export const codexBackend: CuratorBackend = {
  name: 'codex',
  isAvailable: isCodexAvailable,
  curate: invokeCodex,
}
