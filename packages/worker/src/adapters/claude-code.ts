// packages/worker/src/adapters/claude-code.ts
//
// Claude Code agent adapter.
// Spawns a subordinate Claude Code agent as a child process, passing the
// task context via environment variables and a JSON prompt on stdin.
//
// The adapter:
//   1. Resolves the `claude` binary (uses $FULCRUM_CLAUDE_BIN or PATH lookup)
//   2. Writes a JSON prompt file to a temp location with the task + handoff
//   3. Spawns: claude --print --prompt-file <path> [--model <model>]
//   4. Streams heartbeats every 30 s while the process runs
//   5. Returns a WorkerResult parsed from the process's exit code + stdout

import { execFileSync, spawn } from 'child_process'
import { writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { AgentAdapter, SpawnContext, WorkerResult } from '../types.js'

/** Locate the `claude` binary. Respects $FULCRUM_CLAUDE_BIN override. */
export function findClaudeBin(): string | null {
  const override = process.env['FULCRUM_CLAUDE_BIN']
  if (override) return override
  try {
    return execFileSync('which', ['claude'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null
  } catch {
    return null
  }
}

/** Build the system prompt injected as context for the spawned agent. */
function buildPrompt(ctx: SpawnContext): string {
  const lines: string[] = [
    `You are acting as the Fulcrum \`${ctx.role}\` agent.`,
    ``,
    `## Task`,
    `Run ID  : ${ctx.run_id}`,
    `Task ID : ${ctx.task_id}`,
    `Workspace: ${ctx.workspace_id}`,
    `Project  : ${ctx.project_id}`,
  ]
  if (ctx.worktree_path) {
    lines.push(`Worktree : ${ctx.worktree_path}`)
  }
  if (ctx.model) {
    lines.push(`Model    : ${ctx.model}`)
  }
  if (ctx.handoff) {
    lines.push(``, `## Handoff`, JSON.stringify(ctx.handoff, null, 2))
  }
  lines.push(``, `## Instructions`, `Complete the task, then exit.`)
  return lines.join('\n')
}

// ---------- Detached dispatch (fire-and-forget) ----------

export interface DispatchClaudeCodeInput {
  run_id: string
  task_id?: string
  workspace_id: string
  project_id?: string
  agent_role: string
  model?: string
}

/**
 * Spawn a Claude Code subprocess for a run in a detached, fire-and-forget
 * manner. The subprocess inherits no file descriptors, is fully detached from
 * the parent process, and is unreffed so the parent can exit independently.
 *
 * Returns `{ pid }` or throws if the spawn fails or the `claude` binary is
 * not found.
 */
export function dispatchClaudeCode(input: DispatchClaudeCodeInput): { pid: number } {
  const claudeBin = findClaudeBin()
  if (!claudeBin) {
    throw new Error('claude binary not found — install Claude Code CLI or set $FULCRUM_CLAUDE_BIN')
  }

  // Write a minimal prompt to a temp file
  const tmpDir = join(tmpdir(), 'fulcrum-claude-code')
  mkdirSync(tmpDir, { recursive: true })
  const promptFile = join(tmpDir, `${input.run_id}.txt`)

  const promptLines: string[] = [
    `You are a Fulcrum agent running as role: ${input.agent_role}`,
    `Your run ID is: ${input.run_id}`,
    `Workspace: ${input.workspace_id}`,
  ]
  if (input.project_id) promptLines.push(`Project: ${input.project_id}`)
  if (input.task_id) promptLines.push(`Task: ${input.task_id}`)
  promptLines.push('', 'Complete the task, then exit.')

  writeFileSync(promptFile, promptLines.join('\n'), { encoding: 'utf8', mode: 0o600 })

  const args = ['--print', '--prompt-file', promptFile]
  if (input.model) args.push('--model', input.model)

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FULCRUM_RUN_ID: input.run_id,
    FULCRUM_WORKSPACE_ID: input.workspace_id,
    FULCRUM_AGENT_ROLE: input.agent_role,
  }
  if (input.project_id) env['FULCRUM_PROJECT_ID'] = input.project_id
  if (input.task_id) env['FULCRUM_TASK_ID'] = input.task_id

  const proc = spawn(claudeBin, args, {
    env,
    detached: true,
    stdio: 'ignore',
  })

  if (!proc.pid) {
    throw new Error('Failed to spawn claude subprocess — no pid returned')
  }

  // Unref so the parent process can exit without waiting for this child
  proc.unref()

  return { pid: proc.pid }
}

export const claudeCodeAdapter: AgentAdapter = {
  name: 'claude-code',

  async spawn(ctx: SpawnContext): Promise<WorkerResult> {
    const claudeBin = findClaudeBin()
    if (!claudeBin) {
      return {
        status: 'blocked',
        error: 'claude binary not found — install Claude Code CLI or set $FULCRUM_CLAUDE_BIN',
      }
    }

    // Write prompt to a temp file
    const tmpDir = join(tmpdir(), 'fulcrum-claude-code')
    mkdirSync(tmpDir, { recursive: true })
    const promptFile = join(tmpDir, `${ctx.run_id}.txt`)
    writeFileSync(promptFile, buildPrompt(ctx), { encoding: 'utf8', mode: 0o600 })

    const args = ['--print', '--prompt-file', promptFile]
    if (ctx.model) args.push('--model', ctx.model)

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      FULCRUM_RUN_ID: ctx.run_id,
      FULCRUM_TASK_ID: ctx.task_id,
      FULCRUM_WORKSPACE_ID: ctx.workspace_id,
      FULCRUM_PROJECT_ID: ctx.project_id,
      FULCRUM_AGENT_ROLE: ctx.role,
    }
    if (ctx.worktree_path) env['FULCRUM_WORKTREE_PATH'] = ctx.worktree_path

    return new Promise<WorkerResult>((resolve) => {
      const proc = spawn(claudeBin, args, {
        env,
        cwd: ctx.worktree_path ?? process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      const stdout: Buffer[] = []
      const stderr: Buffer[] = []
      proc.stdout.on('data', (chunk: Buffer) => stdout.push(chunk))
      proc.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))

      // Heartbeat every 30 seconds
      const hb = setInterval(() => {
        void ctx.heartbeat('running', undefined)
      }, 30_000)

      proc.on('close', (code) => {
        clearInterval(hb)

        // Clean up temp file
        try { if (existsSync(promptFile)) unlinkSync(promptFile) } catch { /* ignore */ }

        if (code === 0) {
          const output = Buffer.concat(stdout).toString('utf8').trim()
          resolve({
            status: 'completed',
            summary: output.slice(0, 2000) || 'Claude Code agent completed',
          })
        } else {
          const errOutput = Buffer.concat(stderr).toString('utf8').trim()
          resolve({
            status: 'blocked',
            error: `claude exited with code ${code ?? 'unknown'}: ${errOutput.slice(0, 500)}`,
          })
        }
      })

      proc.on('error', (err) => {
        clearInterval(hb)
        try { if (existsSync(promptFile)) unlinkSync(promptFile) } catch { /* ignore */ }
        resolve({
          status: 'blocked',
          error: `Failed to spawn claude: ${err.message}`,
        })
      })
    })
  },
}
