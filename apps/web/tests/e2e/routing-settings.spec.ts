const isPlaywrightCli = process.argv.some((arg) => arg.includes("playwright"));

if (isPlaywrightCli) {
  const { test, expect } = await import("./fixtures.ts");

  test("routing settings create, dry-run, and delete a rule", async ({
    page,
    fulcrumHome,
  }) => {
    void fulcrumHome;
    await page.goto("/auth/auto-session");
    await page.goto("/settings/routing");

    await page.getByLabel("Rule name").fill("Bugs to Codex");
    await page.getByLabel("Agent").fill("codex");
    await page.getByLabel("Conditions JSON").fill(
      JSON.stringify({ all: [{ fact: "task", path: "$.kind", operator: "equal", value: "bug" }] }),
    );
    await page.getByRole("button", { name: "Save rule" }).click();

    await expect(page.getByText("Bugs to Codex")).toBeVisible();

    await page.locator("[data-tab='test']").click();
    await page.getByLabel("Task JSON").fill(JSON.stringify({ title: "Fix bug", kind: "bug", priority: "high", tags: [] }));
    await page.getByRole("button", { name: "Test routing" }).click();
    await expect(page.locator("[data-routing-dry-run-result]")).toBeVisible();

    await page.locator("[data-routing-delete]").first().click();
    await expect(page.getByText("Bugs to Codex")).toHaveCount(0);
  });
}

export {};
