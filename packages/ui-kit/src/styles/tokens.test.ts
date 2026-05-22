import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const tokensCss = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");
const lightBlock = tokensCss.slice(tokensCss.indexOf(":root {"), tokensCss.indexOf(".dark,"));

function lightTokenValue(token: string) {
	const match = lightBlock.match(new RegExp(`--${token}:\\s*([^;]+);`));
	return match?.[1];
}

describe("ui-kit light color tokens - DESIGN.md section 1.2", () => {
	test("matches the canonical light-mode semantic color values", () => {
		expect(lightTokenValue("fg-muted")).toBe("oklch(0.58 0.01 270)");
		expect(lightTokenValue("border-focus")).toBe("oklch(0.62 0.18 250)");
		expect(lightTokenValue("accent")).toBe("oklch(0.62 0.18 250)");
		expect(lightTokenValue("accent-hover")).toBe("oklch(0.56 0.20 250)");
	});
});
