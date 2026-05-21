import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { captureScreenshot } from "../../scripts/run-design-e2e.ts";

type TypeRole = {
	id: string;
	fontSize: number;
	lineHeight: number;
	lineRatio: string;
	fontWeight: string;
	family: "sans" | "mono";
};

type ComputedTextStyle = {
	fontFamily: string;
	fontSize: string;
	fontWeight: string;
	letterSpacing: string;
	lineHeight: string;
};

const TYPE_ROLES: TypeRole[] = [
	{ id: "display", fontSize: 40, lineHeight: 48, lineRatio: "1.2", fontWeight: "600", family: "sans" },
	{ id: "h1", fontSize: 32, lineHeight: 41.6, lineRatio: "1.3", fontWeight: "600", family: "sans" },
	{ id: "h2", fontSize: 24, lineHeight: 33.6, lineRatio: "1.4", fontWeight: "600", family: "sans" },
	{ id: "h3", fontSize: 20, lineHeight: 28, lineRatio: "1.4", fontWeight: "600", family: "sans" },
	{ id: "body", fontSize: 16, lineHeight: 24, lineRatio: "1.5", fontWeight: "400", family: "sans" },
	{ id: "caption", fontSize: 14, lineHeight: 19.6, lineRatio: "1.4", fontWeight: "500", family: "sans" },
	{ id: "code", fontSize: 14, lineHeight: 22.4, lineRatio: "1.6", fontWeight: "400", family: "mono" },
];

function px(value: string): number {
	return Number.parseFloat(value.replace("px", ""));
}

async function computed(locator: Locator): Promise<ComputedTextStyle> {
	return locator.evaluate((node) => {
		const style = getComputedStyle(node);
		return {
			fontFamily: style.fontFamily,
			fontSize: style.fontSize,
			fontWeight: style.fontWeight,
			letterSpacing: style.letterSpacing,
			lineHeight: style.lineHeight,
		};
	});
}

async function expectRole(locator: Locator, role: TypeRole): Promise<void> {
	const style = await computed(locator);
	expect(px(style.fontSize), `${role.id} font-size`).toBeCloseTo(role.fontSize, 1);
	expect(px(style.lineHeight), `${role.id} line-height`).toBeCloseTo(role.lineHeight, 1);
	expect(style.fontWeight, `${role.id} font-weight`).toBe(role.fontWeight);
	expect(["0px", "normal"], `${role.id} letter-spacing`).toContain(style.letterSpacing);
	if (role.family === "mono") {
		expect(style.fontFamily.toLowerCase(), `${role.id} mono family`).toContain("fira code");
	} else {
		expect(style.fontFamily.toLowerCase(), `${role.id} sans family`).toContain("inter");
	}
}

async function openDesignKit(page: Page): Promise<void> {
	await page.goto("/design-kit", { waitUntil: "load" });
	await expect(page.locator("[data-design-kit-ready='true']")).toBeVisible();
}

test.describe("OD typography fidelity", () => {
	test("design-kit renders every DESIGN.md §2 TypeRole at the tokenized size, line-height, weight, and family", async ({
		page,
	}) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='typography']");
		await expect(section).toBeVisible();
		await expect(section).toHaveAttribute("data-typography-source", "DESIGN.md §2");

		for (const role of TYPE_ROLES) {
			const row = section.locator(`[data-type-role='${role.id}']`);
			await expect(row).toHaveAttribute("data-font-size", `${role.fontSize}px`);
			await expect(row).toHaveAttribute("data-line-height", role.lineRatio);
			await expect(row).toHaveAttribute("data-font-weight", role.fontWeight);
			await expectRole(row.locator(`[data-type-sample='${role.id}']`), role);
		}
	});

	test("production design-kit shell fixtures preserve body, chrome, and mono hierarchy from OD tokens", async ({
		page,
	}) => {
		await openDesignKit(page);

		const body = await computed(page.locator("body"));
		expect(px(body.fontSize), "body font-size").toBeCloseTo(16, 1);
		expect(px(body.lineHeight), "body line-height").toBeCloseTo(24, 1);
		expect(body.fontFamily.toLowerCase()).toContain("inter");
		expect(["0px", "normal"], "body letter-spacing").toContain(body.letterSpacing);

		const scopeBar = await computed(page.locator("[data-slot='scope-bar']").first());
		expect(px(scopeBar.fontSize), "ScopeBar font-size").toBeCloseTo(14, 1);
		expect(scopeBar.fontFamily.toLowerCase()).toContain("inter");

		const stageItem = await computed(page.locator("[data-slot='stage-rail-item']").first());
		expect(px(stageItem.fontSize), "StageRail item font-size").toBeCloseTo(14, 1);
		expect(stageItem.fontFamily.toLowerCase()).toContain("inter");

		const footer = await computed(page.locator("[data-slot='status-footer']").first());
		expect(px(footer.fontSize), "StatusFooter dense font-size").toBeLessThanOrEqual(12);

		const trace = await computed(page.locator("[data-slot='trace-chip']").first());
		expect(trace.fontFamily.toLowerCase(), "TraceBadge mono family").toContain("fira code");
	});

	test("typography hierarchy remains readable on mobile", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='typography']");
		await expect(section).toBeVisible();

		for (const role of TYPE_ROLES) {
			await expectRole(section.locator(`[data-type-sample='${role.id}']`), role);
		}

		const shot = await captureScreenshot(page, "typography-mobile", { fullPage: true });
		await expect(page.locator("[data-type-role='display']")).toBeInViewport();
		expect(shot).toContain("typography-mobile.png");
	});

	test("typography hierarchy remains readable under forced-colors", async ({ page }) => {
		await page.emulateMedia({ forcedColors: "active" });
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='typography']");
		await expect(section).toBeVisible();

		const display = await computed(section.locator("[data-type-sample='display']"));
		const caption = await computed(section.locator("[data-type-sample='caption']"));
		expect(px(display.fontSize)).toBeGreaterThan(px(caption.fontSize));
		expect(display.fontWeight).toBe("600");
		expect(caption.fontWeight).toBe("500");

		const shot = await captureScreenshot(page, "typography-forced-colors", { fullPage: true });
		expect(shot).toContain("typography-forced-colors.png");
	});
});
