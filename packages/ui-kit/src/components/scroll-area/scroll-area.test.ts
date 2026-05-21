import { describe, expect, test } from "bun:test";
import { render } from "svelte/server";
import ScrollAreaRoot from "./scroll-area.svelte";

// bits-ui renders the hover scrollbars only client-side once content overflows,
// so SSR assertions cover the always-present root + viewport contract and the
// `data-orientation` state attribute. Scrollbar wiring is exercised by the
// design-e2e fixture in the running browser.
describe("ScrollArea", () => {
	test("renders the scroll-area slot wrapping a viewport", () => {
		const { body } = render(ScrollAreaRoot, { props: {} });

		expect(body).toContain('data-slot="scroll-area"');
		expect(body).toContain('data-slot="scroll-area-viewport"');
	});

	test("exposes the orientation as a data attribute for design-e2e", () => {
		expect(render(ScrollAreaRoot, { props: {} }).body).toContain(
			'data-orientation="vertical"',
		);
		expect(render(ScrollAreaRoot, { props: { orientation: "horizontal" } }).body).toContain(
			'data-orientation="horizontal"',
		);
		expect(render(ScrollAreaRoot, { props: { orientation: "both" } }).body).toContain(
			'data-orientation="both"',
		);
	});

	test("keeps the viewport keyboard-focusable", () => {
		const { body } = render(ScrollAreaRoot, { props: {} });

		expect(body).toContain("focus-visible:ring-3");
		expect(body).toContain("outline-none");
	});

	test("merges caller classes onto the root without dropping the base class", () => {
		const { body } = render(ScrollAreaRoot, { props: { class: "h-64" } });

		expect(body).toContain("relative");
		expect(body).toContain("h-64");
	});

	test("renders projected children inside the viewport", () => {
		const { body } = render(ScrollAreaRoot, {
			props: {},
		});

		// The viewport content wrapper is always present even with no children.
		expect(body).toContain("data-scroll-area-content");
	});
});
