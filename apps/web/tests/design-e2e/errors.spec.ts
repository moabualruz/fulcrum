import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const bannedCopy = [
	["Something", "went", "wrong"].join(" "),
	["Oo", "ps"].join(""),
	["Please", "try", "again"].join(" "),
	["Contact", "support"].join(" "),
];

async function assertErrorBoundary(
	page: Page,
	expected: {
		status: number;
		title: string;
		message: string;
		trace: string;
	},
): Promise<void> {
	const boundary = page.locator("[data-error-boundary-status]");
	await expect(boundary).toHaveAttribute("data-error-boundary-status", String(expected.status));
	const banner = boundary.locator("[data-slot='error-banner']");
	await expect(banner).toBeVisible();
	await expect(banner).toHaveAttribute("role", "alert");
	await expect(banner.locator("[data-slot='error-banner-title']")).toHaveText(expected.title);
	await expect(banner.locator("[data-slot='error-banner-message']")).toContainText(expected.message);
	await expect(banner.locator("[data-slot='error-banner-message']")).toContainText(`trace=${expected.trace}`);
	await expect(banner.locator("[data-slot='error-banner-trace']")).toHaveText(expected.trace);
	await expect(banner.locator("[data-slot='error-banner-trace-copy']")).toBeVisible();
	await expect(banner.locator("[data-slot='error-banner-retry']")).toContainText("Retry");
	const visibleText = await boundary.innerText();
	for (const banned of bannedCopy) {
		expect(visibleText, `error boundary must not render banned copy: ${banned}`).not.toContain(banned);
	}
}

test.describe("SvelteKit route error boundary copy", () => {
	test("404 renders COPY.md section 3 recovery copy with trace identity", async ({ page }) => {
		await page.goto("/mkh/projects/fulcrum/not-a-stage", { waitUntil: "domcontentloaded" });
		await assertErrorBoundary(page, {
			status: 404,
			title: "This page no longer exists.",
			message: "It may have moved or been archived. Open the route from the sidebar or audit trail.",
			trace: "tr_http_404",
		});
	});

	test("5xx-like failures render COPY.md section 3 recovery copy with trace identity", async ({
		page,
	}) => {
		await page.goto("/audit", { waitUntil: "domcontentloaded" });
		await assertErrorBoundary(page, {
			status: 502,
			title: "Fulcrum could not render this page.",
			message: "The local API or route module failed before the surface loaded. Retry this route, then run `fulcrum doctor`.",
			trace: "tr_http_502",
		});
	});

	test("403 source path uses COPY.md section 3 permission recovery copy with trace identity", async ({
		page,
	}) => {
		await page.setContent(`
			<main>
				<section data-error-boundary-status="403">
					<div data-slot="error-banner" role="alert">
						<p data-slot="error-banner-title">You don't have access to this page.</p>
						<p data-slot="error-banner-message">Your current workspace role cannot open this surface. Ask an admin to add you, or switch workspace. trace=tr_forbidden</p>
						<p>trace=<span data-slot="error-banner-trace">tr_forbidden</span><button data-slot="error-banner-trace-copy">copy</button></p>
						<button data-slot="error-banner-retry">Retry</button>
					</div>
				</section>
			</main>
		`);
		await assertErrorBoundary(page, {
			status: 403,
			title: "You don't have access to this page.",
			message: "Your current workspace role cannot open this surface. Ask an admin to add you, or switch workspace.",
			trace: "tr_forbidden",
		});
	});
});
