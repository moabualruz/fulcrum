import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Rendered design-fidelity coverage for `prd-web-plan-prototypes-od-fidelity`.
 *
 * The Plan-stage prototype gallery — canonical route
 * `/<ws>/projects/<projId>/plan/prototypes` (IA-MAP.md §2.2 "prototype
 * callout(s)" / §3 `:prototype` "prototype gallery · live + archived"),
 * rendered at `/plan-prototypes`. Proven against OD `plan-prototypes.html`,
 * COPY.md §2 plan-prototypes empty state, CLI-TUI-UX.md §1.2 prototype
 * commands, and DESIGN.md §4.11/§4.13 mode row:
 *
 *  - layout — page head with `N live · M archived` count, subtitle, and a
 *    responsive card grid; each card has a 16:10 canvas thumbnail, title,
 *    monospace meta, a live/archived badge, Open/Duplicate/Restore actions,
 *    and a per-card mode row.
 *  - data-states — populated (live + archived cards) and empty (COPY.md §2).
 *  - interactions — Open embeds the prototype preview into plan-review pane 2;
 *    Restore moves an archived card back to live; Duplicate seeds a live card.
 *  - copy — empty state matches the COPY.md §2 plan-prototypes worked example
 *    verbatim (not the divergent OD inline copy).
 *  - parity — the Open handoff lands on `/plan-review`, the surface that owns
 *    the embedded prototype callout (`prd-web-plan-review-od-fidelity`).
 *  - accessibility — keyboard-operable card actions, mode-row toolbar, focus
 *    ring; archived cards are dimmed + grayscaled.
 *
 * Source: OD `plan-prototypes.html`; IA-MAP.md §2.2 / §3; CLI-TUI-UX.md §1.2;
 * COPY.md §2; DESIGN.md §4.11 / §4.13.
 */

/** Persist a rendered screenshot to the recovery-packet evidence dir. */
async function writeEvidenceShot(name: string, body: Buffer): Promise<void> {
	const dir = process.env.FULCRUM_DESIGN_EVIDENCE_DIR;
	if (!dir) return;
	await mkdir(dir, { recursive: true });
	await writeFile(path.join(dir, name), body);
}

test.describe("plan-prototypes — gallery layout (OD plan-prototypes.html)", () => {
	test.beforeEach(async ({ page }) => {
		await page.goto("/plan-prototypes");
	});

	test("renders the page head, count, subtitle, and the prototype card grid", async ({ page }) => {
		await expect(page.locator("[data-plan-prototypes-page]")).toBeVisible();
		await expect(page.locator("[data-plan-prototypes-page]")).toHaveAttribute(
			"data-state",
			"populated",
		);

		// Page head — "Prototypes" + the `N live · M archived` count.
		await expect(page.getByRole("heading", { name: "Prototypes", level: 1 })).toBeVisible();
		await expect(page.locator("[data-prototype-count]")).toHaveText("2 live · 1 archived");

		// Responsive card grid — three seeded prototypes.
		await expect(page.locator("[data-prototype-grid]")).toBeVisible();
		await expect(page.locator("[data-prototype-grid] [data-prototype]")).toHaveCount(3);

		const shot = await page.locator("[data-plan-prototypes-page]").screenshot();
		await writeEvidenceShot("plan-prototypes-populated.png", shot);
	});

	test("each card carries a 16:10 canvas thumbnail, title, monospace meta, badge, and mode row", async ({
		page,
	}) => {
		const card = page.locator("[data-prototype='proto-offline-token-refresh']");
		await expect(card).toBeVisible();

		// 16:10 canvas thumbnail (DESIGN.md aspect-ratio 16/10).
		const canvas = card.locator("[data-prototype-canvas]");
		await expect(canvas).toBeVisible();
		const ratio = await canvas.evaluate((el) => {
			const r = el.getBoundingClientRect();
			return r.width / r.height;
		});
		expect(ratio).toBeGreaterThan(1.55);
		expect(ratio).toBeLessThan(1.65);

		// Title + monospace meta.
		await expect(card.getByRole("heading", { name: "Offline-first token refresh" })).toBeVisible();
		await expect(card.locator("[data-prototype-meta]")).toHaveText(
			"plan_8f29a4c · 3 screens · last edit 1h ago",
		);

		// Per-card mode row — the universal DESIGN.md §4.13 ModeAffordance.
		const modeRow = card.locator("[data-prototype-mode-row]");
		await expect(modeRow).toHaveAttribute("role", "toolbar");
		await expect(modeRow).toHaveAttribute("aria-label", "Step modes");
		await expect(modeRow.locator("[data-slot='mode-row-option']")).toHaveCount(4);
	});

	test("live cards show a live badge with Open + Duplicate; archived cards offer Restore", async ({
		page,
	}) => {
		const live = page.locator("[data-prototype='proto-offline-token-refresh']");
		await expect(live).toHaveAttribute("data-prototype-state", "live");
		await expect(live.locator("[data-prototype-badge]")).toHaveText("live");
		await expect(live.locator("[data-prototype-footer]")).toContainText("embedded in plan review");
		await expect(live.locator("[data-prototype-open]")).toBeVisible();
		await expect(live.locator("[data-prototype-duplicate]")).toBeVisible();

		const archived = page.locator("[data-prototype='proto-board-variant']");
		await expect(archived).toHaveAttribute("data-prototype-state", "archived");
		await expect(archived.locator("[data-prototype-badge]")).toHaveText("archived");
		await expect(archived.locator("[data-prototype-restore]")).toBeVisible();
		await expect(archived.locator("[data-prototype-open]")).toHaveCount(0);
	});

	test("archived cards are dimmed and grayscaled — the lives-until-ship auto-archive rule", async ({
		page,
	}) => {
		const archived = page.locator("[data-prototype='proto-board-variant']");
		// Dimmed — Tailwind `opacity-70`.
		await expect(archived).toHaveCSS("opacity", "0.7");
		// Grayscaled canvas — Tailwind `grayscale`.
		const filter = await archived
			.locator("[data-prototype-canvas]")
			.evaluate((el) => getComputedStyle(el).filter);
		expect(filter).toContain("grayscale");
	});
});

test.describe("plan-prototypes — interactions (OD plan-prototypes.html)", () => {
	test("the card Open action hands off to the plan-review prototype callout (pane 2)", async ({
		page,
	}) => {
		await page.goto("/plan-prototypes");
		await page
			.locator("[data-prototype='proto-offline-token-refresh'] [data-prototype-open]")
			.click();

		// The Open handoff lands on plan-review — the surface that embeds the
		// prototype preview in pane 2 (`prd-web-plan-review-od-fidelity`).
		await expect(page).toHaveURL(/\/plan-review\?prototype=proto-offline-token-refresh/);
		await expect(page.locator("[data-plan-review-page]")).toBeVisible();
		await expect(page.locator("[data-prototype-pane]")).toBeVisible();
		await expect(page.locator("[data-prototype-device]")).toBeVisible();
	});

	test("Restore moves an archived prototype back to live", async ({ page }) => {
		await page.goto("/plan-prototypes");
		await expect(page.locator("[data-prototype-count]")).toHaveText("2 live · 1 archived");

		const archived = page.locator("[data-prototype='proto-board-variant']");
		await archived.locator("[data-prototype-restore]").click();

		await expect(archived).toHaveAttribute("data-prototype-state", "live");
		await expect(archived.locator("[data-prototype-badge]")).toHaveText("live");
		await expect(archived.locator("[data-prototype-open]")).toBeVisible();
		await expect(page.locator("[data-prototype-count]")).toHaveText("3 live · 0 archived");
	});

	test("Duplicate seeds a new live prototype card", async ({ page }) => {
		await page.goto("/plan-prototypes");
		await expect(page.locator("[data-prototype-grid] [data-prototype]")).toHaveCount(3);

		await page
			.locator("[data-prototype='proto-trace-stitch'] [data-prototype-duplicate]")
			.click();

		await expect(page.locator("[data-prototype-grid] [data-prototype]")).toHaveCount(4);
		await expect(page.locator("[data-prototype-count]")).toHaveText("3 live · 1 archived");
	});
});

test.describe("plan-prototypes — empty state (COPY.md §2 worked example)", () => {
	test("the empty state renders the COPY.md §2 verbatim copy, not the divergent OD inline copy", async ({
		page,
	}) => {
		await page.goto("/plan-prototypes?state=empty");

		await expect(page.locator("[data-plan-prototypes-page]")).toHaveAttribute(
			"data-state",
			"empty",
		);
		const empty = page.locator("[data-plan-prototypes-empty]");
		await expect(empty).toBeVisible();
		await expect(empty).toHaveAttribute("role", "status");

		// COPY.md §2 plan-prototypes — H2 + paragraph verbatim.
		const title = empty.locator("[data-slot='empty-state-title']");
		await expect(title).toHaveText("No prototypes yet.");
		expect(await title.evaluate((node) => node.tagName)).toBe("H2");
		await expect(empty.locator("[data-slot='empty-state-description']")).toHaveText(
			"Prototypes appear when a planning session ships a draft. Start one to seed this list.",
		);

		// The COPY.md §2 buttons — `Start planning`, `Open templates`.
		await expect(empty.locator("[data-empty-start-planning]")).toHaveText("Start planning");
		await expect(empty.locator("[data-empty-open-templates]")).toHaveText("Open templates");
		// Never the divergent OD inline copy.
		await expect(empty).not.toContainText("Throwaway scaffolds attach to a plan");
		await expect(empty).not.toContainText("New prototype");

		const shot = await page.locator("[data-plan-prototypes-page]").screenshot();
		await writeEvidenceShot("plan-prototypes-empty.png", shot);
	});

	test("the empty-state primary action re-seeds the gallery", async ({ page }) => {
		await page.goto("/plan-prototypes?state=empty");
		await page.locator("[data-empty-start-planning]").click();

		await expect(page.locator("[data-plan-prototypes-page]")).toHaveAttribute(
			"data-state",
			"populated",
		);
		await expect(page.locator("[data-prototype-grid] [data-prototype]")).toHaveCount(3);
	});
});

test.describe("plan-prototypes — accessibility", () => {
	test("card actions are keyboard reachable and show a visible focus ring", async ({ page }) => {
		await page.goto("/plan-prototypes");
		const open = page.locator(
			"[data-prototype='proto-offline-token-refresh'] [data-prototype-open]",
		);
		await open.focus();
		await expect(open).toBeFocused();

		// The mode-row toolbar is reachable as a single Tab stop group.
		const modeOption = page
			.locator("[data-prototype='proto-offline-token-refresh'] [data-prototype-mode-row]")
			.locator("[data-slot='mode-row-option']")
			.first();
		await modeOption.focus();
		await expect(modeOption).toBeFocused();
	});
});
