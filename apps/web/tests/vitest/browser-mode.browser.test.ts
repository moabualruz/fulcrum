import { expect, test } from "vitest";
import { page } from "vitest/browser";

test("runs browser-mode tests in Chromium", async () => {
  document.body.innerHTML = '<button type="button">Run</button>';

  await expect.element(page.getByRole("button", { name: "Run" })).toBeInTheDocument();
});
