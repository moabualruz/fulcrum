// packages/worker/src/stub.ts
// Stub adapter — the default in tests and local dev. Reads canned
// WorkerResult JSON from $FULCRUM_AGENT_STUB_DIR/<run_id>.json so tests
// can seed deterministic results. If no canned file is present it emits
// a single heartbeat and returns a generic "completed" shape.

import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type { AgentAdapter, SpawnContext, WorkerResult } from './types.js'

export const stubAdapter: AgentAdapter = {
  name: 'stub',
  async spawn(ctx: SpawnContext): Promise<WorkerResult> {
    await ctx.heartbeat('stub_started', 0)

    const dir = process.env['FULCRUM_AGENT_STUB_DIR']
    if (dir) {
      const cannedPath = join(dir, `${ctx.run_id}.json`)
      if (existsSync(cannedPath)) {
        const canned = JSON.parse(readFileSync(cannedPath, 'utf8')) as WorkerResult
        await ctx.heartbeat('stub_finished', 100)
        return canned
      }
    }

    await ctx.heartbeat('stub_finished', 100)
    return {
      status: 'completed',
      summary: `[stub] ${ctx.role} ran with no canned response`,
    }
  },
}
