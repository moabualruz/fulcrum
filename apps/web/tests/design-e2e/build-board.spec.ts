import { expect, test } from "@playwright/test";

/**
 * Build · Board OD-fidelity spec — drives the production `/build-board` route
 * and asserts it matches OD `build-board.html` (`DESIGN.md §4.4` board card,
 * §4.9 status vocab, §4.11 mode row; `IA-MAP.md §2.3`; `COPY.md` Build empty
 * states). Grouped by the documented visual-PRD acceptance shape: layout /
 * data-states / interactions / copy / parity / accessibility.
 */

test.describe("build board — layout", () => {
	test("renders the OD toolbar, five-layout switcher, filter row, and grouped status columns", async ({ page }) => {
		await page.goto("/build-board");

		await expect(page.locator("[data-build-board]")).toBeVisible();
		await expect(page.locator("[data-build-board]")).toHaveAttribute("data-state", "populated");

		// Layout switcher tablist — five entries, Board active (OD `.layouts`).
		const switcher = page.locator("[data-build-board-layouts]");
		await expect(switcher).toHaveAttribute("role", "tablist");
		await expect(switcher.locator("[data-build-layout]")).toHaveCount(5);
		await expect(page.locator("[data-build-layout='board']")).toHaveAttribute("aria-current", "page");
		await expect(page.locator("[data-build-layout='list']")).toBeVisible();
		await expect(page.locator("[data-build-layout='timeline']")).toBeVisible();
		await expect(page.locator("[data-build-layout='calendar']")).toBeVisible();
		await expect(page.locator("[data-build-layout='graph']")).toBeVisible();

		// Group / Sort / Properties / Filter / New task controls (OD toolbar).
		await expect(page.locator("[data-build-board-group]")).toBeVisible();
		await expect(page.locator("[data-build-board-sort]")).toBeVisible();
		await expect(page.locator("[data-build-board-properties]")).toBeVisible();
		await expect(page.locator("[data-build-board-filter]")).toBeVisible();
		await expect(page.locator("[data-build-board-new-task]")).toContainText("New task");

		// Filter chip row + summary (OD `.filters`).
		await expect(page.locator("[data-build-filter-active]")).toHaveCount(2);
		await expect(page.locator("[data-build-filter]")).toHaveCount(4);
		await expect(page.locator("[data-build-board-summary]")).toContainText("8 tasks");

		// Five grouped status columns matching the canonical vocabulary (OD).
		const columns = page.locator("[data-build-column]");
		await expect(columns).toHaveCount(5);
		await expect(page.locator("[data-build-column='queued'] [data-build-column-header] [data-slot='status-badge']")).toContainText("Queued");
		await expect(page.locator("[data-build-column='running'] [data-build-column-header] [data-slot='status-badge']")).toContainText("Running");
		await expect(page.locator("[data-build-column='waiting-input'] [data-build-column-header] [data-slot='status-badge']")).toContainText("Waiting input");
		await expect(page.locator("[data-build-column='blocked'] [data-build-column-header] [data-slot='status-badge']")).toContainText("Blocked");
		await expect(page.locator("[data-build-column='completed'] [data-build-column-header] [data-slot='status-badge']")).toContainText("Completed");

		// Task cards — id, title, meta, labels, and a per-card mode row.
		const cards = page.locator("[data-build-task-card][data-task-key]");
		await expect(cards).toHaveCount(8);
		await expect(page.locator("[data-task-key='AUTH-42']")).toContainText("Add kid and rotate flag");
		await expect(page.locator("[data-task-key='AUTH-43']")).toContainText("run_8f29a4c");
		await expect(page.locator("[data-task-key='AUTH-44']")).toContainText("blocked on AUTH-43");
	});

	test("does not render the re-homed project-setup / integrations / billing / custom-field panels", async ({ page }) => {
		await page.goto("/build-board");

		// These panels were re-homed off the Build board (build.md disposition).
		await expect(page.locator("[data-project-setup-flow]")).toHaveCount(0);
		await expect(page.locator("[data-workspace-integrations]")).toHaveCount(0);
		await expect(page.locator("[data-api-token-panel]")).toHaveCount(0);
		await expect(page.locator("[data-webhook-panel]")).toHaveCount(0);
		await expect(page.locator("[data-integration-log]")).toHaveCount(0);
	});
});

test.describe("build board — data-states", () => {
	test("populated board renders cards; empty board renders the canonical empty state", async ({ page }) => {
		await page.goto("/build-board");

		await expect(page.locator("[data-build-board-scroll]")).toBeVisible();
		await expect(page.locator("[data-build-board-empty]")).toHaveCount(0);

		await page.locator("[data-build-board-empty-toggle]").click();

		await expect(page.locator("[data-build-board]")).toHaveAttribute("data-state", "empty");
		const empty = page.locator("[data-build-board-empty]");
		await expect(empty).toBeVisible();
		await expect(page.locator("[data-build-board-scroll]")).toHaveCount(0);
	});
});

