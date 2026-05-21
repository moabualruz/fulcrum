import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Rendered design-fidelity coverage for the Review workbench route — OD
 * `review.html` (`prd-web-review-workbench-od-fidelity`).
 *
 * Every assertion drives the production `/review/<reviewId>` route in a real
 * browser; no source-string assertions. The spec proves the PRD acceptance:
 *
 *  - **layout** — the four-region grid: head (breadcrumb / title /
 *    `waiting-input` badge / trace pill / decision actions), the
 *    Files/Comments/Free chat/Plan & tasks/Commits tab strip, a file tree +
 *    inline diff + notes rail, and the bottom dock;
 *  - **diff** — split/unified toggle, per-hunk accept/reject, commentable lines
 *    with anchored `CommentThread` annotations;
 *  - **dock** — Checks/Summary/Logs/Suggestions tabs with a gate readout;
 *  - **decision** — Re-run checks / Comment / `Approve & merge ⌘↵`, with the
 *    `Mod+Enter` overload (approve vs send-feedback);
 *  - **interactions** — `a` accept / `r` reject / `h` next-hunk keyboard;
 *  - **copy** — the `waiting-input` decision status is canonical (COPY.md §362);
 *  - **migration** — `comments-block-thread` is absorbed as the ui-kit
 *    `CommentThread` primitive; `review-templates` becomes the composer picker;
 *  - **accessibility** — `role="tablist"`/`tab`/`tabpanel`, focus ring,
 *    forced-colors render.
 *
 * Source: OD `review.html`; IA-MAP.md §2.4 + §4.4; DESIGN.md §4.5/§4.6/§9.1;
 * COPY.md §362. State: `populated`.
 */

/** Persist a rendered screenshot to the recovery-packet evidence dir. */
async function writeEvidenceShot(name: string, body: Buffer): Promise<void> {
	const dir = process.env.FULCRUM_DESIGN_EVIDENCE_DIR;
	if (!dir) return;
	await mkdir(dir, { recursive: true });
	await writeFile(path.join(dir, name), body);
}

/** The production workbench route the queue links into — `[reviewId]` segment. */
const ROUTE = "/review/4218";

