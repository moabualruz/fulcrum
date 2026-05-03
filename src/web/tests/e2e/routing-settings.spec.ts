const isPlaywrightCli = process.argv.some((arg) => arg.includes("playwright"));

if (isPlaywrightCli) {
  const { test, expect } = await import("./fixtures.ts");

  test("routing settings create, dry-run, and delete a rule", async ({ page }) => {
    await page.goto("/settings/routing");

    await page.getByRole("button", { name: "New rule" }).click();
    await page.getByLabel("Rule name").fill("Bugs to Codex");
    await page.getByLabel("Agent").fill("codex");
    await page.getByLabel("Conditions JSON").fill(
      JSON.stringify({ all: [{ fact: "task.kind", operator: "equal", value: "bug" }] }),
    );
    await page.getByRole("button", { name: "Create rule" }).click();

    await expect(page.getByText("Bugs to Codex")).toBeVisible();

    await page.getByLabel("Task JSON").fill(JSON.stringify({ title: "Fix bug", kind: "bug", priority: "high", tags: [] }));
    await page.getByRole("button", { name: "Test routing" }).click();
    await expect(page.getByText("Bugs to Codex -> codex")).toBeVisible();

    await page.locator("[data-routing-delete]").first().click();
    await expect(page.getByText("Bugs to Codex")).toHaveCount(0);
  });
}

export {};
