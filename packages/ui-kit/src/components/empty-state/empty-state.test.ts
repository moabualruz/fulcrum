import { describe, expect, test } from "bun:test";
import { render } from "svelte/server";
import EmptyStateRoot from "./empty-state.svelte";

describe("EmptyState", () => {
	test("renders the title in an H2 with status role and aria-label", () => {
		const { body } = render(EmptyStateRoot, {
			props: {
				title: "No drafts yet.",
				description:
					"Drafts collect half-formed ideas. Press c to capture, or hand off from intake.",
			},
		});

		expect(body).toContain('data-slot="empty-state"');
		expect(body).toContain('role="status"');
		expect(body).toContain('aria-label="No drafts yet."');
		expect(body).toContain('data-slot="empty-state-title"');
		expect(body).toContain("<h2");
		expect(body).toContain("No drafts yet.");
		expect(body).toContain('data-slot="empty-state-description"');
		expect(body).toContain(
			"Drafts collect half-formed ideas. Press c to capture, or hand off from intake.",
		);
	});

	test("defaults to the absence tone and exposes it as a data attribute", () => {
		const { body } = render(EmptyStateRoot, {
			props: { title: "No tasks yet." },
		});
		expect(body).toContain('data-tone="absence"');
	});

	test("supports the steady tone for a healthy zero-data state", () => {
		const { body } = render(EmptyStateRoot, {
			props: { title: "No alerts firing.", tone: "steady" },
		});
		expect(body).toContain('data-tone="steady"');
	});

	test("renders a keyboard hint beside the actions slot: DESIGN.md §4.8", () => {
		const { body } = render(EmptyStateRoot, {
			props: { title: "No tasks yet.", keyHint: "Press c to capture." },
		});
		expect(body).toContain('data-slot="empty-state-actions"');
		expect(body).toContain('data-slot="empty-state-key-hint"');
		expect(body).toContain("Press c to capture.");
	});

	test("omits the actions container when no actions or key hint are supplied", () => {
		const { body } = render(EmptyStateRoot, {
			props: { title: "No tasks yet." },
		});
		expect(body).not.toContain('data-slot="empty-state-actions"');
	});

	test("never emits the COPY.md §2 banned empty-state strings", () => {
		const { body } = render(EmptyStateRoot, {
			props: {
				title: "No reviews waiting.",
				description: "Items appear here when a task moves to in-review. Push something forward.",
			},
		});
		expect(body).not.toContain("Oh no!");
		expect(body).not.toContain("Nothing here yet!");
	});
});