test.describe("build board — interactions", () => {
	test("inline new-task row appears, validates required title, and cancels with Escape", async ({ page }) => {
		await page.goto("/build-board");

		const queuedColumn = page.locator("[data-build-column='queued']");
		const trigger = queuedColumn.locator("[data-build-board-new-task-trigger]");
		await expect(trigger).toBeVisible();
		await trigger.click();

		const row = queuedColumn.locator("[data-build-board-new-task-row]");
		await expect(row).toBeVisible();
		const input = row.locator("[data-build-board-new-task-input]");
		await expect(input).toBeFocused();

		await input.press("Enter");
		await expect(input).toHaveAttribute("aria-invalid", "true");
		await expect(row.locator("[data-build-board-new-task-error]")).toContainText("Title is required.");

		await input.fill("Persist refresh-token rotation");
		await input.press("Escape");
		await expect(row).toHaveCount(0);
		await expect(trigger).toBeVisible();
	});

	test("optimistic create renders pending ghost, surfaces inline error + Retry on simulated failure", async ({ page }) => {
		await page.goto("/build-board");

		const queuedColumn = page.locator("[data-build-column='queued']");
		await queuedColumn.locator("[data-build-board-new-task-trigger]").click();
		const input = queuedColumn.locator("[data-build-board-new-task-input]");
		await input.fill("Persist refresh-token rotation");
		await input.press("Enter");

		const successCard = queuedColumn.locator("[data-build-task-optimistic]");
		await expect(successCard).toHaveAttribute("data-pending", "true");
		await expect(successCard).toHaveCount(0, { timeout: 5_000 });

		await queuedColumn.locator("[data-build-board-new-task-trigger]").click();
		const failInput = queuedColumn.locator("[data-build-board-new-task-input]");
		await failInput.fill("force-fail token rotation");
		await failInput.press("Enter");

		const failedCard = queuedColumn.locator("[data-build-task-optimistic][data-failed='true']");
		await expect(failedCard).toHaveCount(1);
		await expect(failedCard.locator("[data-build-task-error]")).toContainText("HTTP 500");
		await expect(failedCard.locator("[data-build-task-error-trace]")).toContainText("tr_optimistic_5xx");
		await failedCard.locator("[data-build-task-undo]").click();
		await expect(failedCard).toHaveCount(0);
	});

	test("optimistic rollback escalates after 3 retries with expanded payload + troubleshooting link", async ({ page }) => {
		await page.goto("/build-board");

		const queuedColumn = page.locator("[data-build-column='queued']");
		await queuedColumn.locator("[data-build-board-new-task-trigger]").click();
		const input = queuedColumn.locator("[data-build-board-new-task-input]");
		await input.fill("force-fail rotation kid");
		await input.press("Enter");

		const card = queuedColumn.locator("[data-build-task-optimistic][data-failed='true']");
		await expect(card.locator("[data-build-task-error]")).toHaveAttribute("data-build-task-error-attempts", "1");

		await card.locator("[data-build-task-retry]").click();
		await expect(card.locator("[data-build-task-error]")).toHaveAttribute("data-build-task-error-attempts", "2", { timeout: 5_000 });
		await card.locator("[data-build-task-retry]").click();
		await expect(card.locator("[data-build-task-error]")).toHaveAttribute("data-build-task-error-escalated", "true", { timeout: 5_000 });

		const payload = card.locator("[data-build-task-error-payload]");
		await expect(payload).toBeVisible();
		await expect(payload).toContainText("attempt 3");
		await expect(card.locator("[data-build-task-error-troubleshooting]")).toHaveAttribute("href", /troubleshooting/);
		await card.locator("[data-build-task-undo]").click();
		await expect(card).toHaveCount(0);
	});

	test("renders inline validation, network, and unexpected error states with trace ids — never toasts", async ({ page }) => {
		await page.goto("/build-board");

		const errorStates = page.locator("[data-build-board-error-states]");
		await expect(errorStates).toBeVisible();
		await expect(page.locator("[data-slot='toast']")).toHaveCount(0);

		await errorStates.locator("[data-build-error-trigger-validation]").click();
		const fieldError = errorStates.locator("[data-build-error-field-error]");
		await expect(fieldError).toContainText("title: Title is required.");
		await expect(fieldError).toHaveAttribute("role", "alert");

		await errorStates.locator("[data-build-error-trigger-network]").click();
		const networkBanner = errorStates.locator("[data-build-error-network]");
		await expect(networkBanner).toHaveAttribute("data-tone", "error");
		await expect(networkBanner.locator("[data-slot='error-banner-trace']")).toContainText("tr_err_5xx");

		await errorStates.locator("[data-build-error-trigger-unexpected]").click();
		const unexpectedBanner = errorStates.locator("[data-build-error-unexpected]");
		await expect(unexpectedBanner.locator("[data-slot='error-banner-trace']")).toContainText("tr_err_unexpected");
		await expect(page.locator("[data-slot='toast']")).toHaveCount(0);
	});
});

