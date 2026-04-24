import { test, expect } from "@playwright/test";

test("cockpit doctor view exposes privacy and capability state", async ({ page }) => {
  await page.setContent(`
    <main>
      <h1>Doctor</h1>
      <section aria-label="Privacy status"><h2>Privacy</h2><p>Local only</p></section>
      <section aria-label="Capability health"><h2>Capabilities</h2><p>cap_local_state guided Run setup apply</p></section>
    </main>
  `);

  await expect(page.getByRole("heading", { name: "Doctor" })).toBeVisible();
  await expect(page.getByLabel("Privacy status")).toContainText("Local only");
  await expect(page.getByLabel("Capability health")).toContainText("cap_local_state");
});
