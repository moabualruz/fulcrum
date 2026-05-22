import { describe, expect, test } from "bun:test";

import {
	captureItemFactory,
	captureItemSchema,
	workflowFixtureIds,
} from "@fulcrum/test-fixtures";

describe("@fulcrum/test-fixtures", () => {
	test("exports shared factories through the package alias", () => {
		const item = captureItemFactory.build({
			title: "Review OAuth callback copy",
			status: "triaged",
			source: "manual",
		});

		expect(captureItemSchema.parse(item)).toMatchObject({
			title: "Review OAuth callback copy",
			status: "triaged",
			source: "manual",
		});
	});

	test("exports cross-surface workflow fixture ids", () => {
		expect(workflowFixtureIds().taskId).toBe("uat_work_task_agent_dispatch");
	});
});
