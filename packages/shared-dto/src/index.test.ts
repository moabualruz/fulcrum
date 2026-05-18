import { describe, expect, test } from "bun:test";

import {
	RunHandleSchema,
	StatusBadgeSchema,
	ToolCallEventSchema,
	TraceIdSchema,
	WorkflowModeSchema,
	WorkflowStageSchema,
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

	test("locks workflow stage and mode values", () => {
		expect(WorkflowStageSchema.options).toEqual(["capture", "plan", "build", "review", "ship", "operate"]);
		expect(WorkflowModeSchema.options).toEqual(["manual", "play", "discuss", "assist"]);
	});

	test("validates trace ids, run handles, and tool call events at runtime", () => {
		const traceId = TraceIdSchema.parse("trace-shared-dto");

		expect(
			RunHandleSchema.parse({
				id: "run-1",
				traceId,
				stage: "build",
				mode: "assist",
				status: "running",
			}),
		).toEqual({
			id: "run-1",
			traceId,
			stage: "build",
			mode: "assist",
			status: "running",
		});

		expect(
			ToolCallEventSchema.parse({
				id: "tool-1",
				runId: "run-1",
				traceId,
				name: "git.status",
				status: "completed",
				startedAt: "2026-05-18T00:00:00.000Z",
				finishedAt: "2026-05-18T00:00:01.000Z",
			}),
		).toMatchObject({
			id: "tool-1",
			runId: "run-1",
			status: "completed",
		});
	});
});
