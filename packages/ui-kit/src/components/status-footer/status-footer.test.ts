import { describe, expect, test } from "bun:test";
import { render } from "svelte/server";
import StatusFooterRoot from "./status-footer.svelte";

describe("StatusFooter", () => {
	test("renders left segments and the AI Assist trigger with role contentinfo", () => {
		const { body } = render(StatusFooterRoot, {
			props: {
				segments: [
					{ id: "mode", label: "NORMAL", pill: true },
					{ id: "branch", label: "auth/rewrite" },
				],
			},
		});
		expect(body).toContain('data-slot="status-footer"');
		expect(body).toContain('role="contentinfo"');
		expect(body).toContain('data-slot="status-footer-segment"');
		expect(body).toContain('data-segment-id="mode"');
		expect(body).toContain('data-slot="status-footer-pill"');
		expect(body).toContain('data-slot="status-footer-ai-assist"');
		expect(body).toContain("AI Assist");
		expect(body).toContain("⌘/");
	});

	test("threads footer density through data-footer-mode", () => {
		for (const mode of ["compact", "base", "comfortable"] as const) {
			const { body } = render(StatusFooterRoot, { props: { mode } });
			expect(body).toContain(`data-footer-mode="${mode}"`);
		}
	});

	test("uses OKLCH-tokened utilities only — no raw hex/hsl in markup", () => {
		const { body } = render(StatusFooterRoot, {
			props: { segments: [{ id: "branch", label: "main" }] },
		});
		expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
		expect(body).not.toMatch(/\bhsl\(/);
	});
});
