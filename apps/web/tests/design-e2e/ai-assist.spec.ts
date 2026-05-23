import { expect, test, type Locator, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Rendered design-gate coverage for the global AI Assist drawer
 * (`prd-web-global-ai-assist-drawer`).
 *
 * DESIGN.md §3.1, IA-MAP.md §5, ai-assist.html: AI Assist is a single
 * shell-level overlay drawer owned by `apps/web/src/routes/+layout.svelte`,
 * opened from `⌘/` or the StatusFooter `✨ AI Assist` segment on any route —
 * not a page. These specs drive chromium over PRODUCTION routes (`/`,
 * `/build-board`, `/ai-assist`) and assert the rendered DOM of the one
 * `@fulcrum/ui-kit` `AcpDrawer` instance.
 *
 * Replaces the earlier spec that drove a route-local full-page `/ai-assist`
 * drawer copy — that surface violated the OD intent and the AGENTS.md ui-kit
 * rule and no longer exists.
 */

const DRAWER = "[data-slot='acp-drawer']";

/** Persist a rendered screenshot to the recovery-packet evidence dir. */
async function writeEvidenceShot(name: string, body: Buffer): Promise<void> {
	const dir = process.env.FULCRUM_DESIGN_EVIDENCE_DIR;
	if (!dir) return;
	await mkdir(dir, { recursive: true });
	await writeFile(path.join(dir, name), body);
}

/** Toggle the AI Assist drawer with the `⌘/` global chord. */
async function pressToggleChord(page: Page): Promise<void> {
	// The `⌘/` keydown listener is registered in the layout's `onMount`; wait
	// for the hydration marker so the chord is never pressed before it binds.
	await page.locator("body[data-fulcrum-hydrated='true']").waitFor({ state: "attached" });
	const modifier = process.platform === "darwin" ? "Meta" : "Control";
	await page.keyboard.press(`${modifier}+Slash`);
}

async function expectDrawerInsideViewport(drawer: Locator, viewport: { width: number; height: number }) {
	const box = await drawer.boundingBox();
	expect(box).not.toBeNull();
	expect(box?.x ?? Number.NEGATIVE_INFINITY).toBeGreaterThanOrEqual(0);
	expect(box?.y ?? Number.NEGATIVE_INFINITY).toBeGreaterThanOrEqual(0);
	expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport.width);
	expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(viewport.height);
}

