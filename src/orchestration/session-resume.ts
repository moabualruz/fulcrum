/**
 * Session resumption: on retry, look up prior run's transcript_path
 * and pass it to the sandcastle worktree for session continuation.
 * Gated by FULCRUM_FEATURES=session-resume. Claude-code profile only.
 */

export interface PriorRunLookup {
  /** Find the transcript path for the most recent prior run of a task. */
  findPriorTranscriptPath(taskId: string, currentRunId: string): Promise<string | null>;
}

export interface SessionResumeResult {
  /** Whether session resume was attempted. */
  readonly attempted: boolean;
  /** The transcript path used for resumption, if any. */
  readonly transcriptPath?: string;
  /** Whether cold start fallback was used. */
  readonly coldStart: boolean;
}

/**
 * Check whether the session-resume feature flag is enabled.
 */
export function isSessionResumeEnabled(features?: string): boolean {
  return parseFlags(features).has("session-resume");
}

/**
 * Resolve session resume context for a run.
 * Returns the prior transcript path if available + flag on + profile supports it.
 */
export async function resolveSessionResume(opts: {
  features?: string;
  supportsSessionResume?: boolean;
  taskId?: string;
  currentRunId?: string;
  priorRunLookup?: PriorRunLookup;
}): Promise<SessionResumeResult> {
  if (!isSessionResumeEnabled(opts.features)) {
    return { attempted: false, coldStart: true };
  }

  if (!opts.supportsSessionResume) {
    return { attempted: false, coldStart: true };
  }

  if (!opts.taskId || !opts.currentRunId || !opts.priorRunLookup) {
    return { attempted: true, coldStart: true };
  }

  const transcriptPath = await opts.priorRunLookup.findPriorTranscriptPath(
    opts.taskId,
    opts.currentRunId,
  );

  if (!transcriptPath) {
    return { attempted: true, coldStart: true };
  }

  return { attempted: true, transcriptPath, coldStart: false };
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
