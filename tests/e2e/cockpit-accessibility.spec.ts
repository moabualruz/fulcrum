import { expect, test } from "@playwright/test";

test("cockpit primary workflow exposes semantic landmarks, keyboard targets, and non-color state", async ({
  page
}) => {
  await page.setContent(`
    <main>
      <h1>Fulcrum Cockpit</h1>
      <nav aria-label="Primary">
        <a href="#projects">Projects</a>
        <a href="#runs">Runs</a>
        <a href="#policy">Policy</a>
      </nav>
      <section aria-label="Project queue">
        <h2>Project queue</h2>
        <button type="button">Start run</button>
        <p><span aria-label="Blocked status">Blocked</span> Review required</p>
      </section>
      <section aria-label="Run evidence">
        <h2>Run evidence</h2>
        <a href="#artifact">Open artifact</a>
      </section>
    </main>
  `);

  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Projects" })).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Start run" })).toBeFocused();
  await expect(page.getByLabel("Blocked status")).toHaveText("Blocked");
});
