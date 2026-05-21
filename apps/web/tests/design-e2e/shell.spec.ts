import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Persist a rendered screenshot to the recovery-packet evidence dir so the PRD
 * `evidence_refs` can cite an on-disk path (goal.md "rendered design proof").
 * Best-effort: skipped silently when the env var is absent.
 */
async function writeEvidenceShot(name: string, body: Buffer): Promise<void> {
	const dir = process.env.FULCRUM_DESIGN_EVIDENCE_DIR;
	if (!dir) return;
	await mkdir(dir, { recursive: true });
	await writeFile(path.join(dir, name), body);
}

/**
 * Rendered design proof for the OD StageRail in the production web shell
 * (`apps/web/src/routes/+layout.svelte` → `AppSidebar` → `@fulcrum/ui-kit`
 * StageRail). Source: `desktop-shell.html` / `index.html`, DESIGN.md §3.1,
 * IA-MAP.md §3.
 *
 * Axis ownership (`prd-web-shell-stage-axis-ownership-fix`): the OD
 * `desktop-shell.html` rail replica renders the *active stage's
 * sub-navigation* (`Plan` → Sessions / Reviews / Prototypes / Templates /
 * Prompts) plus a persistent Workspace and System group — NOT the six-stage
 * Capture→Operate axis. That workflow axis is owned by the ScopeBar tab strip.
 * These specs prove the rail carries zero six-stage list items.
 *
 * States covered: `populated` (the rail with sub-nav/workspace/system) and
 * `forced-colors` (Windows high-contrast emulation).
 */

test.describe("OD shell StageRail — populated", () => {
	test("renders the 220px rail with active-stage sub-nav, workspace, and system groups", async ({
		page,
	}) => {
		await page.goto("/");

		const rail = page.locator("[data-slot='stage-rail']").first();
		await expect(rail).toBeVisible();
		await expect(rail).toHaveAttribute("data-collapsed", "false");

		// Expanded rail is exactly 220px wide (DESIGN.md §3.1).
		const box = await rail.boundingBox();
		expect(Math.round(box?.width ?? 0)).toBe(220);

		// The rail does NOT render the six-stage workflow axis — that is the
		// ScopeBar tab strip's job. Zero six-stage list items.
		await expect(rail.locator("[data-slot='stage-rail-item']")).toHaveCount(0);
		await expect(rail.locator("[data-slot='stage-rail-label']")).toHaveCount(0);

		// The rail's primary group is the active stage's sub-navigation. Root `/`
		// is the Capture stage, so the group header reads the active stage name.
		const subnavGroup = rail.locator("[data-slot='stage-rail-substage-group']");
		await expect(subnavGroup).toBeVisible();
		await expect(subnavGroup).toHaveAttribute("data-stage", "capture");
		await expect(rail.locator("[data-slot='stage-rail-substage-item']").first()).toBeVisible();

		// data-current keeps the rail synced to the active stage (data for the
		// ScopeBar tab strip).
		await expect(rail).toHaveAttribute("data-current", "capture");

		// Persistent Workspace (Portfolio) group — destinations preserved by the migration.
		await expect(rail.locator("[data-slot='stage-rail-workspace-group']")).toBeVisible();
		await expect(rail.locator("[data-slot='stage-rail-workspace-item']")).toContainText([
			"All projects",
			"Search",
			"Memory",
			"Context",
		]);

		// System group below the divider — Settings · Knowledge · MCP · Plugins.
		await expect(rail.locator("[data-slot='stage-rail-system-item']")).toContainText([
			"Settings",
			"Knowledge",
			"MCP",
			"Plugins",
		]);

		await test.info().attach("shell-stage-rail-expanded", {
			body: await page.screenshot({ fullPage: true }),
			contentType: "image/png",
		});
	});

	test("keyboard focus reaches the rail with a visible focus-visible ring", async ({ page }) => {
		await page.goto("/");

		// First Tab lands on the skip link (rendered first in <body>).
		await page.keyboard.press("Tab");
		const skipLink = page.locator("[data-slot='skip-link']");
		await expect(skipLink).toBeFocused();

		// Next Tab steps into the StageRail sub-navigation; the focused link shows
		// a visible focus-visible ring (a box-shadow ring using the ring token).
		await page.keyboard.press("Tab");
		const focusedItem = page
			.locator("[data-slot='stage-rail-substage-item']:focus-visible")
			.first();
		await expect(focusedItem).toBeVisible();
		const focusRing = await focusedItem.evaluate((node) => getComputedStyle(node).boxShadow);
		expect(focusRing).not.toBe("none");
		expect(focusRing.length).toBeGreaterThan(0);
	});

	test("rail sub-navigation changes with the active workflow stage", async ({ page }) => {
		// The route→stage mapping stays available as data; the rail consumes it to
		// pick the right sub-nav, but never renders the six-stage axis itself.
		const cases = [
			{ path: "/", stage: "capture" },
			{ path: "/planning", stage: "plan" },
			{ path: "/build-runs", stage: "build" },
			{ path: "/review-search", stage: "review" },
			{ path: "/ship-archive", stage: "ship" },
			{ path: "/operate-mcp", stage: "operate" },
		];

		for (const item of cases) {
			await page.goto(item.path);
			const rail = page.locator("[data-slot='stage-rail']").first();
			await expect(rail).toHaveAttribute("data-current", item.stage);
			// Still no six-stage rail list on any route.
			await expect(rail.locator("[data-slot='stage-rail-item']")).toHaveCount(0);
			// The sub-nav group header tracks the active stage.
			await expect(rail.locator("[data-slot='stage-rail-substage-group']")).toHaveAttribute(
				"data-stage",
				item.stage,
			);
		}
	});
});

