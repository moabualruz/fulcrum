import { describe, expect, test } from "bun:test";

import { captureItemFactory, captureItemSchema } from "./capture-item.factory.ts";

describe("captureItemFactory", () => {
	test("build returns a valid CaptureItem", () => {
		const item = captureItemFactory.build();

		expect(captureItemSchema.safeParse(item).success).toBe(true);
		expect(item.title.length).toBeGreaterThan(0);
	});

	test("build accepts targeted overrides", () => {
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
});