test.describe("global AI Assist drawer — populated", () => {
	test("⌘/ opens the single shell drawer from a production route", async ({ page }) => {
		await page.goto("/", { waitUntil: "load" });

		// No drawer until invoked.
		await expect(page.locator(DRAWER)).toHaveCount(0);

		await pressToggleChord(page);

		const drawer = page.locator(DRAWER);
		await expect(drawer).toBeVisible();
		await expect(drawer).toHaveAttribute("data-open", "true");
		await expect(drawer).toHaveAttribute("data-side", "right");
		await expect(drawer).toHaveAttribute("role", "dialog");

		// Header: AI Assist title + scope + agent picker + expand.
		await expect(drawer.locator("[data-slot='acp-drawer-title']")).toHaveText("AI Assist");
		await expect(drawer.locator("[data-slot='acp-drawer-scope']")).toContainText("Step 3 / 8");
		await expect(drawer.locator("[data-slot='acp-drawer-agent-picker']")).toBeVisible();
		await expect(drawer.locator("[data-slot='acp-drawer-expand']")).toBeVisible();
		await expect(drawer.locator("[data-slot='acp-drawer-trace']")).toBeVisible();

		// 420px desktop overlay width (DESIGN.md §3.1).
		const box = await drawer.boundingBox();
		expect(Math.round(box?.width ?? 0)).toBe(420);
		await expectDrawerInsideViewport(drawer, { width: 1280, height: 720 });

		const shot = await page.screenshot({ fullPage: false });
		await test.info().attach("ai-assist-drawer-open", {
			body: shot,
			contentType: "image/png",
		});
		await writeEvidenceShot("ai-assist-drawer-populated.png", shot);
	});

	test("renders the OD .drawer-meta strip with all seven cells", async ({ page }) => {
		await page.goto("/", { waitUntil: "load" });
		await pressToggleChord(page);

		const meta = page.locator(DRAWER).locator("[data-slot='acp-drawer-meta']");
		await expect(meta).toBeVisible();
		for (const id of ["session", "step", "policy", "cost", "tokens", "cache", "elapsed"]) {
			await expect(meta.locator(`[data-meta-id='${id}']`)).toBeVisible();
		}
		// COPY assertion: ai-assist.html meta values.
		await expect(meta.locator("[data-meta-id='session']")).toContainText("run_8f29a4c");
		await expect(meta.locator("[data-meta-id='step']")).toContainText("3 / 8");
		await expect(meta.locator("[data-meta-id='policy']")).toContainText("ask-on-write");
		await expect(meta.locator("[data-meta-id='cache']")).toContainText("76%");
		await expect(meta.locator("[data-meta-id='elapsed']")).toContainText("3m 42s");
	});

	test("agent picker opens the full multi-CLI agent panel", async ({ page }) => {
		await page.goto("/", { waitUntil: "load" });
		await pressToggleChord(page);

		const drawer = page.locator(DRAWER);
		await drawer.locator("[data-slot='acp-drawer-agent-picker']").click();

		const panel = drawer.locator("[data-slot='acp-drawer-agent-panel']");
		await expect(panel).toBeVisible();
		await expect(drawer).toHaveAttribute("data-picker-open", "true");

		// Every configured CLI agent row carries status dot, client kind,
		// latency, MCP count, plugin count, and a routing-ring badge.
		const rows = panel.locator("[data-slot='acp-drawer-agent-row']");
		await expect(rows).toHaveCount(5);
		const first = rows.first();
		// The status dot is decorative (`aria-hidden`); its health is exposed
		// for design-e2e as the row's `data-status-tone` state attribute.
		await expect(first).toHaveAttribute("data-status-tone", "ready");
		await expect(first.locator("[data-slot='acp-drawer-agent-status-dot']")).toHaveCount(1);
		await expect(first.locator("[data-slot='acp-drawer-agent-client']")).toContainText("claude-code");
		await expect(first.locator("[data-slot='acp-drawer-agent-latency']")).toContainText("0.8s");
		await expect(first.locator("[data-slot='acp-drawer-agent-mcp']")).toContainText("mcp");
		await expect(first.locator("[data-slot='acp-drawer-agent-plugins']")).toContainText("plugins");
		await expect(first.locator("[data-slot='acp-drawer-agent-ring']")).toContainText("executor");

		// Health tones span ready / paused / offline across the registry.
		await expect(rows.nth(2)).toHaveAttribute("data-status-tone", "paused");
		await expect(rows.nth(4)).toHaveAttribute("data-status-tone", "offline");

		// Footer link routes to Settings agents.
		const manage = panel.locator("[data-slot='acp-drawer-agent-manage']");
		await expect(manage).toContainText("Manage agents, MCP & plugins in Settings");
		await expect(manage).toHaveAttribute("href", "/settings#agents");

		// Selecting an agent updates the picker label and closes the panel.
		await rows.nth(1).click();
		await expect(panel).toBeHidden();
		await expect(drawer.locator("[data-slot='acp-drawer-agent-picker']")).toContainText("Codex");
	});

	test("ships the Save-thread-to-prompt-template action", async ({ page }) => {
		await page.goto("/", { waitUntil: "load" });
		await pressToggleChord(page);

		const save = page.locator(DRAWER).locator("[data-slot='acp-drawer-save-thread']");
		await expect(save).toBeVisible();
		await expect(save).toContainText("Save thread to prompt template");
		await save.click();
		await expect(page.locator("[data-ai-assist-saved]")).toContainText(
			"Thread saved as prompt template",
		);
	});

	test("the footer AI Assist segment opens the same drawer instance", async ({ page }) => {
		await page.goto("/build-board", { waitUntil: "load" });

		const segment = page.locator("[data-slot='status-footer-ai-assist']");
		await expect(segment).toBeVisible();
		await segment.click();

		// Exactly one drawer instance — opened by the footer, not a second copy.
		await expect(page.locator(DRAWER)).toHaveCount(1);
		await expect(page.locator(DRAWER)).toHaveAttribute("data-open", "true");
	});
});

