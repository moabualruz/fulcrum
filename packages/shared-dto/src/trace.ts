import { z } from "zod";

export const TraceIdSchema = z.string().trim().min(1);
export type TraceId = z.infer<typeof TraceIdSchema>;

export const SpanIdSchema = z.string().trim().min(1);
export type SpanId = z.infer<typeof SpanIdSchema>;

export const RunIdSchema = z.string().trim().min(1);
export type RunId = z.infer<typeof RunIdSchema>;

export const ProjectIdSchema = z.string().trim().min(1);
export type ProjectId = z.infer<typeof ProjectIdSchema>;

export const TraceIdentitySchema = z.object({
	trace_id: TraceIdSchema,
	span_id: SpanIdSchema,
	run_id: RunIdSchema.nullable(),
	project_id: ProjectIdSchema.nullable(),
});

export type TraceIdentity = z.infer<typeof TraceIdentitySchema>;

export function normalizeTraceId(value: string | undefined): TraceId | undefined {
	return value && /^[0-9a-f]{32}$/i.test(value) ? value.toLowerCase() : undefined;
}