test.describe("OD shell StageRail — forced-colors", () => {
	test("stays operable under Windows high-contrast emulation", async ({ page }) => {
		await page.emulateMedia({ forcedColors: "active" });
		await page.goto("/");

		const rail = page.locator("[data-slot='stage-rail']").first();
		await expect(rail).toBeVisible();
		// No six-stage rail list, and the Workspace + System groups remain visible.
		await expect(rail.locator("[data-slot='stage-rail-item']")).toHaveCount(0);
		await expect(rail.locator("[data-slot='stage-rail-substage-group']")).toBeVisible();
		await expect(rail.locator("[data-slot='stage-rail-workspace-group']")).toBeVisible();
		await expect(rail.locator("[data-slot='stage-rail-system-item']")).toHaveCount(4);

		await test.info().attach("shell-stage-rail-forced-colors", {
			body: await page.screenshot({ fullPage: true }),
			contentType: "image/png",
		});
	});
});

test.describe("OD shell ScopeBar — populated", () => {
	test("renders the 48px ScopeBar with brand, workspace, stage tabs, trace, and system icons", async ({
		page,
	}) => {
		await page.goto("/");

		const scopeBar = page.locator("[data-slot='scope-bar']").first();
		await expect(scopeBar).toBeVisible();
		await expect(scopeBar).toHaveAttribute("data-scope-bar", "");
		await expect(scopeBar).toHaveAttribute("data-active-stage", "capture");

		const box = await scopeBar.boundingBox();
		expect(Math.round(box?.height ?? 0)).toBe(48);

		await expect(scopeBar.locator("[data-slot='scope-bar-brand']")).toContainText("Fulcrum");
		await expect(scopeBar.locator("[data-slot='scope-bar-workspace']")).toContainText(
			"mkh / all-projects",
		);

		const tabs = scopeBar.locator("[data-slot='scope-bar-tab']");
		await expect(tabs).toHaveCount(6);
		await expect(tabs).toHaveText(["Capture", "Plan", "Build", "Review", "Ship", "Operate"]);

		const trace = scopeBar.locator("[data-slot='trace-chip'][data-variant='badge']").first();
		await expect(trace).toBeVisible();
		await expect(trace.locator("[data-slot='trace-chip-prefix']")).toHaveText("trace:");

		for (const label of [
			"Command palette · ⌘K",
			"Notifications · 0 unread",
			"Display, density, mode, theme",
			"Keyboard shortcuts · ?",
			"Account · sign out, switch workspace",
		]) {
			const icon = scopeBar.locator(`button[aria-label="${label}"]`).first();
			await expect(icon).toBeVisible();
			await expect(icon).toHaveAttribute("aria-expanded", "false");
		}

		await expect(scopeBar.locator("[data-density-switch]")).toHaveAttribute(
			"data-density-mode",
			"cozy",
		);
		await expect(scopeBar.locator("[data-density-option]")).toHaveText([
			"Compact",
			"Cozy",
			"Comfortable",
		]);

		await test.info().attach("shell-scope-bar", {
			body: await page.screenshot({ fullPage: true }),
			contentType: "image/png",
		});
	});

	test("maps existing routes to the active ScopeBar stage tab", async ({ page }) => {
		const cases = [
			{ path: "/", stage: "capture" },
			{ path: "/planning", stage: "plan" },
			{ path: "/build-runs", stage: "build" },
			{ path: "/review-search", stage: "review" },
			{ path: "/ship-archive", stage: "ship" },
			{ path: "/operate-mcp", stage: "operate" },
		];

		for (const item of cases) {
			await page.goto(item.path);
			const activeTab = page
				.locator("[data-slot='scope-bar-tab'][data-active='true']")
				.first();
			await expect(activeTab).toHaveAttribute("data-stage", item.stage);
			await expect(activeTab).toHaveAttribute("aria-current", "page");
		}
	});
});