test.describe("build board — copy", () => {
	test("empty board uses the COPY.md Build/board verbatim copy and bans error synonyms", async ({ page }) => {
		await page.goto("/build-board");
		await page.locator("[data-build-board-empty-toggle]").click();

		const empty = page.locator("[data-build-board-empty]");
		// COPY.md §2 Build/board: H2 verbatim.
		await expect(empty.locator("h2")).toHaveText("No tasks in this cycle.");
		// COPY.md §2 Build/board: names the c keybind + Plan materialization.
		await expect(empty).toContainText("Press c, or materialize an approved plan from Plan.");
		// Names the New task action + materialize-from-Plan action.
		await expect(empty.locator("[data-build-board-empty-add]")).toContainText("Add task");
		await expect(empty.locator("[data-build-board-empty-materialize]")).toHaveAttribute("href", "/plan-review");

		// COPY.md §3 hard bans — none of these phrases may render.
		const body = (await page.locator("[data-build-board]").textContent()) ?? "";
		expect(body).not.toContain("Something went wrong");
		expect(body).not.toContain("Oops!");
		expect(body).not.toContain("Please try again");
	});
});

test.describe("build board — parity", () => {
	test("the duplicate /boards route resolves and points at the one canonical Build board", async ({ page }) => {
		const response = await page.goto("/boards");
		expect(response?.status()).toBeLessThan(400);

		const pointer = page.locator("[data-boards-canonical-pointer]");
		await expect(pointer).toBeVisible();
		await expect(pointer.locator("[data-boards-canonical-link]")).toHaveAttribute("href", "/build-board");
	});

	test("404 / old-path resolution crawl — every Build layout route still resolves", async ({ page }) => {
		// Migration-PRD value-preservation: every pre-existing path the board
		// switcher and reconciliation touch must resolve, never 404.
		for (const path of ["/build-board", "/build-list", "/build-timeline", "/build-graph", "/boards"]) {
			const response = await page.goto(path);
			expect(response?.status(), `${path} must resolve, never 404`).toBeLessThan(400);
		}
	});
});

test.describe("build board — accessibility", () => {
	test("task cards carry the universal mode affordance row with all four modes", async ({ page }) => {
		await page.goto("/build-board");

		const card = page.locator("[data-task-key='AUTH-42']");
		// Universal mode-affordance hooks (DESIGN.md §4.11, mode-affordance-host).
		await expect(card).toHaveAttribute("data-mode-affordance", "step");
		await expect(card).toHaveAttribute("data-mode-step-kind", "task-card");
		await expect(card).toHaveAttribute("data-mode-step-id", "AUTH-42");

		const modeRow = card.locator("[data-slot='mode-row']");
		await expect(modeRow).toHaveAttribute("role", "toolbar");
		await expect(modeRow).toHaveAttribute("aria-label", "Step modes");
		await expect(modeRow).toHaveAttribute("data-density", "compact");
		// DESIGN.md §4.13 compact form — the canonical four modes ✋ ▶ 💬 ⊞.
		await expect(modeRow.locator("[data-slot='mode-row-option']")).toHaveCount(4);
		await expect(modeRow.locator("[data-mode='manual']")).toBeVisible();
		await expect(modeRow.locator("[data-mode='play']")).toBeVisible();
		await expect(modeRow.locator("[data-mode='discuss']")).toBeVisible();
		await expect(modeRow.locator("[data-mode='assist']")).toBeVisible();
	});

	test("the layout switcher and new-task control are keyboard reachable with a visible focus ring", async ({ page }) => {
		await page.goto("/build-board");

		const boardTab = page.locator("[data-build-layout='board']");
		await boardTab.focus();
		await expect(boardTab).toBeFocused();

		const newTask = page.locator("[data-build-board-new-task]");
		await newTask.focus();
		await expect(newTask).toBeFocused();
		// Activating New task via keyboard opens the inline create row.
		await newTask.press("Enter");
		await expect(page.locator("[data-build-column='queued'] [data-build-board-new-task-row]")).toBeVisible();
	});
});
