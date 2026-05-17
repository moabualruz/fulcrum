import type { EntityManager } from "typeorm";
import { z } from "zod";

import type {
  DependencyRunLiveFeedbackInput,
  DependencyRunLiveFeedbackOutput,
} from "@execution-orchestration/application/dependency-run-live-feedback.ts";
import type { AppContext } from "@work-management/domain/work-item.ts";

export type {
  DependencyRunLiveFeedbackInput,
  DependencyRunLiveFeedbackOutput,
};

const DependencyRunExecutorStatusSchema = z.object({
  queuedTaskCount: z.number().int(),
  runningTaskCount: z.number().int(),
  succeededTaskCount: z.number().int(),
  failedTaskCount: z.number().int(),
  blockedTaskCount: z.number().int(),
  inReviewCount: z.number().int(),
  active: z.boolean(),
  lastActivityAt: z.string().nullable(),
});

const DependencyRunLiveRunSchema = z.object({
  id: z.string(),
  taskId: z.string().nullable(),
  traceId: z.string(),
  status: z.string(),
  queuePosition: z.number().int(),
  dependencyIds: z.array(z.string()),
  latestEventSummary: z.string().nullable(),
  lastActivityAt: z.string().nullable(),
});

const DependencyRunLiveEventSchema = z.object({
  id: z.string(),
  runId: z.string(),
  taskId: z.string().nullable(),
  traceId: z.string(),
  sequence: z.number().int(),
  domain: z.string(),
  mutationType: z.string(),
  targetKind: z.string(),
  targetId: z.string(),
  agentId: z.string().nullable(),
  taskLineageId: z.string().nullable(),
  summary: z.string(),
  output: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});

export const DependencyRunLiveFeedbackOutputSchema = z.object({
  projectId: z.string(),
  traceId: z.string(),
  runGroupId: z.string(),
  fetchedAt: z.string(),
  executorStatus: DependencyRunExecutorStatusSchema,
  runs: z.array(DependencyRunLiveRunSchema),
  events: z.array(DependencyRunLiveEventSchema),
  latestEvent: DependencyRunLiveEventSchema.nullable(),
});

export function dependencyRunLiveFeedbackTopic(input: {
  orgId: string;
  projectId: string;
  traceId: string;
}): string {
  return `tasks.dependency-run-feedback.${input.orgId}.${input.projectId}.${input.traceId}`;
}

export async function loadDependencyRunLiveFeedbackForTasks(
  em: EntityManager,
  ctx: AppContext,
  input: DependencyRunLiveFeedbackInput,
): Promise<DependencyRunLiveFeedbackOutput> {
  const service = await import("@execution-orchestration/application/dependency-run-live-feedback.ts");
  return service.loadDependencyRunLiveFeedbackForTasks(em, ctx, input);
}
