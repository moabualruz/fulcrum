export type TraceLinkIdName =
  | "projectId"
  | "taskId"
  | "runId"
  | "traceId"
  | "runGroupId"
  | "reviewId"
  | "docId"
  | "artifactId"
  | "memoryId";

export interface TraceLinkField {
  name: TraceLinkIdName;
  cliFlags: readonly string[];
  cliOutputFields: readonly string[];
  tuiPlacements: readonly string[];
  apiPayloadFields: readonly string[];
  workflows: readonly string[];
}

export const TRACE_LINK_FIELDS = [
  {
    name: "projectId",
    cliFlags: ["--project", "--project-id"],
    cliOutputFields: ["projectId", "project_id"],
    tuiPlacements: ["status footer project segment", "task detail Trace > Project", "planning screen Project"],
    apiPayloadFields: ["projectId", "project_id"],
    workflows: ["create", "planning", "reports", "runs", "artifacts", "memory"],
  },
  {
    name: "taskId",
    cliFlags: ["--task", "--task-id", "positional <task-id>"],
    cliOutputFields: ["taskId", "task_id", "targetTaskIds"],
    tuiPlacements: ["task list row id", "task detail Entity", "run dispatch scheduled task"],
    apiPayloadFields: ["taskId", "task_id", "targetTaskIds"],
    workflows: ["create", "run", "review", "reports"],
  },
  {
    name: "runId",
    cliFlags: ["--run", "--run-id", "positional <run-id>"],
    cliOutputFields: ["runId", "run_id", "scheduledRuns[].id"],
    tuiPlacements: ["status footer run segment", "runs list row", "run detail heading"],
    apiPayloadFields: ["runId", "run_id", "scheduledRuns[].id"],
    workflows: ["run", "artifacts", "reports"],
  },
  {
    name: "traceId",
    cliFlags: ["--trace", "FULCRUM_TRACE_ID"],
    cliOutputFields: ["traceId", "trace_id"],
    tuiPlacements: ["status footer trace segment", "planning screen Trace", "task list dependency feedback Trace"],
    apiPayloadFields: ["traceId", "trace_id"],
    workflows: ["create", "run", "review", "docs", "artifacts", "memory", "reports"],
  },
  {
    name: "runGroupId",
    cliFlags: ["--run-group", "--trace"],
    cliOutputFields: ["runGroupId", "run_group_id"],
    tuiPlacements: ["dependency run dispatched Group", "dependency run feedback Trace"],
    apiPayloadFields: ["runGroupId", "run_group_id"],
    workflows: ["run", "watch"],
  },
  {
    name: "reviewId",
    cliFlags: ["--review", "--trace"],
    cliOutputFields: ["reviewId", "review_id", "reviewSessions[].id"],
    tuiPlacements: ["planning review sessions", "reports review session output"],
    apiPayloadFields: ["reviewId", "review_id", "reviewSessions[].id"],
    workflows: ["review", "reports"],
  },
  {
    name: "docId",
    cliFlags: ["--doc", "--doc-id", "--file"],
    cliOutputFields: ["docId", "doc_id", "documentId"],
    tuiPlacements: ["docs tree row", "planning selected doc ids"],
    apiPayloadFields: ["docId", "doc_id", "documentId", "selectedDocIds"],
    workflows: ["docs", "planning", "memory"],
  },
  {
    name: "artifactId",
    cliFlags: ["--artifact", "--artifact-id", "positional <artifact-id>"],
    cliOutputFields: ["artifactId", "artifact_id", "artifacts[].id"],
    tuiPlacements: ["artifacts row id", "run detail Artifacts", "planning artifact execution"],
    apiPayloadFields: ["artifactId", "artifact_id", "artifacts[].id"],
    workflows: ["artifacts", "run", "reports"],
  },
  {
    name: "memoryId",
    cliFlags: ["--memory", "--memory-id", "positional <memory-id>"],
    cliOutputFields: ["memoryId", "memory_id", "memory[].id"],
    tuiPlacements: ["memory browser row", "run detail Memory", "context preview Recent transcripts"],
    apiPayloadFields: ["memoryId", "memory_id", "memory[].id"],
    workflows: ["memory", "run", "context"],
  },
] as const satisfies readonly TraceLinkField[];

export function listTraceLinkFields(): readonly TraceLinkField[] {
  return TRACE_LINK_FIELDS;
}

export function findTraceLinkField(name: TraceLinkIdName): TraceLinkField {
  const field = TRACE_LINK_FIELDS.find((candidate) => candidate.name === name);
  if (!field) throw new Error(`Trace link field ${name} is not registered.`);
  return field;
}
