import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/** Repo-rooted, durable screenshot evidence directory for this PRD. */
const EVIDENCE_DIR = path.resolve(
	process.cwd(),
	"../../.design-evidence/build-graph",
);

/**
 * Build · dependency graph — rendered design-fidelity coverage for the OD
 * `build-graph.html` `◇ Graph` layout (DESIGN.md §9 orchestrator DAG, §4.9
 * status badges, §4.11 mode row, IA-MAP.md §2.3 Build).
 *
 * The route was previously a mislabeled typography/form-field fixture; this
 * spec proves the rebuilt Sugiyama layered dependency graph, the absorption of
 * the former `agent-dependency-board`, and the reduced-motion static fallback.
 */

async function openBuildGraph(page: Page): Promise<void> {
	await page.goto("/build-graph", { waitUntil: "domcontentloaded" });
	await expect(page.locator("[data-build-graph-ready='true']")).toBeVisible();
	await page.evaluate(async () => {
		await document.fonts.ready;
		await new Promise<void>((resolve) =>
			requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
		);
	});
}

test.describe("build graph — OD Sugiyama dependency layout", () => {
	test("renders a layered dependency graph with status-colored nodes and bezier edges", async ({
		page,
	}) => {
		await openBuildGraph(page);

		// layout — the Sugiyama canvas, dotted background, and node grid.
		const canvas = page.locator("[data-build-graph-canvas]");
		await expect(canvas).toBeVisible();
		await expect(canvas).toHaveCSS("background-size", "24px 24px");

		const nodes = page.locator("[data-build-graph-node]");
		await expect(nodes).toHaveCount(8);

		// status-colored nodes — all five DESIGN.md §4.9 graph states present.
		await expect(page.locator("[data-build-graph-node='AUTH-45']")).toHaveAttribute(
			"data-node-state",
			"done",
		);
		await expect(page.locator("[data-build-graph-node='AUTH-43']")).toHaveAttribute(
			"data-node-state",
			"run",
		);
		await expect(page.locator("[data-build-graph-node='AUTH-44']")).toHaveAttribute(
			"data-node-state",
			"wait",
		);
		await expect(page.locator("[data-build-graph-node='AUTH-49']")).toHaveAttribute(
			"data-node-state",
			"blk",
		);
		await expect(page.locator("[data-build-graph-node='AUTH-48']")).toHaveAttribute(
			"data-node-state",
			"todo",
		);

		// each node carries a canonical StatusBadge, monospace id, and meta row.
		const runNode = page.locator("[data-build-graph-node='AUTH-43']");
		await expect(runNode.locator("[data-slot='status-badge']")).toContainText("Running");
		await expect(runNode.locator("[data-node-id]")).toHaveText("AUTH-43");
		await expect(runNode.locator("[data-node-title]")).toContainText("Persist issuance row per kid");
		await expect(runNode.locator("[data-node-meta]")).toContainText("opus-4.7");

		// SVG bezier edges with arrowheads — running-chain edge is accent-colored.
		const edges = page.locator("[data-build-graph-edge]");
		await expect(edges).toHaveCount(7);
		const chainEdge = page.locator("[data-build-graph-edge='AUTH-43-AUTH-44']");
		await expect(chainEdge).toHaveAttribute("data-edge-chain", "true");
		await expect(chainEdge).toHaveAttribute("marker-end", "url(#build-graph-arrow-accent)");
	});

	test("toolbar exposes the five-layout switcher, status legend, and selectors", async ({
		page,
	}) => {
		await openBuildGraph(page);

		// five-layout switcher tablist with Graph as the current tab.
		const layouts = page.locator("[data-build-layout]");
		await expect(layouts).toHaveCount(5);
		for (const label of ["board", "list", "timeline", "calendar", "graph"]) {
			await expect(page.locator(`[data-build-layout='${label}']`)).toBeVisible();
		}
		await expect(page.locator("[data-build-layout='graph']")).toHaveAttribute(
			"aria-current",
			"page",
		);
		await expect(page.locator("[data-build-graph-layouts]")).toHaveAttribute("role", "tablist");

		// status legend — one swatch per graph state.
		await expect(page.locator("[data-build-graph-legend] [data-legend-swatch]")).toHaveCount(5);
		await expect(page.locator("[data-build-graph-legend]")).toContainText("running");
		await expect(page.locator("[data-build-graph-legend]")).toContainText("blocked");

		// Module + Layout selectors.
		await expect(page.locator("[data-build-graph-module]")).toContainText("Module: auth");
		await expect(page.locator("[data-build-graph-layout-select]")).toContainText("Sugiyama");
	});

	test("clicking a node opens an info card with run/agent meta, path-highlight, actions, mode row", async ({
		page,
	}) => {
		await openBuildGraph(page);

		// AUTH-43 is the OD pre-selected running node — its info card is shown.
		const card = page.locator("[data-build-graph-info-card]");
		await expect(card).toBeVisible();
		await expect(card).toHaveAttribute("data-info-card-node", "AUTH-43");
		await expect(card.locator("[data-info-card-title]")).toContainText(
			"AUTH-43 · Persist issuance row per kid",
		);
		await expect(card.locator("[data-info-card-agent]")).toContainText("opus-4.7");
		await expect(card.locator("[data-info-card-run]")).toContainText("run_8f29a4c");
		await expect(card.locator("[data-info-card-path]")).toContainText("AUTH-43 → AUTH-44");

		// Open run / Open task actions + a full per-step ModeRow (DESIGN.md §4.11).
		await expect(card.locator("[data-info-card-open-run]")).toContainText("Open run");
		await expect(card.locator("[data-info-card-open-task]")).toContainText("Open task");
		const modeRow = card.locator("[data-info-card-mode-row]");
		await expect(modeRow).toHaveAttribute("role", "toolbar");
		await expect(modeRow.locator("[data-slot='mode-row-option']")).toHaveCount(4);

		// selecting a different node swaps the info card to that node.
		await page.locator("[data-build-graph-node='AUTH-48']").click();
		await expect(card).toHaveAttribute("data-info-card-node", "AUTH-48");
		await expect(card.locator("[data-info-card-title]")).toContainText("Telemetry");
	});

	test("selecting a node highlights its forward dependency path and dims the rest", async ({
		page,
	}) => {
		await openBuildGraph(page);

		// AUTH-43 selected: AUTH-43 → AUTH-44, AUTH-47 → AUTH-46 are on the path.
		await expect(page.locator("[data-build-graph-node='AUTH-43']")).toHaveAttribute(
			"data-node-highlight",
			"true",
		);
		await expect(page.locator("[data-build-graph-node='AUTH-44']")).toHaveAttribute(
			"data-node-highlight",
			"true",
		);
		// AUTH-45 is upstream of AUTH-43 — not on the forward path, so dimmed.
		await expect(page.locator("[data-build-graph-node='AUTH-45']")).toHaveAttribute(
			"data-node-dim",
			"true",
		);

		// clicking the selected node again clears the selection.
		await page.locator("[data-build-graph-node='AUTH-43']").click();
		await expect(page.locator("[data-build-graph-info-card]")).toHaveCount(0);
		await expect(page.locator("[data-build-graph-node='AUTH-45']")).not.toHaveAttribute(
			"data-node-dim",
			"true",
		);
	});

	test("nodes are keyboard-operable with a visible focus ring and aria-keyshortcuts", async ({
		page,
	}) => {
		await openBuildGraph(page);

		const node = page.locator("[data-build-graph-node='AUTH-47']");
		await expect(node).toHaveAttribute("aria-keyshortcuts", "M K");

		await node.focus();
		const ring = await node.evaluate((el) => getComputedStyle(el).boxShadow);
		expect(ring).not.toBe("none");

		// keyboard activation selects the node.
		await node.press("Enter");
		await expect(page.locator("[data-build-graph-info-card]")).toHaveAttribute(
			"data-info-card-node",
			"AUTH-47",
		);
	});

	test("collapses the running-node pulse to a static frame under reduced motion", async ({
		page,
	}) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await openBuildGraph(page);

		const runNode = page.locator("[data-build-graph-node='AUTH-43']");
		const timing = await runNode.evaluate((el) => {
			const style = getComputedStyle(el);
			return {
				animationDuration: style.animationDuration,
				transitionDuration: style.transitionDuration,
			};
		});
		const seconds = (value: string) =>
			Math.max(...value.split(",").map((part) => Number.parseFloat(part) || 0));
		expect(seconds(timing.animationDuration)).toBeLessThanOrEqual(0.001);
		expect(seconds(timing.transitionDuration)).toBeLessThanOrEqual(0.001);

		// the graph still renders fully — nodes, edges, and the info card persist.
		await expect(page.locator("[data-build-graph-node]")).toHaveCount(8);
		await expect(page.locator("[data-build-graph-info-card]")).toBeVisible();

		mkdirSync(EVIDENCE_DIR, { recursive: true });
		await page.screenshot({
			path: path.join(EVIDENCE_DIR, "build-graph-reduced-motion.png"),
			fullPage: true,
		});
	});

	test("captures a reference screenshot of the production Build graph route", async ({ page }) => {
		await openBuildGraph(page);
		mkdirSync(EVIDENCE_DIR, { recursive: true });
		await page.screenshot({ path: path.join(EVIDENCE_DIR, "build-graph.png"), fullPage: true });
		await expect(page.locator("[data-build-graph]")).toBeVisible();
	});

	test("absorbs the agent-dependency-board route into the single Build graph", async ({
		page,
	}) => {
		// the old /agent-dependency-board path still resolves — never 404.
		const response = await page.goto("/agent-dependency-board", {
			waitUntil: "domcontentloaded",
		});
		expect(response?.status() ?? 200).toBeLessThan(400);

		// it forwards to the canonical Build graph — one graph, not two.
		await page.waitForURL("**/build-graph");
		await expect(page.locator("[data-build-graph]")).toBeVisible();
		await expect(page.locator("[data-build-graph-node]")).toHaveCount(8);
	});
});
