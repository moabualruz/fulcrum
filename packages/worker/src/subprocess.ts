// packages/worker/src/subprocess.ts
// Generic subprocess adapter — opt-in via $FULCRUM_AGENT_SUBPROCESS_CMD.
// Runs the configured command with the SpawnContext surfaced via env
// vars and parses a WorkerResult JSON blob from stdout. If stdout is not
// valid JSON we fall back to treating it as a plain-text summary — the
// run still counts as completed. Any non-zero exit / exec error becomes
// a blocked run with the error message.

import { execFile } from 'child_process'
import { promisify } from 'util'
import type { AgentAdapter, SpawnContext, WorkerResult } from './types.js'

const execFileAsync = promisify(execFile)

export const subprocessAdapter: AgentAdapter = {
  name: 'subprocess',
  async spawn(ctx: SpawnContext): Promise<WorkerResult> {
    const cmd = process.env['FULCRUM_AGENT_SUBPROCESS_CMD']
    if (!cmd) {
      return { status: 'blocked', error: 'FULCRUM_AGENT_SUBPROCESS_CMD not set' }
    }
    await ctx.heartbeat('subprocess_started', 0)

    const parts = cmd.split(/\s+/).filter((p) => p.length > 0)
    const [bin, ...args] = parts
    if (!bin) {
      return { status: 'blocked', error: 'FULCRUM_AGENT_SUBPROCESS_CMD is empty' }
    }

    try {
      const { stdout } = await execFileAsync(bin, args, {
        env: {
          ...process.env,
          FULCRUM_RUN_ID: ctx.run_id,
          FULCRUM_ROLE: ctx.role,
          FULCRUM_WORKSPACE_ID: ctx.workspace_id,
          FULCRUM_PROJECT_ID: ctx.project_id,
          FULCRUM_TASK_ID: ctx.task_id,
          FULCRUM_MODEL: ctx.model ?? '',
          FULCRUM_WORKTREE_PATH: ctx.worktree_path ?? '',
        },
        maxBuffer: 16 * 1024 * 1024,
      })
      await ctx.heartbeat('subprocess_finished', 100)
      try {
        return JSON.parse(stdout) as WorkerResult
      } catch {
        return { status: 'completed', summary: stdout.slice(0, 2000) }
      }
    } catch (err) {
      return { status: 'blocked', error: (err as Error).message }
    }
  },
}
