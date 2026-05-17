import type { EntityManager } from "typeorm";

import type {
  RecordTaskQaReviewInput,
  TaskQaReviewOutput,
} from "@execution-orchestration/application/qa-review-actions.ts";
import type { AppContext } from "@work-management/domain/work-item.ts";

export type {
  RecordTaskQaReviewInput,
  TaskQaReviewOutput,
};

export async function recordTaskQaReview(
  em: EntityManager,
  ctx: AppContext,
  input: RecordTaskQaReviewInput,
): Promise<TaskQaReviewOutput> {
  const service = await import("@execution-orchestration/application/qa-review-actions.ts");
  return service.recordTaskQaReview(em, ctx, input);
}
