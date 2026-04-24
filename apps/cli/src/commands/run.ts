import type { RunLifecycleService } from "@fulcrum/core";

export function startRunCommand(
  runs: RunLifecycleService,
  input: { taskId: string; agentId: string }
) {
  return runs.start({
    taskId: input.taskId,
    agentId: input.agentId,
    commandIdentity: input.agentId
  });
}

export function runStatusCommand(runs: RunLifecycleService, runId: string) {
  const run = runs.get(runId);
  return run ? { run, events: runs.events(runId) } : undefined;
}

export function cancelRunCommand(runs: RunLifecycleService, runId: string, reason?: string) {
  return runs.cancel(runId, reason);
}

export function tailRunCommand(runs: RunLifecycleService, runId: string) {
  return runs.events(runId);
}
