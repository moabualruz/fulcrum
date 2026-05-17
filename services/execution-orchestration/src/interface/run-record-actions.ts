export type RunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type { DispatchRunInput } from "@execution-orchestration/application/agent-run-service-actions.ts";

type DispatchRunAction = typeof import("@execution-orchestration/application/agent-run-service-actions.ts").dispatchRunAction;
type CancelRunAction = typeof import("@execution-orchestration/application/agent-run-service-actions.ts").cancelRunAction;
type RetryRunAction = typeof import("@execution-orchestration/application/agent-run-service-actions.ts").retryRunAction;

export async function dispatchRunAction(
  ...args: Parameters<DispatchRunAction>
): Promise<Awaited<ReturnType<DispatchRunAction>>> {
  const actions = await import("@execution-orchestration/application/agent-run-service-actions.ts");
  return actions.dispatchRunAction(...args);
}

export async function cancelRunAction(
  ...args: Parameters<CancelRunAction>
): Promise<Awaited<ReturnType<CancelRunAction>>> {
  const actions = await import("@execution-orchestration/application/agent-run-service-actions.ts");
  return actions.cancelRunAction(...args);
}

export async function retryRunAction(
  ...args: Parameters<RetryRunAction>
): Promise<Awaited<ReturnType<RetryRunAction>>> {
  const actions = await import("@execution-orchestration/application/agent-run-service-actions.ts");
  return actions.retryRunAction(...args);
}
