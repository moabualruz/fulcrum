import { describe, expect, test } from "bun:test";

import {
	RunIdSchema,
	RunHandleSchema,
	RunStatusSchema,
	AbortReasonSchema,
	SortDirectionSchema,
	StatusBadgeSchema,
	ToolCallEventSchema,
	TraceIdentitySchema,
	TraceIdSchema,
	WorkflowModeSchema,
	WorkflowStageSchema,
	normalizeTraceId,
} from "./index.ts";

describe("@fulcrum/shared-dto", () => {
	test("locks canonical status badge values", () => {
		expect(StatusBadgeSchema.options).toEqual([
			"queued",
			"running",
			"waiting-input",
			"passing",
			"failing",
			"completed",
			"cancelled",
			"blocked",
		]);
	});

	test("locks canonical run status values", () => {
		expect(RunStatusSchema.options).toEqual(["queued", "running", "succeeded", "failed", "cancelled"]);
	});

	test("locks workflow stage and mode values", () => {
		expect(WorkflowStageSchema.options).toEqual(["capture", "plan", "build", "review", "ship", "operate"]);
		expect(WorkflowModeSchema.options).toEqual(["manual", "play", "discuss", "assist"]);
	});

	test("locks session and sorting vocabularies", () => {
		expect(AbortReasonSchema.options).toEqual(["user-cancel", "dangerous-output", "wrong-context", "cost-cap"]);
		expect(SortDirectionSchema.options).toEqual(["asc", "desc"]);
	});

	test("validates trace ids, run handles, and tool call events at runtime", () => {
		const traceId = TraceIdSchema.parse("trace-shared-dto");
		const runId = RunIdSchema.parse("run-1");

		expect(
			RunHandleSchema.parse({
				id: runId,
				traceId,
				stage: "build",
				mode: "assist",
				status: "running",
			}),
		).toEqual({
			id: runId,
			traceId,
			stage: "build",
			mode: "assist",
			status: "running",
		});

		expect(
			ToolCallEventSchema.parse({
				id: "tool-1",
				runId,
				traceId,
				name: "git.status",
				status: "completed",
				startedAt: "2026-05-18T00:00:00.000Z",
				finishedAt: "2026-05-18T00:00:01.000Z",
			}),
		).toMatchObject({
			id: "tool-1",
			runId,
			status: "completed",
		});
	});

	test("normalizes trace identity fields for cross-surface envelopes", () => {
		expect(normalizeTraceId("8B2D4A6F9C1E3A5B8B2D4A6F9C1E3A5B")).toBe("8b2d4a6f9c1e3a5b8b2d4a6f9c1e3a5b");
		expect(normalizeTraceId("not-a-trace")).toBeUndefined();

		expect(
			TraceIdentitySchema.parse({
				trace_id: "8b2d4a6f9c1e3a5b8b2d4a6f9c1e3a5b",
				span_id: "span-1",
				run_id: "run-1",
				project_id: null,
			}),
		).toEqual({
			trace_id: "8b2d4a6f9c1e3a5b8b2d4a6f9c1e3a5b",
			span_id: "span-1",
			run_id: "run-1",
			project_id: null,
		});
	});
});
