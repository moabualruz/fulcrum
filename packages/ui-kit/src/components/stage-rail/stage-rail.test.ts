import { describe, expect, test } from "bun:test";
import { render } from "svelte/server";
import StageRailRoot, { WORKFLOW_STAGES } from "./stage-rail.svelte";

describe("StageRail", () => {
	test("renders all six WorkflowStages with the canonical labels", () => {
		const { body } = render(StageRailRoot, { props: {} });
		expect(WORKFLOW_STAGES).toEqual(["capture", "plan", "build", "review", "ship", "operate"]);
		for (const label of ["Capture", "Plan", "Build", "Review", "Ship", "Operate"]) {
			expect(body).toContain(label);
		}
		expect(body).toContain('data-slot="stage-rail"');
	});

	test("exposes data-current and aria-current on the active stage", () => {
		const { body } = render(StageRailRoot, { props: { current: "build" } });
		expect(body).toContain('data-current="build"');
		expect(body).toContain('data-stage="build"');
		expect(body).toContain('data-active="true"');
		expect(body).toContain('aria-current="page"');
	});

	test("reflects collapsed state via data-collapsed", () => {
		const expanded = render(StageRailRoot, { props: { collapsed: false } });
		expect(expanded.body).toContain('data-collapsed="false"');
		const collapsed = render(StageRailRoot, { props: { collapsed: true } });
		expect(collapsed.body).toContain('data-collapsed="true"');
	});

	test("renders the System group after a divider", () => {
		const { body } = render(StageRailRoot, {
			props: {
				system: [
					{ id: "settings", label: "Settings" },
					{ id: "mcp", label: "MCP servers" },
				],
			},
		});
		expect(body).toContain('data-slot="stage-rail-divider"');
		expect(body).toContain('data-slot="stage-rail-system-item"');
		expect(body).toContain('data-system-id="settings"');
		expect(body).toContain("MCP servers");
	});

	test("uses OKLCH-tokened utilities only — no raw hex/hsl in markup", () => {
		const { body } = render(StageRailRoot, { props: { current: "plan" } });
		expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
		expect(body).not.toMatch(/\bhsl\(/);
	});
});
