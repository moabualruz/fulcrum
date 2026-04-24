import type { MemoryService } from "@fulcrum/core";

export function draftMemoryCommand(
  service: MemoryService,
  input: {
    projectId: string;
    title: string;
    body: string;
    sourceUri?: string;
    taskId?: string;
    runId?: string;
  }
) {
  return service.draft({
    projectId: input.projectId,
    title: input.title,
    body: input.body,
    sourceRefs: input.sourceUri ? [{ type: "file", uri: input.sourceUri }] : [],
    linkedTaskIds: input.taskId ? [input.taskId] : [],
    linkedRunIds: input.runId ? [input.runId] : []
  });
}

export function approveMemoryCommand(
  service: MemoryService,
  memoryId: string,
  input: { policyDecisionId?: string; requester?: string }
) {
  return service.approve(memoryId, input);
}
