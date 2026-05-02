const isPlaywrightCli = process.argv.some((argument) =>
  argument.includes("playwright"),
);

if (isPlaywrightCli) {
  const { expect, test } = await import("@playwright/test");

  test("TipTap baseline toggles bold and emits JSON in Svelte 5", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    await page.goto("/auth/tiptap-baseline");

    const editor = page.locator("[data-editor-baseline-input]");
    await expect(editor).toBeVisible();

    await page.locator("[data-editor-bold]").click();
    await editor.click();
    await page.keyboard.type("Hello world");

    await expect(editor.locator("strong")).toHaveText("Hello world");
    await expect(page.locator("[data-tiptap-change-json]")).toContainText(
      "Hello world",
    );
    expect(consoleErrors).toEqual([]);
  });
}

export {};
