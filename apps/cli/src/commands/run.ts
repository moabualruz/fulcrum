import { runValidationAgent } from "@fulcrum/agents";
import {
  captureRunTranscript,
  type ArtifactService,
  type RunLifecycleService
} from "@fulcrum/core";

export function startRunCommand(
  runs: RunLifecycleService,
  input: { taskId: string; agentId: string; allocateWorktree?: boolean }
) {
  return runs.start({
    taskId: input.taskId,
    agentId: input.agentId,
    commandIdentity: input.agentId,
    allocateWorktree: input.allocateWorktree
  });
}

export async function startSupervisedValidationRunCommand(
  runs: RunLifecycleService,
  artifacts: ArtifactService,
  input: { taskId: string; agentId: string; allocateWorktree?: boolean; workRoot: string }
) {
  const supervisedValidation = ["adapter_validation", "validation"].includes(input.agentId);
  const run = startRunCommand(runs, {
    ...input,
    agentId: input.agentId === "validation" ? "adapter_validation" : input.agentId
  });
  if (!supervisedValidation) {
    return run;
  }
  const result = await runValidationAgent({
    run,
    worktreePath: `${input.workRoot}/${run.runId}`,
    onHeartbeat: (message) => {
      runs.heartbeat(run.runId, { source: input.agentId, message, progress: 50 });
    },
    onProgress: (message) => {
      runs.progress(run.runId, { source: input.agentId, message });
    }
  });
  const transcript = captureRunTranscript({
    runId: run.runId,
    logRoot: `${input.workRoot}/logs`,
    lines: result.transcript
  });
  const artifact = await artifacts.attach({
    type: "transcript",
    localRef: transcript.localRef,
    summary: transcript.summary,
    projectId: run.projectId,
    taskId: run.taskId,
    runId: run.runId,
    capturedBy: "agent.adapter_validation"
  });
  return runs.complete(run.runId, {
    summary: `${result.summary} Changed files: ${result.changedFiles.length}.`,
    outcome: "succeeded",
    artifactIds: [artifact.artifactId],
    logArtifactIds: [artifact.artifactId]
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