test.describe("global AI Assist drawer — interactions", () => {
	test("Esc closes the drawer and ⌘/ toggles it back open with state preserved", async ({
		page,
	}) => {
		await page.goto("/", { waitUntil: "load" });

		// Open, save a thread — establish session state.
		await pressToggleChord(page);
		await page.locator(DRAWER).locator("[data-slot='acp-drawer-save-thread']").click();
		await expect(page.locator("[data-ai-assist-saved]")).toBeVisible();

		// Esc pauses visual presence.
		await page.keyboard.press("Escape");
		await expect(page.locator(DRAWER)).toHaveCount(0);

		// Re-open: the session was not aborted — the saved-thread notice persists.
		await pressToggleChord(page);
		await expect(page.locator(DRAWER)).toHaveAttribute("data-open", "true");
		await expect(page.locator("[data-ai-assist-saved]")).toContainText(
			"Thread saved as prompt template",
		);
	});

	test("⌘/ toggles the drawer from a second production route", async ({ page }) => {
		await page.goto("/build-board", { waitUntil: "load" });
		await pressToggleChord(page);
		await expect(page.locator(DRAWER)).toBeVisible();
		await pressToggleChord(page);
		await expect(page.locator(DRAWER)).toHaveCount(0);
	});
});

test.describe("global AI Assist drawer — permission", () => {
	test("composer + send action stay keyboard-reachable for an operator", async ({ page }) => {
		await page.goto("/", { waitUntil: "load" });
		await pressToggleChord(page);

		const composer = page.locator("[data-ai-assist-composer]");
		await expect(composer).toBeVisible();
		const textarea = composer.locator("textarea");
		await textarea.focus();
		await expect(textarea).toBeFocused();
		await expect(composer.locator("[data-ai-assist-send]")).toBeVisible();
	});
});

test.describe("global AI Assist drawer — mobile", () => {
	test("renders as the 92vw bottom sheet on a mobile viewport", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/", { waitUntil: "load" });
		await pressToggleChord(page);

		const drawer = page.locator(DRAWER);
		await expect(drawer).toBeVisible();
		await expect(drawer).toHaveAttribute("data-side", "bottom");
		await expectDrawerInsideViewport(drawer, { width: 390, height: 844 });

		const shot = await page.screenshot({ fullPage: false });
		await test.info().attach("ai-assist-drawer-mobile", {
			body: shot,
			contentType: "image/png",
		});
		await writeEvidenceShot("ai-assist-drawer-mobile.png", shot);
	});
});

test.describe("global AI Assist drawer — forced-colors", () => {
	test("stays operable under Windows high-contrast emulation", async ({ page }) => {
		await page.emulateMedia({ forcedColors: "active" });
		await page.goto("/", { waitUntil: "load" });
		await pressToggleChord(page);

		const drawer = page.locator(DRAWER);
		await expect(drawer).toBeVisible();
		await expect(drawer.locator("[data-slot='acp-drawer-meta']")).toBeVisible();
		await expect(drawer.locator("[data-slot='acp-drawer-agent-picker']")).toBeVisible();

		const shot = await page.screenshot({ fullPage: false });
		await test.info().attach("ai-assist-drawer-forced-colors", {
			body: shot,
			contentType: "image/png",
		});
		await writeEvidenceShot("ai-assist-drawer-forced-colors.png", shot);
	});
});

test.describe("AI Assist reference route", () => {
	test("/ai-assist resolves and lands with the shell drawer open", async ({ page }) => {
		const response = await page.goto("/ai-assist", { waitUntil: "load" });
		// No 404 — the route still resolves.
		expect(response?.status()).toBeLessThan(400);

		await expect(page.locator("[data-ai-assist-page]")).toBeVisible();
		await expect(page.locator("[data-ai-assist-page]")).toHaveAttribute(
			"data-ai-assist-ready",
			"true",
		);
		await expect(page.locator("h1", { hasText: "AI Assist" })).toBeVisible();

		// The reference route opens the SAME shell AcpDrawer — not a route-local copy.
		const drawer = page.locator(DRAWER);
		await expect(drawer).toBeVisible();
		await expect(drawer).toHaveAttribute("data-open", "true");
		await expect(page.locator(DRAWER)).toHaveCount(1);

		// Forbidden protocol wording stays out of the chrome.
		const visible = (await page.locator("[data-ai-assist-page]").innerText()).toLowerCase();
		expect(visible).not.toMatch(/\bacp\b/);
	});
});