/**
 * Rendered design proof for the OD StatusFooter in the production web shell
 * (`apps/web/src/routes/+layout.svelte` → `TraceFooter` → `@fulcrum/ui-kit`
 * StatusFooter). Source: `desktop-shell.html` `.foot-rep`, `tui-runs.html`
 * `.term-foot`, DESIGN.md §3.1, IA-MAP.md §3.
 *
 * `TraceFooter.svelte` is a thin consumer — it owns no footer chrome markup.
 * States covered: `populated` (desktop footer), `mobile` (footer hidden, trace
 * quick panel), `forced-colors` (Windows high-contrast emulation).
 */
test.describe("OD shell StatusFooter — populated", () => {
	test("renders the 44px fixed-bottom footer with the full operator segment set", async ({
		page,
	}) => {
		await page.goto("/");

		const footer = page.locator("[data-slot='status-footer']").first();
		await expect(footer).toBeVisible();
		await expect(footer).toHaveAttribute("data-trace-footer", "true");

		// DESIGN.md §3.1: base density footer is exactly 44px.
		const box = await footer.boundingBox();
		expect(Math.round(box?.height ?? 0)).toBe(44);
		await expect(footer).toHaveAttribute("data-footer-mode", "base");

		// Left cluster: mode pill · profile · branch · agent · MCP (run segment is
		// present only when a run is active — the shell layout supplies none).
		const segments = footer.locator("[data-slot='status-footer-segment']");
		await expect(segments.first()).toBeVisible();
		await expect(footer.locator("[data-segment-id='mode']")).toBeVisible();
		await expect(footer.locator("[data-slot='status-footer-pill']")).toBeVisible();
		await expect(footer.locator("[data-segment-id='profile']")).toBeVisible();
		await expect(footer.locator("[data-segment-id='branch']")).toBeVisible();
		await expect(footer.locator("[data-segment-id='agent']")).toContainText("agent:");
		await expect(footer.locator("[data-segment-id='mcp']")).toContainText("mcp");

		// Right cluster: shared TraceBadge · time · help · palette.
		const right = footer.locator("[data-slot='status-footer-right']");
		await expect(right).toBeVisible();
		const trace = right.locator("[data-slot='trace-chip'][data-variant='badge']").first();
		await expect(trace).toBeVisible();
		await expect(trace.locator("[data-slot='trace-chip-prefix']")).toHaveText("trace:");
		await expect(footer.locator("[data-trace-footer-time]")).toBeVisible();
		await expect(
			footer.locator("button[data-trace-footer-help]"),
		).toHaveAttribute("aria-label", "Keyboard shortcuts · ?");
		await expect(
			footer.locator("button[data-trace-footer-palette]"),
		).toHaveAttribute("aria-label", "Command palette · ⌘K");

		const footerShot = await page.screenshot({ fullPage: true });
		await test.info().attach("shell-status-footer", {
			body: footerShot,
			contentType: "image/png",
		});
		await writeEvidenceShot("status-footer-populated.png", footerShot);
	});

	test("right-most segment is the keyboard-reachable AI Assist trigger with ⌘/ accent identity", async ({
		page,
	}) => {
		await page.goto("/");

		const footer = page.locator("[data-slot='status-footer']").first();
		const aiAssist = footer.locator("[data-slot='status-footer-ai-assist']");
		await expect(aiAssist).toBeVisible();

		// COPY assertion: visible "AI Assist" label + "⌘/" keyboard hint.
		await expect(aiAssist).toContainText("AI Assist");
		await expect(
			footer.locator("[data-slot='status-footer-ai-assist-kbd']"),
		).toHaveText("⌘/");
		await expect(aiAssist).toHaveAttribute("aria-label", "AI Assist (⌘/)");

		// OD accent identity: accent left-border on the segment.
		const borderColor = await aiAssist.evaluate(
			(node) => getComputedStyle(node).borderLeftColor,
		);
		expect(borderColor).not.toBe("");
		const borderWidth = await aiAssist.evaluate(
			(node) => getComputedStyle(node).borderLeftWidth,
		);
		expect(Number.parseFloat(borderWidth)).toBeGreaterThanOrEqual(2);

		// The AI Assist segment is keyboard reachable and shows a focus-visible ring.
		await aiAssist.focus();
		await expect(aiAssist).toBeFocused();
		const focusRing = await aiAssist.evaluate(
			(node) => getComputedStyle(node).boxShadow,
		);
		expect(focusRing).not.toBe("none");
		expect(focusRing.length).toBeGreaterThan(0);

		// Activating the segment dispatches the shared AI Assist open event so the
		// AcpDrawer (prd-web-global-ai-assist-drawer) and ⌘/ share one drawer.
		const opened = await page.evaluate(
			() =>
				new Promise<boolean>((resolve) => {
					window.addEventListener(
						"fulcrum:open-ai-assist",
						() => resolve(true),
						{ once: true },
					);
					document
						.querySelector<HTMLElement>(
							"[data-slot='status-footer-ai-assist']",
						)
						?.click();
					setTimeout(() => resolve(false), 500);
				}),
		);
		expect(opened).toBe(true);
	});

	test("trace segment copies the trace id", async ({ page, context }) => {
		await context.grantPermissions(["clipboard-read", "clipboard-write"]);
		await page.goto("/");

		const footer = page.locator("[data-slot='status-footer']").first();
		const traceId = await footer
			.locator("[data-trace-footer-id]")
			.first()
			.getAttribute("data-trace-id");
		expect(traceId).toBeTruthy();

		await footer.locator("[data-slot='trace-chip-copy']").first().click();
		const clipboard = await page.evaluate(() => navigator.clipboard.readText());
		expect(clipboard).toBe(traceId);
	});
});

