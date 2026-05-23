import { expect, test } from "../e2e/fixtures";

test.describe("review final gate handoff", () => {
  test("surfaces UAT/code-review decisions, trace event, and generated E2E artifacts", async ({ page, fulcrumHome }) => {
    const project = await fulcrumHome.seedProject("review-final-gate", "Review Final Gate");

    await page.goto(`/projects/${project.id}/review`);

    await expect(page.locator("[data-final-gate]")).toBeVisible();
    await expect(page.locator("[data-code-review-prompt]")).toContainText("Code review prompt");
    await expect(page.locator("[data-code-review-prompt]")).toContainText("request changes");
    await expect(page.locator("[data-decision-event-trace]")).toContainText("trace");
    await expect(page.locator("[data-uat-handoff-link]")).toHaveAttribute("href", `/projects/${project.id}/uat`);
    await expect(page.locator("[data-generated-e2e-link]")).toHaveAttribute("href", `/projects/${project.id}/e2e`);
    await expect(page.locator("[data-generated-e2e-artifacts]")).toContainText("apps/web/tests/e2e");

    await expect(page.locator("[data-uat-decision]")).toBeVisible();
    await expect(page.locator('input[name="traceId"]').first()).toHaveValue(/trace/);
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Request Changes" })).toBeVisible();
  });
});
