import type { EntityManager } from "typeorm";

import {
  buildApprovedPlanBreakdown,
  materializeApprovedPlanBreakdownWithApplicationCommands,
  type ApprovedPlanBreakdown,
  type ApprovedPlanMaterializationResult,
  type BuildApprovedPlanBreakdownInput,
} from "@planning-review/application/approved-plan-breakdown.ts";
import type { AppContext } from "@work-management/domain/work-item.ts";

export interface ApprovedPlanMaterializeResult {
  breakdown: ApprovedPlanBreakdown;
  materialization: ApprovedPlanMaterializationResult;
}

export async function previewApprovedPlanBreakdown(
  input: BuildApprovedPlanBreakdownInput,
): Promise<ApprovedPlanBreakdown> {
  return buildApprovedPlanBreakdown(input);
}

export async function materializeApprovedPlanBreakdown(
  em: EntityManager,
  ctx: AppContext,
  input: BuildApprovedPlanBreakdownInput,
): Promise<ApprovedPlanMaterializeResult> {
  const breakdown = buildApprovedPlanBreakdown(input);
  const materialization = await materializeApprovedPlanBreakdownWithApplicationCommands(em, ctx, breakdown);
  return { breakdown, materialization };
}