test.describe("OD shell StatusFooter — mobile", () => {
	test("hides the footer and exposes bottom stage tabs, AI Assist, and trace", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/");

		// DESIGN.md §3.2: the 44px StatusFooter is hidden on mobile.
		await expect(page.locator("[data-slot='status-footer']")).toHaveCount(0);
		await expect(page.locator("[data-mobile-sheet-trigger]")).toHaveCount(0);

		const bottomStageTabs = page.locator("[data-slot='mobile-stage-tabs']");
		await expect(bottomStageTabs).toBeVisible();
		await expect(bottomStageTabs.locator("[data-slot='mobile-stage-tab-label']")).toHaveText([
			"Capture",
			"Plan",
			"Build",
			"Review",
			"Ship",
			"Operate",
			"AI Assist",
		]);
		await expect(bottomStageTabs.locator("[data-slot='mobile-stage-tab'][data-active='true']")).toHaveAttribute(
			"data-stage",
			"capture",
		);

		const aiAssistTab = bottomStageTabs.locator("[data-slot='mobile-stage-tab-ai-assist']");
		await expect(aiAssistTab).toBeVisible();
		await expect(aiAssistTab).toContainText("AI Assist");
		await expect(page.locator("[data-slot='acp-drawer']")).toHaveCount(0);
		await aiAssistTab.click();
		await expect(page.locator("[data-slot='acp-drawer']")).toBeVisible();
		await expect(page.locator("[data-slot='acp-drawer']")).toHaveAttribute("data-open", "true");

		await page.keyboard.press(process.platform === "darwin" ? "Meta+Slash" : "Control+Slash");
		await expect(page.locator("[data-slot='acp-drawer']")).toHaveCount(0);
		await page.keyboard.press(process.platform === "darwin" ? "Meta+Slash" : "Control+Slash");
		await expect(page.locator("[data-slot='acp-drawer']")).toBeVisible();
		await page.keyboard.press(process.platform === "darwin" ? "Meta+Slash" : "Control+Slash");
		await expect(page.locator("[data-slot='acp-drawer']")).toHaveCount(0);
		await page.reload({ waitUntil: "load" });
		await expect(page.locator("[data-slot='status-footer']")).toHaveCount(0);
		await expect(page.locator("[data-slot='mobile-stage-tabs']")).toBeVisible();

		// The trace id stays reachable through the mobile quick panel.
		const panel = page.locator("[data-mobile-trace-panel]");
		await expect(panel).toBeVisible();
		const summary = panel.locator("[data-mobile-trace-summary]");
		await expect(summary).toBeVisible();
		await expect(summary).toHaveAttribute("aria-label", "Show trace id");

		// Expanding the panel reveals the shared TraceBadge.
		await summary.click();
		const trace = panel.locator(
			"[data-mobile-trace-id][data-slot='trace-chip'][data-variant='badge']",
		);
		await expect(trace).toBeVisible();
		await expect(trace.locator("[data-slot='trace-chip-prefix']")).toHaveText(
			"trace:",
		);

		const mobileShot = await page.screenshot({ fullPage: true });
		await test.info().attach("shell-status-footer-mobile", {
			body: mobileShot,
			contentType: "image/png",
		});
		await writeEvidenceShot("mobile-bottom-stage-tabs.png", mobileShot);
	});
});

test.describe("OD shell StatusFooter — forced-colors", () => {
	test("stays operable under Windows high-contrast emulation", async ({ page }) => {
		await page.emulateMedia({ forcedColors: "active" });
		await page.goto("/");

		const footer = page.locator("[data-slot='status-footer']").first();
		await expect(footer).toBeVisible();
		await expect(
			footer.locator("[data-slot='status-footer-ai-assist']"),
		).toBeVisible();
		await expect(
			footer.locator("[data-slot='trace-chip'][data-variant='badge']").first(),
		).toBeVisible();

		const forcedShot = await page.screenshot({ fullPage: true });
		await test.info().attach("shell-status-footer-forced-colors", {
			body: forcedShot,
			contentType: "image/png",
		});
		await writeEvidenceShot("status-footer-forced-colors.png", forcedShot);
	});
});
