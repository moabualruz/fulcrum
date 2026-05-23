import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../../../..", import.meta.url));

const copyBanlistFiles = [
	"apps/web/src/routes/design-kit/+page.svelte",
	"apps/web/src/routes/agents/+page.svelte",
	"apps/web/src/lib/components/tasks/AutomationRuleList.svelte",
	"apps/web/src/lib/components/reports/WipChart.svelte",
] as const;

const hiddenTransportLabel = "A" + "CP";
const hiddenDrawerLabel = "A" + "cpDrawer";
const discouragedPhrases = [
	hiddenDrawerLabel,
	hiddenTransportLabel,
	"Get started",
	"get started",
	"Model",
	"WIP",
] as const;

test.describe("copy banlist sweep", () => {
	test("source-owned web copy avoids banned visible labels", () => {
		for (const file of copyBanlistFiles) {
			const source = readFileSync(join(repoRoot, file), "utf8");
			for (const phrase of discouragedPhrases) {
				const pattern = phrase === "Model" || phrase === "WIP"
					? new RegExp(`\\b${phrase}\\b`)
					: phrase;
				if (typeof pattern === "string") {
					expect(source, `${file} contains ${phrase}`).not.toContain(pattern);
				} else {
					expect(source, `${file} contains ${phrase}`).not.toMatch(pattern);
				}
			}
		}
	});

	test("rendered design-kit section presents AI Assist language", async ({ page }) => {
		await page.goto("/design-kit");
		const section = page.locator("[data-design-kit-section='acp-drawer']");
		await expect(section).toBeVisible();
		await expect(section.getByRole("heading", { name: "AI Assist panel" })).toBeVisible();
		await expect(section).toContainText("AI Assist");
		const renderedText = await section.innerText();
		for (const phrase of [hiddenDrawerLabel, hiddenTransportLabel, "Get started", "get started"]) {
			expect(renderedText).not.toContain(phrase);
		}
		expect(renderedText).not.toMatch(/\bModel\b/);
		expect(renderedText).not.toMatch(/\bWIP\b/);
	});
});
