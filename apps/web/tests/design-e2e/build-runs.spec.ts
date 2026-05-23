import { expect, test } from "@playwright/test";

/**
 * Design-e2e fidelity coverage for the OD `build-runs.html` surface — the Build
 * runs feed plus the live session pane (DESIGN.md §9 run feed, §8 Live Session
 * Pane, §4.5 tool-call cards, §4.6 inline diff, §4.10 trace badge).
 *
 * The route renders the two-column `runs-shell`: a scrollable runs feed on the
 * left and the selected run's live session pane on the right. The six legacy
 * `run-*` fixture routes (cancel/stop, retry policy, retry prompt, fork, rate
 * limits, cost strip) are absorbed as inline states of this one pane.
 */

test.describe("build runs feed + live session pane", () => {
	test("renders the OD runs feed: head, Live toggle, and run rows", async ({ page }) => {
		await page.goto("/build-runs");

		await expect(page.locator("[data-build-runs-shell]")).toBeVisible();
		await expect(page.locator("[data-runs-feed-head]")).toContainText("Recent runs");
		await expect(page.locator("[data-runs-feed-head]")).toContainText("12");
		await expect(page.locator("[data-runs-live-toggle]")).toBeVisible();

		const rows = page.locator("[data-run-row]");
		await expect(rows).toHaveCount(8);

		// First row carries status badge, title, age, mono ids, sparkline, mode row.
		// The ui-kit `RunFeedItem` primitive is the canonical row identity block.
		const first = rows.first();
		await expect(first.locator("[data-slot='run-feed-item']")).toBeVisible();
		await expect(first.locator("[data-slot='status-badge']")).toBeVisible();
		await expect(first.locator("[data-slot='run-feed-item-title']")).toContainText(
			"Persist issuance row per kid",
		);
		await expect(first.locator("[data-run-row-age]")).toHaveText("3m");
		await expect(first.locator("[data-run-row-id]")).toHaveText("run_8f29a4c");
		await expect(first.locator("[data-run-row-task]")).toHaveText("AUTH-43");
		await expect(first.locator("[data-run-row-agent]")).toHaveText("opus-4.7");
		await expect(first.locator("[data-run-sparkline] [data-spark-bar]")).toHaveCount(7);
		await expect(first.locator("[data-slot='mode-row']")).toBeVisible();
	});

	test("Live toggle flips the feed's streaming state", async ({ page }) => {
		await page.goto("/build-runs");

		const toggle = page.locator("[data-runs-live-toggle]");
		await expect(toggle).toHaveAttribute("aria-pressed", "true");
		await toggle.click();
		await expect(toggle).toHaveAttribute("aria-pressed", "false");
		await expect(page.locator("[data-runs-feed]")).toHaveAttribute("data-live", "false");
	});

	test("run-row selection opens the live session pane without losing feed scroll", async ({
		page,
	}) => {
		await page.goto("/build-runs");

		// The running run is selected by default.
		await expect(page.locator("[data-run-row][aria-current='true']")).toHaveCount(
			1,
		);
		await expect(page.locator("[data-live-session-pane]")).toContainText(
			"Persist issuance row per kid",
		);

		const feedScrollBefore = await page
			.locator("[data-runs-feed]")
			.evaluate((el) => el.scrollTop);

		// Select the failed run — pane swaps, feed keeps its scroll position.
		await page.locator("[data-run-row][data-run-id='run_56e3d12']").click();
		await expect(
			page.locator("[data-run-row][data-run-id='run_56e3d12']"),
		).toHaveAttribute("aria-current", "true");
		await expect(page.locator("[data-live-session-pane]")).toContainText(
			"Dedupe trace-id propagation",
		);

		const feedScrollAfter = await page
			.locator("[data-runs-feed]")
			.evaluate((el) => el.scrollTop);
		expect(feedScrollAfter).toBe(feedScrollBefore);
	});

	test("live session pane renders list / plan strip / transcript / workspace dock", async ({
		page,
	}) => {
		await page.goto("/build-runs");

		await expect(page.locator("[data-live-session-pane]")).toBeVisible();
		// Sticky head with status, title, trace badge, pause/stop, mode row.
		await expect(page.locator("[data-session-head] [data-slot='status-badge']")).toBeVisible();
		await expect(page.locator("[data-session-head]")).toContainText(
			"Persist issuance row per kid",
		);
		await expect(page.locator("[data-session-pause]")).toContainText("Pause");
		await expect(page.locator("[data-session-stop]")).toContainText("Stop");

		// Sticky mono strip: run id, agent, policy, tokens, spend, started, step.
		const strip = page.locator("[data-session-strip]");
		await expect(strip).toContainText("run_8f29a4c");
		await expect(strip).toContainText("opus-4.7");
		await expect(strip).toContainText("ask-on-write");
		await expect(strip).toContainText("$0.43");
		await expect(strip).toContainText("3 / 8");

		// Sticky plan strip sits at the top of the transcript (DESIGN.md §8).
		await expect(page.locator("[data-session-plan-strip]")).toBeVisible();

		// Workspace dock with the five DESIGN.md §8 tabs.
		const dockTabs = page.locator("[data-workspace-dock] [data-dock-tab]");
		await expect(dockTabs).toHaveText(["Shell", "Files", "Browser", "Plan", "Cost"]);
	});

	test("transcript renders tool-call cards with expand and inline file diff", async ({
		page,
	}) => {
		await page.goto("/build-runs");

		const cards = page.locator("[data-tool-call-card]");
		await expect(cards.first()).toBeVisible();
		// Collapsed read_file card expands to reveal its args block.
		const readCard = page.locator("[data-tool-call-card='read_file']");
		await expect(readCard).toHaveAttribute("data-open", "false");
		await readCard.locator("[data-tool-call-expand]").click();
		await expect(readCard).toHaveAttribute("data-open", "true");
		await expect(readCard.locator("[data-tool-call-body]")).toBeVisible();

		// edit_file card carries an inline diff with add/del lines (DESIGN.md §4.6).
		const editCard = page.locator("[data-tool-call-card='edit_file']").first();
		await expect(editCard.locator("[data-inline-diff]")).toBeVisible();
		await expect(editCard.locator("[data-diff-line='add']").first()).toBeVisible();
		await expect(editCard.locator("[data-diff-line='del']").first()).toBeVisible();
		// Per-hunk accept/reject (DESIGN.md §4.5 a/r keyboard, §4.6 per-hunk).
		await expect(editCard.locator("[data-diff-accept]")).toBeVisible();
		await expect(editCard.locator("[data-diff-reject]")).toBeVisible();
	});

	test("inline permission prompt offers one button per option, never modal", async ({
		page,
	}) => {
		await page.goto("/build-runs");

		const prompt = page.locator("[data-permission-prompt]");
		await expect(prompt).toBeVisible();
		await expect(prompt).toContainText("requires approval");
		// One button per option — Deny / Allow once / Always allow — and no modal.
		await expect(prompt.locator("[data-permission-option]")).toHaveCount(3);
		await expect(prompt.locator("[data-permission-option='deny']")).toContainText("Deny");
		await expect(prompt.locator("[data-permission-option='allow-once']")).toContainText(
			"Allow once",
		);
		await expect(prompt.locator("[data-permission-option='allow-always']")).toContainText(
			"Always allow",
		);
		await expect(page.locator("[role='dialog']")).toHaveCount(0);

		// Resolving the prompt clears it inline.
		await prompt.locator("[data-permission-option='allow-once']").click();
		await expect(page.locator("[data-permission-prompt]")).toHaveCount(0);
	});

	test("absorbs the six run-* fixture states inline: pause/stop, retry, fork, rate-limits, cost", async ({
		page,
	}) => {
		await page.goto("/build-runs");

		// Cost strip is the mono session strip's spend segment.
		await expect(page.locator("[data-session-strip]")).toContainText("$0.43");

		// Stop opens the abort modal (irreversible) with a reason dropdown.
		await page.locator("[data-session-stop]").click();
		const abort = page.locator("[data-abort-modal]");
		await expect(abort).toBeVisible();
		await expect(abort.locator("[data-abort-reason]")).toBeVisible();
		await expect(abort.locator("[data-abort-reason] option")).toHaveText([
			"user-cancel",
			"dangerous-output",
			"wrong-context",
			"cost-cap",
		]);
		await abort.locator("[data-abort-cancel]").click();
		await expect(page.locator("[data-abort-modal]")).toHaveCount(0);

		// Pause shows the paused queue indicator with queued prompt count.
		await page.locator("[data-session-pause]").click();
		await expect(page.locator("[data-pause-queue]")).toBeVisible();
		await expect(page.locator("[data-pause-queue]")).toContainText("queued");

		// Retry policy + retry prompt + fork are inline session controls.
		await expect(page.locator("[data-run-retry-policy]")).toBeVisible();
		await expect(page.locator("[data-run-retry-prompt]")).toBeVisible();
		await expect(page.locator("[data-run-fork]")).toBeVisible();

		// Rate-limit notice is an inline session state.
		await expect(page.locator("[data-run-rate-limits]")).toBeVisible();
	});

	test("checkpoint timeline renders below the active tool-call state", async ({ page }) => {
		await page.goto("/build-runs");

		const timeline = page.locator("[data-checkpoint-timeline]");
		await expect(timeline).toBeVisible();
		const checkpoints = timeline.locator("[data-checkpoint-row]");
		await expect(checkpoints.first()).toBeVisible();
		// Newest checkpoint uses inline Resume from checkpoint.
		await expect(timeline.locator("[data-checkpoint-resume]")).toContainText(
			"Resume from checkpoint",
		);
	});

	test("trace badge follows DESIGN.md §4.10", async ({ page }) => {
		await page.goto("/build-runs");

		const trace = page.locator("[data-session-head] [data-slot='trace-chip']");
		await expect(trace).toBeVisible();
		// §4.10: `trace:` prefix + 8-char hex prefix of the trace id + ellipsis.
		await expect(trace).toContainText("trace:");
		await expect(trace).toContainText("tr_8f29a…");
		await expect(trace).toHaveAttribute("data-trace-id", "tr_8f29a4c1b3e0d5f7");
	});

	test("empty state matches COPY.md Build runs feed template", async ({ page }) => {
		await page.goto("/build-runs?state=empty");

		const empty = page.locator("[data-runs-empty] [data-slot='empty-state']");
		await expect(empty).toBeVisible();
		await expect(empty).toContainText("No runs yet in this project.");
		await expect(empty).toContainText("Dispatch first run");
		await expect(empty).toContainText("Or press ▶ Play on any task.");
		// No live session pane and no run rows in the empty state.
		await expect(page.locator("[data-run-row]")).toHaveCount(0);
	});

	test("keeps the runs surface usable on mobile without horizontal page overflow", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/build-runs");

		await expect(page.locator("[data-build-runs-shell]")).toBeVisible();
		const overflow = await page
			.locator("[data-build-runs-shell]")
			.evaluate((element) => element.scrollWidth - element.clientWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
