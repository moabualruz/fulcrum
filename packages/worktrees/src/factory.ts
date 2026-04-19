// packages/worktrees/src/factory.ts
// Factory that bundles worktree janitor operations into a WorktreeOps implementation.
// The CLI (or any host that depends on both fulcrum-agent-core and fulcrum-worktrees)
// calls setWorktreeOps(createWorktreeOps()) once at startup to register the impl.

import type { WorktreeOps } from 'fulcrum-agent-core'
import { cleanupAbandonedWorktrees } from './worktrees.js'

export function createWorktreeOps(): WorktreeOps {
  return {
    cleanupAbandonedWorktrees: (input) => cleanupAbandonedWorktrees(input ?? {}),
  }
}
