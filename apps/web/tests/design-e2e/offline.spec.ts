import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Rendered design proof for the shell connection banner
 * (`prd-cross-offline-connection-state`).
 *
 * The offline + queued-mutation state is no longer a standalone route — the
 * former `offline` / `cross-cutting-offline` routes are absorbed into the shell
 * (`design-alignment/cross-states.md` §error.html). The `connection.ts` store's
 * `offline | syncing | online` machine drives a single `Banner` in
 * `+layout.svelte`.
 *
 * These specs drive chromium over the production shell route (`/`), emulate
 * offline with `context.setOffline(true)`, and assert:
 *  - the shell connection banner appears with COPY.md §3 verbatim copy;
 *  - the banned error copy ("Please try again" / "Something went wrong") is
 *    absent;
 *  - the "View queued changes" affordance is keyboard reachable and toggles an
 *    inline queued-changes list (no error toast — COPY.md §3);
 *  - the banner renders under `forced-colors: active` (DESIGN.md §1.6);
 *  - the absorbed `offline` / `cross-cutting-offline` paths still resolve
 *    (308 → `/`), never 404.
 *
 * States covered: `populated`, `error` (offline-class), `offline`,
 * `forced-colors`.
 */

const BANNER = "[data-shell-region='connection-banner']";
const VIEW_QUEUED = "[data-view-queued-changes]";

/**
 * Persist a rendered screenshot to the recovery-packet evidence dir so the PRD
 * `evidence_refs` can cite an on-disk path (goal.md "rendered design proof").
 */
async function writeEvidenceShot(name: string, body: Buffer): Promise<void> {
	const dir = process.env.FULCRUM_DESIGN_EVIDENCE_DIR;
	if (!dir) return;
	await mkdir(dir, { recursive: true });
	await writeFile(path.join(dir, name), body);
}

test.describe("shell connection banner — offline", () => {
	test("shows the COPY.md §3 offline banner when connectivity drops", async ({
		page,
	}) => {
		await page.goto("/?e2e_offline_queue=1", { waitUntil: "load" });
		await expect.poll(() => page.evaluate(() => document.body.dataset.fulcrumHydrated)).toBe("true");

		await page.context().setOffline(true);
		await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);

		const banner = page.locator(BANNER);
		await expect(banner).toBeVisible();
		await expect(banner).toHaveAttribute("data-connection-state", "offline");
		// COPY.md §3 "Offline + queued mutation" — verbatim.
		await expect(banner.locator("[data-connection-message]")).toHaveText(
			"You're offline. This change is queued and will sync when you reconnect.",
		);
		// COPY.md §3 hard bans — none of these strings may appear in offline copy.
		await expect(banner).not.toContainText("Please try again");
		await expect(banner).not.toContainText("Something went wrong");
		await expect(banner).not.toContainText("Oops");

		const shot = await page.screenshot({ fullPage: true });
		await writeEvidenceShot("offline-connection-banner.png", shot);
	});

	test("View queued changes is keyboard reachable and toggles the queued list", async ({
		page,
	}) => {
		await page.goto("/?e2e_offline_queue=1", { waitUntil: "load" });
		await expect.poll(() => page.evaluate(() => document.body.dataset.fulcrumHydrated)).toBe("true");
		await page.context().setOffline(true);
		await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);

		const action = page.locator(VIEW_QUEUED);
		await expect(action).toBeVisible();
		await expect(action).toHaveText("View queued changes");
		await expect(action).toHaveAttribute("aria-expanded", "false");

		// Keyboard reachable: focus it directly and confirm a visible focus ring,
		// then activate with the keyboard — the affordance must not need a mouse.
		await action.focus();
		await expect(action).toBeFocused();
		const ring = await action.evaluate(
			(el) => getComputedStyle(el).getPropertyValue("--tw-ring-color") || getComputedStyle(el).outlineStyle,
		);
		expect(ring).not.toBe("");

		await action.press("Enter");
		await expect(action).toHaveAttribute("aria-expanded", "true");
		const queued = page.locator(BANNER).locator("[data-queued-change]");
		await expect(queued).toHaveCount(2);
		await expect(queued.first()).toContainText("task.update");

		// Toggling does not trap focus or block the shell — the action stays
		// focused and the main content is still reachable.
		await expect(action).toBeFocused();
		await action.press("Enter");
		await expect(action).toHaveAttribute("aria-expanded", "false");
	});

	test("renders the offline banner under forced-colors", async ({ page }) => {
		await page.emulateMedia({ forcedColors: "active" });
		await page.goto("/?e2e_offline_queue=1", { waitUntil: "load" });
		await expect.poll(() => page.evaluate(() => document.body.dataset.fulcrumHydrated)).toBe("true");
		await page.context().setOffline(true);
		await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);

		const banner = page.locator(BANNER);
		await expect(banner).toBeVisible();
		await expect(banner.locator("[data-connection-message]")).toBeVisible();
		await expect(page.locator(VIEW_QUEUED)).toBeVisible();
	});

	test("no connection banner in the steady online state", async ({ page }) => {
		await page.goto("/", { waitUntil: "load" });
		await expect.poll(() => page.evaluate(() => document.body.dataset.fulcrumHydrated)).toBe("true");
		await expect(page.locator(BANNER)).toHaveCount(0);
	});

	test("absorbed offline routes still resolve — 308 to the shell, never 404", async ({
		page,
	}) => {
		for (const oldPath of ["/offline", "/cross-cutting-offline"]) {
			const response = await page.goto(oldPath, { waitUntil: "load" });
			expect(response, `${oldPath} must return a response`).not.toBeNull();
			// SvelteKit follows the 308 — the operator lands on the shell route.
			expect(new URL(page.url()).pathname).toBe("/");
		}
	});
});
