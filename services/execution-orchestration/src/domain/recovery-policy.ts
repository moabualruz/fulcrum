export const MAX_RECOVERY_RETRIES = 3;
export const BASE_RECOVERY_DELAY_MS = 60_000;
export const MAX_RECOVERY_DELAY_MS = 300_000;
export const RECOVERY_BACKOFF_MULTIPLIER = 2;

export interface RecoveryState {
  recoveryRetryCount?: number;
  nextRecoveryAt?: string;
}

export interface RecoveryDecision {
  shouldRetry: boolean;
  exhausted: boolean;
  nextState: RecoveryState;
  delayMs: number;
}

export function computeRecoveryDecision(
  currentState: RecoveryState,): RecoveryDecision {
  const currentCount = currentState.recoveryRetryCount ?? 0;
  const nextCount = currentCount + 1;

  if (nextCount > MAX_RECOVERY_RETRIES) {
    return {
      shouldRetry: false,
      exhausted: true,
      nextState: { recoveryRetryCount: undefined, nextRecoveryAt: undefined },
      delayMs: 0,
    };
  }

  const rawDelay = Math.min(
    BASE_RECOVERY_DELAY_MS * RECOVERY_BACKOFF_MULTIPLIER ** (nextCount - 1),
    MAX_RECOVERY_DELAY_MS,);

  const jitter = rawDelay * 0.1 * (2 * Math.random() - 1);
  const delayMs = Math.max(0, Math.round(rawDelay + jitter));
  const nextRecoveryAt = new Date(Date.now() + delayMs).toISOString();

  return {
    shouldRetry: true,
    exhausted: false,
    nextState: {
      recoveryRetryCount: nextCount,
      nextRecoveryAt,
    },
    delayMs,
  };
}

export function formatRecoveryDelay(delayMs: number): string {
  const seconds = Math.round(delayMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return seconds % 60 === 0 ? `${minutes}m` : `${seconds}s`;
}
