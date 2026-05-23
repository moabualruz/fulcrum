import { expect, test } from "../e2e/fixtures";

test.describe("projects repos route interaction coverage", () => {
	test("adds local and remote repos from the project route", async ({ page, fulcrumHome }) => {
		const project = await fulcrumHome.seedProject("repos-design-desktop", "Repos Design Desktop");
		await page.goto(`/projects/${project.id}/repos`);

		await expect(page.locator("[data-project-repos-header]")).toContainText("Repos");

		await page.locator("[data-add-repo-trigger]").click();
		const addForm = page.locator("[data-add-repo-form]");
		await expect(addForm).toBeVisible();
		await addForm.locator("input[name='kind'][value='local']").check();
		await addForm.locator("input[name='path']").fill("/tmp/repos-design-local");
		await addForm.locator("input[name='name']").fill("Repos Design Local");
		await addForm.getByRole("button", { name: "Save" }).click();
		await expect(page.locator("[data-repo-card]").filter({ hasText: "Repos Design Local" })).toBeVisible();

		await page.goto(`/projects/${project.id}/repos`);
		await page.locator("[data-add-repo-trigger]").click();
		await expect(addForm).toBeVisible();
		await addForm.locator("input[name='kind'][value='remote']").check();
		await addForm.locator("input[name='url']").fill("https://example.com/repos-design-remote.git");
		await addForm.locator("input[name='name']").fill("Repos Design Remote");
		await addForm.getByRole("button", { name: "Save" }).click();
		await expect(page.locator("[data-repo-card]").filter({ hasText: "Repos Design Remote" })).toBeVisible();
		await expect(page.locator("[data-repo-kind]").filter({ hasText: "remote" })).toBeVisible();

		await test.info().attach("projects-repos-desktop", {
			body: await page.screenshot({ fullPage: true }),
			contentType: "image/png",
		});
	});

	test("keeps link errors in-page instead of surfacing a dead endpoint", async ({ page, fulcrumHome }) => {
		const project = await fulcrumHome.seedProject("repos-design-link", "Repos Design Link");
		await page.goto(`/projects/${project.id}/repos`);

		await page.locator("[data-link-repo-trigger]").click();
		await page.locator("[data-link-repo-form]").getByRole("button", { name: "Link" }).click();
		await expect(page.locator("[data-link-repo-feedback]")).toContainText("repoId required");
		await expect(page.locator("[data-project-repos-header]")).toBeVisible();
	});

	test("keeps add and link controls usable on mobile without horizontal overflow", async ({ page, fulcrumHome }) => {
		const project = await fulcrumHome.seedProject("repos-design-mobile", "Repos Design Mobile");
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto(`/projects/${project.id}/repos`);

		await page.locator("[data-add-repo-trigger]").click();
		await expect(page.locator("[data-add-repo-form]")).toBeVisible();
		await page.locator("[data-link-repo-trigger]").click();
		await expect(page.locator("[data-link-repo-form]")).toBeVisible();

		const overflow = await page.locator("[data-testid='project-repos-page']").evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);

		await test.info().attach("projects-repos-mobile", {
			body: await page.screenshot({ fullPage: true }),
			contentType: "image/png",
		});
	});

	test("falls back to project recovery when the project is missing", async ({ page }) => {
		const response = await page.goto("/projects/missing-project-id/repos");
		expect(response?.status()).toBe(404);

		await expect(page.locator("[data-project-detail-error]")).toBeVisible();
	});
});
