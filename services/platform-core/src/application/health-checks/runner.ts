// Doctor runner — parallel batch execution with per-check timeout and
// exponential backoff on flaky checks.

import type { CheckSeverity, CheckStatus, DoctorCheckDef, DoctorCheckResult } from "./types.ts";

export interface RunnerOpts {
  /** Per-check timeout in ms (default 10_000). */
  timeoutMs?: number;
  /** Max retries for flaky checks (default 2 → up to 3 attempts). */
  maxRetries?: number;
  /** Subsystem filter — when set, only checks matching this name run. */
  subsystem?: string;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RECOVERY = "Inspect the subsystem-specific doctor output and rerun `fulcrum doctor` after repair.";

function severityForStatus(status: CheckStatus): CheckSeverity {
  if (status === "fail") return "critical";
  if (status === "warn") return "warning";
  return "info";
}

async function runOneCheck(
  def: DoctorCheckDef,
  timeoutMs: number,
): Promise<DoctorCheckResult> {
  const t0 = Date.now();
  try {
    const result = await Promise.race([
      def.run(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("check timed out")), timeoutMs),
      ),
    ]);
    return {
      name: def.name,
      subsystem: def.subsystem,
      durationMs: Date.now() - t0,
      severity: result.severity ?? severityForStatus(result.status),
      recovery: result.recovery ?? (result.status === "ok" ? undefined : DEFAULT_RECOVERY),
      ...result,
    };
  } catch (err) {
    return {
      name: def.name,
      subsystem: def.subsystem,
      status: "fail" as CheckStatus,
      severity: "critical",
      message: (err as Error).message,
      recovery: DEFAULT_RECOVERY,
      durationMs: Date.now() - t0,
    };
  }
}

/**
 * Run all checks in parallel. Retries failing checks with exponential backoff.
 */
export async function runChecks(
  checks: DoctorCheckDef[],
  opts: RunnerOpts = {},
): Promise<DoctorCheckResult[]> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const subsystem = opts.subsystem;

  const filtered = subsystem
    ? checks.filter((c) => c.subsystem === subsystem)
    : checks;

  // First pass — run all in parallel.
  let results = await Promise.all(
    filtered.map((def) => runOneCheck(def, timeoutMs)),
  );

  // Retry failed checks with exponential backoff.
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const failed = results.filter((r) => r.status === "fail");
    if (failed.length === 0) break;

    const backoffMs = 100 * Math.pow(2, attempt - 1); // 100, 200, 400…
    await new Promise((resolve) => setTimeout(resolve, backoffMs));

    const failedNames = new Set(failed.map((r) => r.name));
    const retryDefs = filtered.filter((d) => failedNames.has(d.name));
    const retried = await Promise.all(
      retryDefs.map((def) => runOneCheck(def, timeoutMs)),
    );

    // Merge: replace failed results with retried ones (keep best).
    const retriedMap = new Map(retried.map((r) => [r.name, r]));
    results = results.map((r) => {
      if (r.status !== "fail") return r;
      const retry = retriedMap.get(r.name);
      return retry && retry.status !== "fail" ? retry : r;
    });
  }

  return results;
}
