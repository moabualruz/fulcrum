import { describe, expect, test } from "bun:test";
import { render } from "svelte/server";
import StageRailRoot from "./stage-rail.svelte";
import { WORKFLOW_STAGES } from "./stage-rail.exports.js";

describe("StageRail", () => {
	test("renders the active-stage sub-navigation group labelled by the current stage", () => {
		const { body } = render(StageRailRoot, {
			props: {
				current: "plan",
				substages: [
					{ id: "sessions", label: "Sessions", href: "/plan/sessions", count: 3 },
					{ id: "reviews", label: "Reviews", href: "/plan/reviews", count: 2 },
				],
			},
		});
		expect(body).toContain('data-slot="stage-rail-substage-group"');
		expect(body).toContain('data-stage="plan"');
		// Group header is the active stage name, not a six-stage list.
		expect(body).toContain("Plan");
		expect(body).toContain('data-slot="stage-rail-substage-item"');
		expect(body).toContain('data-substage-id="sessions"');
		expect(body).toContain("Sessions");
		expect(body).toContain('data-slot="stage-rail-substage-count"');
	});

	test("does NOT render the six-stage workflow axis when substages are supplied", () => {
		const { body } = render(StageRailRoot, {
			props: {
				current: "plan",
				substages: [{ id: "sessions", label: "Sessions", href: "/plan/sessions" }],
				workspace: [{ id: "projects", label: "All projects", href: "/projects" }],
				system: [{ id: "settings", label: "Settings", href: "/settings" }],
			},
		});
		// The six-stage axis slot must be absent: the ScopeBar owns that axis.
		expect(body).not.toContain('data-slot="stage-rail-item"');
		expect(body).not.toContain('data-slot="stage-rail-label"');
		// Workspace + System groups stay visible.
		expect(body).toContain('data-slot="stage-rail-workspace-group"');
		expect(body).toContain('data-slot="stage-rail-system-item"');
	});

	test("default props render no six-stage axis", () => {
		const { body } = render(StageRailRoot, { props: {} });
		expect(body).toContain('data-slot="stage-rail"');
		// No stages and no substages by default: the rail is not a stage list.
		expect(body).not.toContain('data-slot="stage-rail-item"');
		expect(body).not.toContain('data-slot="stage-rail-substage-item"');
	});

	test("exposes data-current on the rail for ScopeBar sync", () => {
		const { body } = render(StageRailRoot, {
			props: {
				current: "build",
				substages: [{ id: "board", label: "Board", href: "/build/board" }],
			},
		});
		expect(body).toContain('data-current="build"');
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

	test("renders the persistent Workspace group above the System divider", () => {
		const { body } = render(StageRailRoot, {
			props: {
				workspace: [
					{ id: "projects", label: "All projects", href: "/projects" },
					{ id: "search", label: "Search", href: "/search", count: 4 },
				],
				system: [{ id: "settings", label: "Settings" }],
			},
		});
		expect(body).toContain('data-slot="stage-rail-workspace-group"');
		expect(body).toContain('data-slot="stage-rail-workspace-item"');
		expect(body).toContain('data-workspace-id="projects"');
		expect(body).toContain("All projects");
		expect(body).toContain('data-slot="stage-rail-workspace-count"');
		// Workspace group must precede the System group so portfolio links never
		// compete visually with the active-stage sub-navigation.
		expect(body.indexOf('data-slot="stage-rail-workspace-group"')).toBeLessThan(
			body.indexOf('data-slot="stage-rail-system-item"'),
		);
	});

	test("legacy `stages` prop still renders for the design-kit fixture only", () => {
		// The six-stage `stages` prop is retained for the /design-kit fixture; it
		// renders only when NO substages are supplied.
		expect(WORKFLOW_STAGES).toEqual(["capture", "plan", "build", "review", "ship", "operate"]);
		const { body } = render(StageRailRoot, {
			props: {
				current: "build",
				stages: WORKFLOW_STAGES.map((stage) => ({ stage })),
			},
		});
		const items = body.match(/data-slot="stage-rail-item"/g) ?? [];
		expect(items).toHaveLength(6);
		expect(body).toContain('data-active="true"');
	});

	test("legacy stage buttons use navigation ARIA instead of tab roles", () => {
		const { body } = render(StageRailRoot, {
			props: {
				current: "build",
				stages: WORKFLOW_STAGES.map((stage) => ({ stage })),
			},
		});
		expect(body).toContain('aria-current="page"');
		expect(body).not.toContain('role="tab"');
		expect(body).not.toContain("aria-selected");
	});

	test("legacy `stages` prop is suppressed when substages are present", () => {
		const { body } = render(StageRailRoot, {
			props: {
				current: "plan",
				stages: WORKFLOW_STAGES.map((stage) => ({ stage })),
				substages: [{ id: "sessions", label: "Sessions", href: "/plan/sessions" }],
			},
		});
		// substages win: the legacy six-stage axis is not rendered.
		expect(body).not.toContain('data-slot="stage-rail-item"');
		expect(body).toContain('data-slot="stage-rail-substage-item"');
	});

	test("uses OKLCH-tokened utilities only: no raw hex/hsl in markup", () => {
		const { body } = render(StageRailRoot, {
			props: {
				current: "plan",
				substages: [{ id: "sessions", label: "Sessions", href: "/plan/sessions" }],
			},
		});
		expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
		expect(body).not.toMatch(/\bhsl\(/);
	});
});
