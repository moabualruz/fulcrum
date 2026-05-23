import { describe, expect, test } from "bun:test";
import { render } from "svelte/server";
import AcpDrawerRoot from "./acp-drawer.svelte";

/**
 * AcpDrawer composes the bits-ui-backed Sheet primitive; its drawer content is
 * portalled and only mounts in the browser, so SSR emits no content markup.
 * These tests assert SSR-safe contracts; the rendered drawer surface
 * (data-open / data-side / header / mobile bottom-sheet branch) is verified by
 * apps/web/tests/design-e2e/design-kit-shell-primitives.spec.ts.
 */
describe("AcpDrawer", () => {
	test("renders without throwing when closed", () => {
		const result = render(AcpDrawerRoot, { props: { open: false } });
		expect(typeof result.body).toBe("string");
	});

	test("renders without throwing when open on the right side", () => {
		const result = render(AcpDrawerRoot, {
			props: { open: true, side: "right", title: "AI Assist", scopeLabel: "Step 3/8" },
		});
		expect(typeof result.body).toBe("string");
	});

	test("renders without throwing for the mobile bottom-sheet branch", () => {
		const result = render(AcpDrawerRoot, { props: { open: true, side: "bottom" } });
		expect(typeof result.body).toBe("string");
	});

	test("renders without throwing with the OD meta strip + agent registry", () => {
		const result = render(AcpDrawerRoot, {
			props: {
				open: true,
				side: "right",
				meta: [
					{ id: "session", label: "session", value: "run_8f29a4c" },
					{ id: "step", label: "step", value: "3 / 8" },
					{ id: "cache", label: "cache", value: "76%" },
				],
				agents: [
					{
						id: "claude-code",
						name: "Claude Code",
						client: "claude-code",
						status: "Ready",
						tone: "ready",
						latency: "0.8s",
						mcp: 12,
						plugins: 4,
						ring: "executor",
					},
				],
			},
		});
		expect(typeof result.body).toBe("string");
	});

	test("never emits raw hex/hsl color in SSR markup", () => {
		const { body } = render(AcpDrawerRoot, { props: { open: false } });
		expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
		expect(body).not.toMatch(/\bhsl\(/);
	});
});