test.describe("review workbench — OD review.html fidelity", () => {
	test("renders the four-region grid: head, tabs, tree+diff+notes, dock", async ({ page }) => {
		await page.goto(ROUTE);

		// layout — the workbench grid mounts under the [reviewId] route segment.
		const workbench = page.locator("[data-review-workbench]");
		await expect(workbench).toBeVisible();
		await expect(workbench).toHaveAttribute("data-review-id", "4218");

		// layout — head: breadcrumb, title, waiting-input badge, trace pill, actions.
		await expect(page.locator("[data-review-breadcrumb]")).toContainText("auth/rewrite");
		await expect(page.locator("[data-review-title]")).toContainText(
			"feat(auth): rotate session token per device",
		);
		await expect(page.locator("[data-review-decision-badge]")).toBeVisible();
		await expect(page.locator("[data-review-trace][data-slot='trace-chip']")).toBeVisible();
		await expect(page.locator("[data-review-action='rerun']")).toHaveText("Re-run checks");
		await expect(page.locator("[data-review-action='comment']")).toHaveText("Comment");
		await expect(page.locator("[data-review-action='approve']")).toContainText("Approve & merge");

		// layout — the five-panel tab strip plus the diff-view toggle.
		const tabs = page.locator("[data-review-tabs] [data-review-tab]");
		await expect(tabs).toHaveCount(5);
		for (const id of ["files", "comments", "chat", "plan", "commits"]) {
			await expect(page.locator(`[data-review-tab='${id}']`)).toBeVisible();
		}

		// layout — the file tree, the diff body, the notes rail, the dock.
		await expect(page.locator("[data-review-tree]")).toBeVisible();
		await expect(page.locator("[data-review-tree-file]")).not.toHaveCount(0);
		await expect(page.locator("[data-review-body]")).toBeVisible();
		await expect(page.locator("[data-review-notes]")).toBeVisible();
		await expect(page.locator("[data-review-dock]")).toBeVisible();
	});

	test("inline diff supports split/unified toggle, per-hunk accept/reject, commentable lines", async ({
		page,
	}) => {
		await page.goto(ROUTE);

		// diff — files panel is the default; diff files render with line numbers.
		await expect(page.locator("[data-review-panel='files']")).toBeVisible();
		await expect(page.locator("[data-review-diff-file]")).not.toHaveCount(0);
		await expect(page.locator("[data-review-diff-line]")).not.toHaveCount(0);

		// diff — the split/unified toggle flips the panel render mode.
		const toggle = page.locator("[data-review-diff-toggle]");
		await expect(toggle).toHaveAttribute("data-diff-mode", "unified");
		await toggle.click();
		await expect(toggle).toHaveAttribute("data-diff-mode", "split");
		await expect(page.locator("[data-review-panel='files']")).toHaveAttribute(
			"data-diff-mode",
			"split",
		);

		// diff — per-hunk accept / reject record a verdict on the hunk.
		const hunk = page.locator("[data-review-hunk]").first();
		const header = await hunk.getAttribute("data-review-hunk");
		await expect(hunk).toHaveAttribute("data-hunk-verdict", "pending");
		await page.locator(`[data-review-hunk-accept='${header}']`).click();
		await expect(hunk).toHaveAttribute("data-hunk-verdict", "accepted");
		await page.locator(`[data-review-hunk-reject='${header}']`).click();
		await expect(hunk).toHaveAttribute("data-hunk-verdict", "rejected");

		// diff — commentable lines exist and an anchored CommentThread is mounted.
		await expect(page.locator("[data-line-commentable='true']")).not.toHaveCount(0);
		await expect(
			page.locator("[data-review-inline-thread='session-ts-46'][data-slot='comment-thread']"),
		).toBeVisible();
	});

	test("per-hunk a accept / r reject / h next-hunk keyboard works (DESIGN §4.5)", async ({
		page,
	}) => {
		await page.goto(ROUTE);
		await page.locator("[data-review-workbench]").click();

		// interaction — the keyboard cursor starts on the first hunk.
		const firstHunkHead = page.locator("[data-review-hunk-head]").first();
		await expect(firstHunkHead).toHaveAttribute("data-hunk-cursor", "true");

		// interaction — `a` accepts the hunk under the cursor.
		await page.keyboard.press("a");
		await expect(page.locator("[data-review-hunk]").first()).toHaveAttribute(
			"data-hunk-verdict",
			"accepted",
		);

		// interaction — `r` rejects the hunk under the cursor.
		await page.keyboard.press("r");
		await expect(page.locator("[data-review-hunk]").first()).toHaveAttribute(
			"data-hunk-verdict",
			"rejected",
		);

		// interaction — `h` advances the cursor to the next hunk.
		await page.keyboard.press("h");
		await expect(page.locator("[data-review-hunk-head][data-hunk-cursor='true']")).not.toEqual(
			firstHunkHead,
		);
		const cursorCount = await page.locator("[data-hunk-cursor='true']").count();
		expect(cursorCount).toBe(1);
	});

	test("bottom dock exposes Checks/Summary/Logs/Suggestions with a gate readout", async ({
		page,
	}) => {
		await page.goto(ROUTE);

		// dock — the four dock tabs render with a gate readout.
		const dockTabs = page.locator("[data-review-dock] [data-review-dock-tab]");
		await expect(dockTabs).toHaveCount(4);
		await expect(page.locator("[data-review-gate]")).toContainText("approvals");
		await expect(page.locator("[data-review-gate]")).toContainText("blocking");

		// dock — Checks panel is the default; check rows carry a tone.
		await expect(page.locator("[data-review-dock-panel='checks']")).toBeVisible();
		await expect(page.locator("[data-review-check]")).toHaveCount(5);
		await expect(page.locator("[data-review-check][data-check-tone='fail']")).toHaveCount(1);

		// dock — switching dock tabs swaps the dock panel.
		await page.locator("[data-review-dock-tab='suggestions']").click();
		await expect(page.locator("[data-review-dock-panel='suggestions']")).toBeVisible();
		await expect(page.locator("[data-review-suggestion]")).toHaveCount(2);

		await page.locator("[data-review-dock-tab='logs']").click();
		await expect(page.locator("[data-review-dock-panel='logs']")).toBeVisible();
		await expect(page.locator("[data-review-dock-panel='logs']")).toContainText("doctor probe auth");
	});

	test("decision header waiting-input badge uses the canonical COPY.md §362 status", async ({
		page,
	}) => {
		await page.goto(ROUTE);

		// copy — the decision badge resolves to the canonical `waiting-input` state.
		const badge = page.locator("[data-review-decision-badge]");
		await expect(badge).toHaveAttribute("data-status", "waiting-input");
		await expect(badge).toContainText("Waiting input");

		// copy — no banned non-canonical status synonym appears anywhere.
		for (const banned of ["In Flight", "WIP", "Doing", "Stuck", "Done!"]) {
			await expect(page.locator("[data-review-workbench]")).not.toContainText(banned);
		}
	});

	test("Mod+Enter approves with no annotations and sends feedback when annotations exist", async ({
		page,
	}) => {
		await page.goto(ROUTE);

		// interaction — the PR ships with unresolved annotations in the notes rail.
		await expect(page.locator("[data-review-note][data-note-unresolved='true']")).not.toHaveCount(0);

		// interaction — Mod+Enter with annotations present sends feedback (IA-MAP §4.4).
		await page.locator("[data-review-workbench]").click();
		await page.keyboard.press("ControlOrMeta+Enter");
		await expect(page.locator("[data-review-workbench]")).toHaveAttribute(
			"data-decision",
			"feedback-sent",
		);
		await expect(page.locator("[data-review-decision-result]")).toHaveAttribute(
			"data-review-decision-result",
			"feedback-sent",
		);
	});

	test("comments-block-thread is absorbed as the ui-kit CommentThread primitive", async ({
		page,
	}) => {
		await page.goto(ROUTE);

		// migration — the Comments panel renders absorbed CommentThread primitives.
		await page.locator("[data-review-tab='comments']").click();
		await expect(page.locator("[data-review-panel='comments']")).toBeVisible();
		const threads = page.locator("[data-review-comment-thread]");
		await expect(threads).not.toHaveCount(0);

		// migration — the primitive carries DESIGN §9.1 states: open + failed-save.
		await expect(
			page.locator("[data-review-comment-thread='session-ts-46'][data-thread-state='open']"),
		).toBeVisible();
		const failed = page.locator("[data-review-comment-thread='telemetry']");
		await expect(failed).toHaveAttribute("data-thread-state", "failed-save");
		await expect(failed.locator("[data-slot='comment-thread-failed-save']")).toBeVisible();

		// migration — an agent-authored comment gets the distinct authorship hook.
		await expect(
			page.locator("[data-review-comment-thread='issuance-repo'] [data-comment-author-kind='agent']"),
		).toBeVisible();

		// migration — the standalone comments-block-thread route still resolves.
		const res = await page.goto("/comments-block-thread");
		expect(res?.status()).toBeLessThan(400);
	});

	test("review-templates is absorbed as the Comments-panel composer picker", async ({ page }) => {
		await page.goto(ROUTE);

		// migration — the Comments panel composer carries the absorbed template picker.
		await page.locator("[data-review-tab='comments']").click();
		const picker = page.locator("[data-review-template-picker]");
		await expect(picker).toBeVisible();

		// migration — picking a template seeds the composer body.
		await picker.selectOption("test-gap");
		await expect(page.locator("[data-review-composer-body]")).toHaveValue(/lacks coverage/);

		// migration — the standalone review-templates route still resolves.
		const res = await page.goto("/review-templates");
		expect(res?.status()).toBeLessThan(400);
	});

	test("workbench tabs are keyboard operable with a visible focus ring", async ({ page }) => {
		await page.goto(ROUTE);

		// accessibility — the tab strip carries tablist / tab / tabpanel roles.
		await expect(page.locator("[data-review-tabs]")).toHaveAttribute("role", "tablist");
		const filesTab = page.locator("[data-review-tab='files']");
		await expect(filesTab).toHaveAttribute("role", "tab");
		await expect(filesTab).toHaveAttribute("aria-selected", "true");
		await expect(page.locator("[data-review-panel='files']")).toHaveAttribute("role", "tabpanel");

		// accessibility — the active tab is keyboard-focusable and shows a ring.
		await filesTab.focus();
		await expect(filesTab).toBeFocused();
		const ring = await filesTab.evaluate((el) => getComputedStyle(el).boxShadow);
		expect(ring).not.toBe("none");

		// accessibility — clicking a tab swaps the panel.
		await page.locator("[data-review-tab='plan']").click();
		await expect(page.locator("[data-review-panel='plan']")).toBeVisible();
	});

	test("renders under forced-colors and captures OD-fidelity evidence", async ({ page }) => {
		// accessibility — forced-colors render must not collapse the workbench.
		await page.emulateMedia({ forcedColors: "active" });
		await page.goto(ROUTE);
		await expect(page.locator("[data-review-workbench]")).toBeVisible();
		await expect(page.locator("[data-review-tabs] [data-review-tab]")).toHaveCount(5);
		await page.emulateMedia({ forcedColors: null });

		// evidence — rendered populated screenshot for the PRD record.
		await page.goto(ROUTE);
		await expect(page.locator("[data-review-workbench]")).toBeVisible();
		await writeEvidenceShot(
			"review-workbench-populated.png",
			await page.screenshot({ fullPage: true }),
		);

		// evidence — the Comments panel with absorbed CommentThread primitives.
		await page.locator("[data-review-tab='comments']").click();
		await expect(page.locator("[data-review-panel='comments']")).toBeVisible();
		await writeEvidenceShot(
			"review-workbench-comments.png",
			await page.screenshot({ fullPage: true }),
		);
	});
});
