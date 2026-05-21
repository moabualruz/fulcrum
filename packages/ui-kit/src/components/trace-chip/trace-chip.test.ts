import { describe, expect, test } from "bun:test";
import { render } from "svelte/server";
import TraceChipRoot from "./trace-chip.svelte";

const FULL_ID = "4f3a1c9e2b7d8a6c5e1f0d3b9a7c2e4f";

describe("TraceChip", () => {
	test("renders the legacy compact pill by default", () => {
		const { body } = render(TraceChipRoot, { props: { traceId: FULL_ID } });
		expect(body).toContain('data-slot="trace-chip"');
		expect(body).toContain('data-variant="chip"');
		expect(body).toContain("◷");
	});

	test("badge variant renders the DESIGN.md §4.10 treatment", () => {
		const { body } = render(TraceChipRoot, {
			props: {
				traceId: FULL_ID,
				badge: true,
				project: "fulcrum",
				cycle: "cycle-12",
				timestamp: "2026-05-20 13:04 UTC",
			},
		});
		expect(body).toContain('data-variant="badge"');
		// §4.10: `trace:` prefix.
		expect(body).toContain('data-slot="trace-chip-prefix"');
		expect(body).toContain("trace:");
		// §4.10: 8-char hex prefix + ellipsis.
		expect(body).toContain("4f3a1c9e…");
		// §4.10: surface-sunken background, 24px height.
		expect(body).toContain("bg-surface-sunken");
		expect(body).toContain("h-6");
		// §4.10: hover tooltip carries full id + project + cycle + timestamp.
		expect(body).toContain(`title="${FULL_ID} · project fulcrum · cycle cycle-12 · at 2026-05-20 13:04 UTC"`);
	});

	test("badge keeps the keyboard-accessible copy control", () => {
		const { body } = render(TraceChipRoot, { props: { traceId: FULL_ID, badge: true } });
		expect(body).toContain('data-slot="trace-chip-copy"');
		expect(body).toContain('aria-label="Copy trace id"');
	});

	test("badge carries data-menu-open state for the right-click menu", () => {
		const { body } = render(TraceChipRoot, { props: { traceId: FULL_ID, badge: true } });
		expect(body).toContain('data-menu-open="false"');
	});

	test("uses OKLCH-tokened utilities only: no raw hex/hsl in markup", () => {
		const { body } = render(TraceChipRoot, { props: { traceId: FULL_ID, badge: true } });
		expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
		expect(body).not.toMatch(/\bhsl\(/);
	});
});
