export type PlanningArtifactExecutionStatus = "ready" | "passed" | "failed" | "blocked";

export interface PlanningArtifactExecutionInput {
  planId: string;
  artifactPath: string;
  status: PlanningArtifactExecutionStatus;
  prototypeId?: string;
  artifactId?: string;
  traceId?: string;
  command?: string;
  args?: string[];
  urlPath?: string;
  summary?: string;
  outputRef?: string;
  checks?: string[];
  executedAt?: string;
}

export interface PlanningArtifactExecutionRecord {
  planId: string;
  artifactPath: string;
  status: PlanningArtifactExecutionStatus;
  prototypeStatus: "ready" | "validated" | "failed" | "blocked";
  prototypeId?: string;
  artifactId?: string;
  traceId?: string;
  command?: string;
  args?: string[];
  urlPath?: string;
  summary?: string;
  outputRef?: string;
  checks?: string[];
  executedAt: string;
}

export function buildPlanningArtifactExecutionRecord(
  input: PlanningArtifactExecutionInput,
): PlanningArtifactExecutionRecord {
  const planId = input.planId.trim();
  if (!planId) throw new Error("planId is required.");
  const artifactPath = input.artifactPath.trim();
  if (!artifactPath) throw new Error("artifactPath is required.");
  if (!isPlanningArtifactExecutionStatus(input.status)) {
    throw new Error(`Unsupported artifact execution status: ${String(input.status)}`);
  }

  return {
    planId,
    artifactPath,
    status: input.status,
    prototypeStatus: prototypeStatusForExecutionStatus(input.status),
    ...(input.prototypeId?.trim() ? { prototypeId: input.prototypeId.trim() } : {}),
    ...(input.artifactId?.trim() ? { artifactId: input.artifactId.trim() } : {}),
    ...(input.traceId?.trim() ? { traceId: input.traceId.trim() } : {}),
    ...(input.command?.trim() ? { command: input.command.trim() } : {}),
    ...(input.args?.length ? { args: input.args.filter((arg) => arg.trim().length > 0) } : {}),
    ...(input.urlPath?.trim() ? { urlPath: input.urlPath.trim() } : {}),
    ...(input.summary?.trim() ? { summary: input.summary.trim() } : {}),
    ...(input.outputRef?.trim() ? { outputRef: input.outputRef.trim() } : {}),
    ...(input.checks?.length ? { checks: input.checks.filter((check) => check.trim().length > 0) } : {}),
    executedAt: input.executedAt?.trim() || new Date().toISOString(),
  };
}

export function mergePlanningArtifactExecutionMetadata(
  metadata: Record<string, unknown> | null | undefined,
  execution: PlanningArtifactExecutionRecord,
): Record<string, unknown> {
  const previousExecutions = Array.isArray(metadata?.executions) ? metadata.executions : [];
  return {
    ...(metadata ?? {}),
    execution,
    executions: [...previousExecutions, execution],
  };
}

function isPlanningArtifactExecutionStatus(
  value: unknown,
): value is PlanningArtifactExecutionStatus {
  return value === "ready" || value === "passed" || value === "failed" || value === "blocked";
}

function prototypeStatusForExecutionStatus(
  status: PlanningArtifactExecutionStatus,
): PlanningArtifactExecutionRecord["prototypeStatus"] {
  if (status === "passed") return "validated";
  return status;
}
