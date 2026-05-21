import { describe, expect, test } from "bun:test";

import {
	LUCIDE_ICONS,
	NAV_GROUPS,
	NAV_ITEMS,
	STAGE_NAV_ITEMS,
	SYSTEM_NAV_ITEMS,
	WORKSPACE_NAV_ITEMS,
	stageForPath,
} from "./nav-items.ts";

describe("StageRail nav data", () => {
	test("declares the six WorkflowStages in canonical Capture→Operate order", () => {
		expect(STAGE_NAV_ITEMS.map((s) => s.stage)).toEqual([
			"capture",
			"plan",
			"build",
			"review",
			"ship",
			"operate",
		]);
	});

	test("maps each WorkflowStage to a production route", () => {
		expect(STAGE_NAV_ITEMS.map((s) => s.href)).toEqual([
			"/",
			"/plan-session",
			"/build-board",
			"/review",
			"/ship",
			"/doctor",
		]);
	});

	test("declares the persistent Workspace and System groups in locked order", () => {
		expect(NAV_GROUPS.map((group) => group.label)).toEqual(["Workspace", "System"]);
	});

	test("preserves the former Portfolio destinations verbatim in the Workspace group", () => {
		expect(WORKSPACE_NAV_ITEMS.map((i) => i.href)).toEqual([
			"/projects",
			"/search",
			"/memory",
			"/context/preview",
		]);
		expect(WORKSPACE_NAV_ITEMS.map((i) => i.label)).toEqual([
			"All projects",
			"Search",
			"Memory",
			"Context",
		]);
	});

	test("re-points the System group to Settings · Knowledge · MCP · Plugins", () => {
		expect(SYSTEM_NAV_ITEMS.map((i) => i.label)).toEqual([
			"Settings",
			"Knowledge",
			"MCP",
			"Plugins",
		]);
		expect(SYSTEM_NAV_ITEMS.map((i) => i.id)).toEqual([
			"settings",
			"knowledge",
			"mcp",
			"plugins",
		]);
	});

	test("each Workspace/System entry uses an icon resolvable through LUCIDE_ICONS", () => {
		for (const item of NAV_ITEMS) {
			expect(LUCIDE_ICONS).toHaveProperty(item.iconName);
			expect(typeof LUCIDE_ICONS[item.iconName]).toBe("function");
		}
	});

	test("every entry carries a stable, unique id used as the StageRail item key", () => {
		const ids = NAV_ITEMS.map((i) => i.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) expect(id.length).toBeGreaterThan(0);
	});
});

describe("stageForPath route mapping", () => {
	test("resolves the workspace root to the Capture stage", () => {
		expect(stageForPath("/")).toBe("capture");
	});

	test("maps each stage workbench route to its WorkflowStage", () => {
		expect(stageForPath("/planning")).toBe("plan");
		expect(stageForPath("/build-runs")).toBe("build");
		expect(stageForPath("/review-search")).toBe("review");
		expect(stageForPath("/ship-archive")).toBe("ship");
		expect(stageForPath("/operate-mcp")).toBe("operate");
	});

	test("maps canonical project-scoped stage routes to their WorkflowStage", () => {
		expect(stageForPath("/acme/projects/fulcrum/capture")).toBe("capture");
		expect(stageForPath("/acme/projects/fulcrum/plan")).toBe("plan");
		expect(stageForPath("/acme/projects/fulcrum/build/board")).toBe("build");
		expect(stageForPath("/acme/projects/fulcrum/review")).toBe("review");
		expect(stageForPath("/acme/projects/fulcrum/ship")).toBe("ship");
		expect(stageForPath("/acme/projects/fulcrum/operate/doctor")).toBe("operate");
	});

	test("maps old feature-bucket routes to their owning stage — no destination dropped", () => {
		expect(stageForPath("/docs")).toBe("capture");
		expect(stageForPath("/boards")).toBe("build");
		expect(stageForPath("/runs")).toBe("build");
		expect(stageForPath("/artifacts")).toBe("ship");
	});

	test("maps former System routes onto a workflow stage", () => {
		expect(stageForPath("/agents")).toBe("operate");
		expect(stageForPath("/orchestration")).toBe("build");
		expect(stageForPath("/audit")).toBe("operate");
		expect(stageForPath("/doctor")).toBe("operate");
	});

	test("matches nested paths under a stage prefix", () => {
		expect(stageForPath("/build-runs/abc123")).toBe("build");
		expect(stageForPath("/planning/sprint-2")).toBe("plan");
	});

	test("falls back to Capture for an unmapped path", () => {
		expect(stageForPath("/totally-unknown")).toBe("capture");
	});
});
