import { z } from "zod";

import { StatusBadgeSchema } from "./status.ts";
import { RunIdSchema, TraceIdSchema } from "./trace.ts";
import { WorkflowModeSchema, WorkflowStageSchema } from "./workflow.ts";

export const RunStatusValues = ["queued", "running", "succeeded", "failed", "cancelled"] as const;
export const RunStatusSchema = z.enum(RunStatusValues);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RunHandleSchema = z.object({
	id: RunIdSchema,
	traceId: TraceIdSchema,
	stage: WorkflowStageSchema,
	mode: WorkflowModeSchema,
	status: RunStatusSchema,
});

export type RunHandle = z.infer<typeof RunHandleSchema>;

export const ToolCallEventSchema = z.object({
	id: z.string().trim().min(1),
	runId: RunIdSchema,
	traceId: TraceIdSchema,
	name: z.string().trim().min(1),
	status: StatusBadgeSchema,
	startedAt: z.string().datetime({ offset: true }),
	finishedAt: z.string().datetime({ offset: true }).optional(),
});

export type ToolCallEvent = z.infer<typeof ToolCallEventSchema>;
