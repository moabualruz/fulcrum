// packages/core/src/worktree-ops.ts
// Interface + registry for fulcrum-worktrees janitor operations.
// Zero imports from other workspace packages — safe to import from any package.
// The CLI (which depends on both fulcrum-agent-core and fulcrum-worktrees) wires
// the implementation at startup via setWorktreeOps(createWorktreeOps()),
// breaking the circular dependency without a dynamic import inside core.

export interface WorktreeOps {
  /** TTL-reap abandoned worktrees — returns count of rows deleted (H-10, spec §18.6). */
  cleanupAbandonedWorktrees(input?: { ttl_sec?: number }): Promise<number>
}

let _impl: WorktreeOps | null = null

/** Register the fulcrum-worktrees implementation. Call once at process startup. */
export function setWorktreeOps(impl: WorktreeOps): void {
  _impl = impl
}

/** Get the registered WorktreeOps implementation, or null if not yet registered. */
export function getWorktreeOps(): WorktreeOps | null {
  return _impl
}
