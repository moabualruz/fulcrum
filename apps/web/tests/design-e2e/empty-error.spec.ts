import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function openDesignKit(page: Page): Promise<void> {
	await page.goto("/design-kit");
	await expect(page.locator("[data-design-kit-ready='true']")).toBeVisible();
}

// COPY.md §2 verbatim empty-state copy contract — H2 + paragraph per stage.
const emptyCopy: Record<string, { h2: string; p: string }> = {
	"capture-drafts": {
		h2: "No drafts yet.",
		p: "Drafts collect half-formed ideas. Press c to capture, or hand off from intake.",
	},
	"plan-prototypes": {
		h2: "No prototypes yet.",
		p: "Prototypes appear when a planning session ships a draft. Start one to seed this list.",
	},
	"build-list": {
		h2: "No tasks yet.",
		p: "Materialize an approved plan, or press c to create a task directly.",
	},
	"review-queue": {
		h2: "No reviews waiting.",
		p: "Items appear here when a task moves to in-review. Push something forward.",
	},
	"ship-archive": {
		h2: "No releases shipped.",
		p: "Approved reviews send artifacts here. Cut a release once review is green.",
	},
	"operate-alerts": {
		h2: "No alerts firing.",
		p: "Doctor is quiet. Re-probe to refresh, or open telemetry for trends.",
	},
};

// COPY.md §2 + §3 hard bans — must never render on an empty or error surface.
const bannedStrings = [
	"Oh no!",
	"Nothing here yet!",
	"Something went wrong",
	"Oops!",
	"Please try again",
];

test.describe("cross-cutting empty + error state system", () => {
	test("each per-stage empty state renders the COPY.md §2 verbatim H2 and paragraph", async ({
		page,
	}) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='empty-state-stages']");
		await expect(section).toBeVisible();
		await expect(section.locator("[data-design-kit-empty-branch-state]")).toContainText(
			"Branch: empty",
		);

		for (const [id, copy] of Object.entries(emptyCopy)) {
			const card = section.locator(`[data-design-kit-empty-card='${id}']`);
			const empty = card.locator("[data-slot='empty-state']");
			await expect(empty).toBeVisible();
			await expect(empty).toHaveAttribute("role", "status");
			const title = empty.locator("[data-slot='empty-state-title']");
			await expect(title).toHaveText(copy.h2);
			// Title is an H2 per COPY.md §2 canonical HTML shape.
			expect(await title.evaluate((node) => node.tagName)).toBe("H2");
			await expect(empty.locator("[data-slot='empty-state-description']")).toHaveText(copy.p);
		}
	});

	test("every empty state obeys the one-primary-plus-one-ghost rule — never three buttons", async ({
		page,
	}) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='empty-state-stages']");
		const cards = section.locator("[data-design-kit-empty-card]");
		const count = await cards.count();
		expect(count).toBe(8);
		for (let i = 0; i < count; i += 1) {
			const card = cards.nth(i);
			const actions = card.locator("[data-slot='empty-state-actions']");
			await expect(actions).toBeVisible();
			const buttons = actions.locator("button");
			await expect(buttons).toHaveCount(2);
		}
	});

	test("the empty-state primary action is keyboard reachable", async ({ page }) => {
		await openDesignKit(page);
		const primary = page.locator("[data-design-kit-empty-primary='capture-drafts']");
		await primary.focus();
		await expect(primary).toBeFocused();
	});

	test("the Operate empty state uses the steady tone — empty is a healthy state", async ({
		page,
	}) => {
		await openDesignKit(page);
		const operate = page
			.locator("[data-design-kit-empty-card='operate-alerts']")
			.locator("[data-slot='empty-state']");
		await expect(operate).toHaveAttribute("data-tone", "steady");
		const others = page
			.locator("[data-design-kit-empty-card='capture-drafts']")
			.locator("[data-slot='empty-state']");
		await expect(others).toHaveAttribute("data-tone", "absence");
	});

	test("toggling the empty branch swaps the zero-data state for the populated branch", async ({
		page,
	}) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='empty-state-stages']");
		await expect(section.locator("[data-slot='empty-state']").first()).toBeVisible();
		await section.locator("[data-design-kit-empty-branch='populated']").click();
		await expect(section.locator("[data-design-kit-empty-branch-state]")).toContainText(
			"Branch: populated",
		);
		await expect(section.locator("[data-slot='empty-state']")).toHaveCount(0);
		await expect(
			section.locator("[data-design-kit-empty-populated='capture-drafts']"),
		).toBeVisible();
	});

	test("each inline error renders the COPY.md §3 template with a recovery action and a trace id", async ({
		page,
	}) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='inline-error']");
		await expect(section).toBeVisible();
		await expect(section.locator("[data-design-kit-error-branch-state]")).toContainText(
			"Branch: error",
		);

		const banners = section.locator("[data-slot='error-banner']");
		await expect(banners).toHaveCount(3);

		const runFailure = section
			.locator("[data-design-kit-error-card='agent-run-failed']")
			.locator("[data-slot='error-banner']");
		await expect(runFailure).toHaveAttribute("role", "alert");
		await expect(runFailure.locator("[data-slot='error-banner-title']")).toContainText(
			"Run run_56e3d12 failed at step build.",
		);
		// Recovery action is present and imperative.
		const retry = runFailure.locator("[data-slot='error-banner-retry']");
		await expect(retry).toContainText("Retry from step");
		// Trace reference is present and copyable.
		const trace = runFailure.locator("[data-slot='error-banner-trace']");
		await expect(trace).toHaveText("tr_56e3d12fa1b8");
		await expect(runFailure.locator("[data-slot='error-banner-trace-copy']")).toBeVisible();
	});

	test("the inline error recovery action is keyboard reachable", async ({ page }) => {
		await openDesignKit(page);
		const retry = page
			.locator("[data-design-kit-error-card='api-5xx']")
			.locator("[data-slot='error-banner-retry']");
		await retry.focus();
		await expect(retry).toBeFocused();
	});

	test("toggling the error branch swaps the error state for the populated branch", async ({
		page,
	}) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='inline-error']");
		await expect(section.locator("[data-slot='error-banner']").first()).toBeVisible();
		await section.locator("[data-design-kit-error-branch='populated']").click();
		await expect(section.locator("[data-design-kit-error-branch-state]")).toContainText(
			"Branch: populated",
		);
		await expect(section.locator("[data-slot='error-banner']")).toHaveCount(0);
		await expect(section.locator("[data-design-kit-error-populated='api-5xx']")).toBeVisible();
	});

	test("no banned empty or error string renders on any empty or error surface", async ({
		page,
	}) => {
		await openDesignKit(page);
		for (const sectionId of ["empty-state-stages", "inline-error"]) {
			const section = page.locator(`[data-design-kit-section='${sectionId}']`);
			const text = (await section.innerText()).toLowerCase();
			for (const banned of bannedStrings) {
				expect(text, `${sectionId} must not contain "${banned}"`).not.toContain(
					banned.toLowerCase(),
				);
			}
		}
	});
});
