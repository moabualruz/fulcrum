import { expect, test } from "@playwright/test";

test("release acceptance operator review captures evidence and next action recognition", async ({
  page
}) => {
  await page.setContent(`
    <main>
      <h1>Operator review</h1>
      <section aria-label="Task evidence">Task: release validation</section>
      <section aria-label="Context evidence">Context pack: ctx_release</section>
      <section aria-label="Changed files evidence">Changed files: tests, docs</section>
      <section aria-label="Quality gate evidence">Quality gates: passed</section>
      <section aria-label="Policy decision evidence">Policy decision: approved export</section>
      <section aria-label="Next action">Next action: merge after operator approval</section>
      <button type="button">Approve release</button>
    </main>
  `);

  await expect(page.getByRole("heading", { name: "Operator review" })).toBeVisible();
  await expect(page.getByLabel("Task evidence")).toContainText("release validation");
  await expect(page.getByLabel("Context evidence")).toContainText("ctx_release");
  await expect(page.getByLabel("Changed files evidence")).toContainText("tests, docs");
  await expect(page.getByLabel("Quality gate evidence")).toContainText("passed");
  await expect(page.getByLabel("Policy decision evidence")).toContainText("approved export");
  await expect(page.getByLabel("Next action")).toContainText("merge after operator approval");
  await expect(page.getByRole("button", { name: "Approve release" })).toBeVisible();
});
