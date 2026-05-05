/**
 * Session resumption: on retry, look up prior run's transcript_path
 * and pass it to the sandcastle worktree for session continuation.
 * Gated by FULCRUM_FEATURES=session-resume. Claude-code profile only.
 *
 * D-21: Retry/continuation must pass prior transcript/session information
 * when the agent supports session resume. Unsupported agents must fail
 * clearly or no-op by declared capability, not silently lose resume behavior.
 */

export interface PriorRunLookup {
  /** Find the transcript path for the most recent prior run of a task. */
  findPriorTranscriptPath(taskId: string, currentRunId: string): Promise<string | null>;
  /** Find the prior thread ID for Codex app-server thread/resume (optional). */
  findPriorThreadId?(taskId: string, currentRunId: string): Promise<string | null>;
}

/**
 * How the session resume was resolved.
 *
 * - "transcript-path": non-Codex profile resume via prior transcript file path
 * - "thread/resume":   Codex app-server resume via prior thread ID
 * - "unsupported":     profile does not declare session resume support
 */
export type ResumeVia = "transcript-path" | "thread/resume" | "unsupported";

export interface SessionResumeResult {
  /** Whether session resume was attempted (flag on + profile supports it). */
  readonly attempted: boolean;
  /** The transcript path used for resumption, if any. */
  readonly transcriptPath?: string;
  /** Whether cold start fallback was used. */
  readonly coldStart: boolean;
  /**
   * How the resume was resolved. Present when the feature flag is on.
   * "unsupported" — profile does not declare capability.
   * "transcript-path" — prior transcript path provided to agent.
   * "thread/resume" — Codex app-server thread ID resume.
   */
  readonly resumeVia?: ResumeVia;
  /**
   * Capability declaration for observability.
   * "unsupported" when supportsSessionResume is falsy.
   * "supported" when supportsSessionResume is true.
   */
  readonly capability?: "supported" | "unsupported";
  /** Prior Codex thread ID when resumeVia is "thread/resume". */
  readonly threadId?: string;
}

/**
 * Check whether the session-resume feature flag is enabled.
 */
export function isSessionResumeEnabled(features?: string): boolean {
  return parseFlags(features).has("session-resume");
}

/**
 * Resolve session resume context for a run.
 *
 * Returns the prior transcript path (non-Codex) or thread ID (Codex)
 * if available, flag is on, and profile declares support.
 *
 * Codex agents use the thread/resume path (D-21).
 * Non-Codex agents that declare supportsSessionResume use transcript-path.
 * Unsupported agents always return attempted=false with explicit capability state.
 */
export async function resolveSessionResume(opts: {
  features?: string;
  supportsSessionResume?: boolean;
  /** Agent name for routing: "codex" → thread/resume, others → transcript-path. */
  agentName?: string;
  taskId?: string;
  currentRunId?: string;
  priorRunLookup?: PriorRunLookup;
}): Promise<SessionResumeResult> {
  if (!isSessionResumeEnabled(opts.features)) {
    return { attempted: false, coldStart: true };
  }

  if (!opts.supportsSessionResume) {
    // Explicit unsupported state — not a silent no-op
    return {
      attempted: false,
      coldStart: true,
      capability: "unsupported",
      resumeVia: "unsupported",
    };
  }

  if (!opts.taskId || !opts.currentRunId || !opts.priorRunLookup) {
    return { attempted: true, coldStart: true, capability: "supported" };
  }

  const isCodex = opts.agentName === "codex";

  // Codex app-server path: prefer thread/resume via threadId
  if (isCodex && opts.priorRunLookup.findPriorThreadId) {
    const threadId = await opts.priorRunLookup.findPriorThreadId(opts.taskId, opts.currentRunId);
    if (threadId) {
      return {
        attempted: true,
        coldStart: false,
        capability: "supported",
        resumeVia: "thread/resume",
        threadId,
      };
    }
    // Fall through to transcript-path if no threadId found
  }

  // Transcript-path resume (non-Codex or Codex fallback)
  const transcriptPath = await opts.priorRunLookup.findPriorTranscriptPath(
    opts.taskId,
    opts.currentRunId,
  );

  if (!transcriptPath) {
    return { attempted: true, coldStart: true, capability: "supported" };
  }

  return {
    attempted: true,
    transcriptPath,
    coldStart: false,
    capability: "supported",
    resumeVia: "transcript-path",
  };
}

function parseFlags(features?: string): Set<string> {
  if (!features) return new Set();
  return new Set(
    features
      .split(",")
      .map((f) => f.trim().split(":")[0]?.toLowerCase())
      .filter(Boolean) as string[],
  );
}
