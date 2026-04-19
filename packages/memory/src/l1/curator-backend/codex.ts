// packages/memory/src/l1/curator-backend/codex.ts
//
// Memory v3 PR 3 unit 3.2 — codex app-server backend (JSON-RPC).
//
// Uses `codex app-server` (JSON-RPC over stdio), NOT `codex exec`. The
// exec path is restricted on ChatGPT-auth codex to a subset of models,
// while app-server accepts every model surfaced in the interactive
// picker (gpt-5.1-codex-mini, gpt-5.1-codex-max, gpt-5.2-codex, etc.).
// Protocol mirrors the Codex Plugin's lib/codex.mjs client (from
// `~/.claude/plugins/cache/openai-codex/<ver>/scripts/lib`).
//
// Protocol flow:
//
//   1. spawn `codex app-server`
//   2. request  initialize {clientInfo, capabilities}
//   3. notify   initialized {}
//   4. request  thread/start {cwd, model, approvalPolicy:"never",
//                 sandbox:"read-only", serviceName, ephemeral:true}
//         → response carries thread.id
//   5. request  turn/start {threadId, input:[text], model, effort, outputSchema}
//         → response may be immediate; actual completion arrives via
//           server notifications on the same channel:
//             item/completed (item.type="agentMessage") → agent text
//             turn/completed                             → usage + exit
//   6. on turn/completed, capture usage + resolve with the last agent_message
//   7. close stdin + await process exit
//
// The output schema is passed inline as an object (no on-disk tmp file,
// unlike the old exec path). Sandbox stays read-only — the curator only
// needs a JSON reply, never tool use. approvalPolicy="never" disables
// interactive prompts.
//
// Credential redaction on stderr is preserved from the exec-era backend;
// the pattern set handles sk-/AKIA/Bearer/*_KEY= shapes.

import { spawn } from 'child_process'
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
  // app-server subcommand is what the curator actually uses, so verify
  // that specifically — older codex builds have `codex` but no app-server.
  return new Promise<boolean>((resolve) => {
    let settled = false
    const done = (ok: boolean): void => {
      if (settled) return
      settled = true
      resolve(ok)
    }
    try {
      const p = spawn(codexBinary(), ['app-server', '--help'], {
        stdio: ['ignore', 'ignore', 'ignore'],
      })
      p.on('error', () => done(false))
      p.on('exit', (code) => done(code === 0))
    } catch {
      done(false)
    }
  })
}

interface PendingRequest {
  resolve: (result: unknown) => void
  reject: (err: Error) => void
  method: string
}

