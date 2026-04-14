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
function findClaudeBin(): string | null {
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
    writeFileSync(promptFile, buildPrompt(ctx), 'utf8')

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
