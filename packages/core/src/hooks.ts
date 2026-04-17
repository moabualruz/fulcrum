// packages/core/src/hooks.ts
// Pure hook type definitions shared across packages.
// Functions (normalizeHookEvent, runPreHook, runPostHook) live in fulcrum-cli
// because they depend on fulcrum-policy and fulcrum-memory.

/** The three supported CLI runtimes that can invoke Fulcrum hooks. */
export type HookCli = 'claude' | 'gemini' | 'pi'

/** Canonical internal shape of a tool-call event after normalization. */
export interface NormalizedHookEvent {
  toolName: string
  toolInput: Record<string, unknown>
  sessionId: string
  agentRole: string
  runId: string
}

/** Whether the hook fires before or after the tool call. */
export type HookPhase = 'pre' | 'post'

/** Full context passed to pre/post hook handlers. */
export interface HookContext {
  cliName: HookCli
  phase: HookPhase
  toolName: string
  toolInput: Record<string, unknown>
  sessionId: string
  agentRole: string
  runId: string
  workspace_id: string
}

/**
 * Normalized hook output — written as JSON to stdout before exit.
 * Claude Code reads this shape from hook stdout (exit code 2 = block).
 */
export interface HookOutput {
  continue: boolean
  suppressOutput?: boolean
  stopReason?: string
  message?: string
}

/**
 * Hook I/O surface — injected so the pre/post handlers are pure and
 * testable without spawning a subprocess. In production these are wired
 * to process.stdout/stderr.write and process.exit.
 */
export interface HookIO {
  stdout: (msg: string) => void
  stderr: (msg: string) => void
  exit: (code: number) => void
}
