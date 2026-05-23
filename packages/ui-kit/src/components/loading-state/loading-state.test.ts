import { describe, expect, test } from "bun:test";
import { render } from "svelte/server";
import LoadingStateRoot from "./loading-state.svelte";

describe("LoadingState", () => {
	test("renders a deterministic busy status with loading state attributes", () => {
		const { body } = render(LoadingStateRoot, {
			props: {
				title: "Loading Review",
				description: "Fetching review queue.",
			},
		});

		expect(body).toContain('data-slot="loading-state"');
		expect(body).toContain('data-state="loading"');
		expect(body).toContain('role="status"');
		expect(body).toContain('aria-busy="true"');
		expect(body).toContain("Loading Review");
		expect(body).toContain("Fetching review queue.");
	});

	test("exposes density and shape for route-specific skeleton contracts", () => {
		const { body } = render(LoadingStateRoot, {
			props: {
				density: "compact",
				shape: "table",
				rows: 2,
			},
		});

		expect(body).toContain('data-density="compact"');
		expect(body).toContain('data-shape="table"');
		expect(body).toContain('data-slot="loading-state-skeletons"');
	});
});
