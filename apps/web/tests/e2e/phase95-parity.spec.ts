import { expect, test } from "./fixtures.ts";

const parityRoutes = [
  ["/projects", /Projects/],
  ["/boards", /Board|Task/],
  ["/docs", /Docs|Document/],
  ["/runs", /Runs|Dispatch/],
  ["/memory", /Memory|Context/],
] as const;

test.describe("Phase 9.5 cross-interface parity web routes", () => {
  for (const [path, text] of parityRoutes) {
    test(`parity route ${path} SSRs and exposes shared domain`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.ok(), `${path} returned ${response?.status() ?? "no response"}`).toBe(true);
      await expect(page.locator("body")).not.toContainText("Internal Error");
      await expect(page.locator("body")).toContainText(text);
    });
  }
});