export async function invokeCodex(
  input: CuratorBackendInput,
): Promise<CuratorBackendResult> {
  const started = Date.now()

  return new Promise<CuratorBackendResult>((resolveFinal, rejectFinal) => {
    const proc = spawn(codexBinary(), ['app-server'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
      cwd: process.cwd(),
    })

    let stdoutBuf = ''
    let stderrBuf = ''
    const pending = new Map<number, PendingRequest>()
    let nextId = 1
    let finalized = false
    let lastAgentMessage: string | null = null
    let usage: CuratorBackendResult['usage'] | undefined
    let timeoutTimer: NodeJS.Timeout | null = null

    const sendMessage = (msg: Record<string, unknown>): void => {
      const line = JSON.stringify(msg) + '\n'
      if (proc.stdin && !proc.stdin.destroyed) {
        proc.stdin.write(line)
      }
    }

    const request = (method: string, params: Record<string, unknown>): Promise<unknown> => {
      const id = nextId++
      return new Promise<unknown>((resolve, reject) => {
        pending.set(id, { resolve, reject, method })
        sendMessage({ id, method, params })
      })
    }

    const notify = (method: string, params: Record<string, unknown> = {}): void => {
      sendMessage({ method, params })
    }

    const cleanup = (): void => {
      if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null }
      try { proc.stdin?.end() } catch { /* ignore */ }
      setTimeout(() => {
        if (!proc.killed && proc.exitCode === null) {
          try { proc.kill('SIGTERM') } catch { /* ignore */ }
          setTimeout(() => {
            if (!proc.killed && proc.exitCode === null) {
              try { proc.kill('SIGKILL') } catch { /* ignore */ }
            }
          }, 500).unref?.()
        }
      }, 50).unref?.()
    }

    const fail = (err: Error): void => {
      if (finalized) return
      finalized = true
      for (const p of pending.values()) {
        try { p.reject(err) } catch { /* ignore */ }
      }
      pending.clear()
      cleanup()
      rejectFinal(err)
    }

    const finish = (): void => {
      if (finalized) return
      if (lastAgentMessage === null) {
        const tail = redactCredentials(stderrBuf).trim().slice(0, 200)
        fail(new Error(`codex app-server turn completed without an agent_message (stderr: ${tail || 'empty'})`))
        return
      }
      finalized = true
      const result: CuratorBackendResult = {
        raw_text: lastAgentMessage,
        backend: 'codex',
        model: input.model,
        duration_ms: Date.now() - started,
      }
      if (usage) result.usage = usage
      cleanup()
      resolveFinal(result)
    }

    const handleLine = (line: string): void => {
      if (!line.trim()) return
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(line)
      } catch {
        return // non-JSONL line, ignore
      }

      // Response to a request we sent
      if (typeof msg['id'] === 'number' && (msg['result'] !== undefined || msg['error'] !== undefined)) {
        const id = msg['id'] as number
        const p = pending.get(id)
        if (!p) return
        pending.delete(id)
        if (msg['error']) {
          const err = msg['error'] as { message?: string; code?: number }
          p.reject(new Error(`codex app-server ${p.method} failed (${err.code ?? 'no code'}): ${err.message ?? 'unknown'}`))
        } else {
          p.resolve(msg['result'])
        }
        return
      }

      // Server notification (no id, only method+params)
      const method = msg['method']
      if (typeof method !== 'string') return
      const params = (msg['params'] ?? {}) as Record<string, unknown>

      if (method === 'item/completed') {
        const item = params['item'] as { type?: string; text?: string } | undefined
        if (item?.type === 'agentMessage' && typeof item.text === 'string' && item.text.length > 0) {
          lastAgentMessage = item.text
        }
      } else if (method === 'turn/completed') {
        // Usage may live on params.usage OR nested on params.turn.usage depending
        // on the codex version; try both.
        const rawUsage =
          (params['usage'] as Record<string, unknown> | undefined) ??
          ((params['turn'] as { usage?: Record<string, unknown> } | undefined)?.usage ?? undefined)
        if (rawUsage) {
          const u: NonNullable<CuratorBackendResult['usage']> = {}
          if (typeof rawUsage['input_tokens'] === 'number') u.input_tokens = rawUsage['input_tokens']
          if (typeof rawUsage['cached_input_tokens'] === 'number') u.cached_input_tokens = rawUsage['cached_input_tokens']
          if (typeof rawUsage['output_tokens'] === 'number') u.output_tokens = rawUsage['output_tokens']
          usage = u
        }
        finish()
      } else if (method === 'error') {
        const error = params['error'] as { message?: string } | undefined
        fail(new Error(`codex app-server error: ${error?.message ?? 'unknown'}`))
      }
    }

    proc.stdout.setEncoding('utf8')
    proc.stderr.setEncoding('utf8')

    proc.stdout.on('data', (chunk: string) => {
      stdoutBuf += chunk
      let nl = stdoutBuf.indexOf('\n')
      while (nl >= 0) {
        const line = stdoutBuf.slice(0, nl)
        stdoutBuf = stdoutBuf.slice(nl + 1)
        handleLine(line)
        nl = stdoutBuf.indexOf('\n')
      }
    })

    proc.stderr.on('data', (chunk: string) => { stderrBuf += chunk })

    proc.on('error', (err) => {
      fail(err instanceof Error ? err : new Error(String(err)))
    })

    proc.on('close', (code, signal) => {
      if (finalized) return
      const tail = redactCredentials(stderrBuf).trim().slice(0, 400)
      const detail = signal ? `signal ${signal}` : `exit ${code}`
      fail(new Error(`codex app-server closed before turn/completed (${detail})${tail ? `: ${tail}` : ''}`))
    })

    if (input.timeout_ms && input.timeout_ms > 0) {
      timeoutTimer = setTimeout(() => {
        fail(new Error(`codex app-server timed out after ${input.timeout_ms}ms`))
      }, input.timeout_ms)
    }

    // Run the RPC protocol.
    ;(async () => {
      try {
        await request('initialize', {
          clientInfo: {
            title: 'Fulcrum Curator',
            name: 'fulcrum-memory',
            version: '0.0.2',
          },
          capabilities: {
            experimentalApi: false,
            optOutNotificationMethods: [
              'item/agentMessage/delta',
              'item/reasoning/summaryTextDelta',
              'item/reasoning/summaryPartAdded',
              'item/reasoning/textDelta',
            ],
          },
        })
        notify('initialized', {})

        const threadResp = (await request('thread/start', {
          cwd: process.cwd(),
          model: input.model,
          approvalPolicy: 'never',
          sandbox: 'read-only',
          serviceName: 'fulcrum_curator',
          ephemeral: true,
          experimentalRawEvents: false,
        })) as { thread?: { id?: string } }

        const threadId = threadResp.thread?.id
        if (!threadId) {
          throw new Error('codex app-server thread/start returned no thread id')
        }

        await request('turn/start', {
          threadId,
          input: [{ type: 'text', text: input.prompt, text_elements: [] }],
          model: input.model,
          effort: input.reasoning ?? null,
          outputSchema: input.schema,
        })
        // Completion arrives as a turn/completed notification; handled in handleLine.
      } catch (err) {
        fail(err instanceof Error ? err : new Error(String(err)))
      }
    })()
  })
}

export const codexBackend: CuratorBackend = {
  name: 'codex',
  isAvailable: isCodexAvailable,
  curate: invokeCodex,
}
