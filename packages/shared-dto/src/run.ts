import { z } from "zod";

import { StatusBadgeSchema } from "./status.ts";
import { TraceIdSchema } from "./trace.ts";
import { WorkflowModeSchema, WorkflowStageSchema } from "./workflow.ts";

export const RunHandleSchema = z.object({
	id: z.string().trim().min(1),
	traceId: TraceIdSchema,
	stage: WorkflowStageSchema,
	mode: WorkflowModeSchema,
	status: StatusBadgeSchema,
});

export type RunHandle = z.infer<typeof RunHandleSchema>;

export const ToolCallEventSchema = z.object({
	id: z.string().trim().min(1),
	runId: z.string().trim().min(1),
	traceId: TraceIdSchema,
	name: z.string().trim().min(1),
	status: StatusBadgeSchema,
	startedAt: z.string().datetime({ offset: true }),
	finishedAt: z.string().datetime({ offset: true }).optional(),
});

export type ToolCallEvent = z.infer<typeof ToolCallEventSchema>;
