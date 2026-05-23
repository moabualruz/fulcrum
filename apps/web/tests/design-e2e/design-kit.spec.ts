import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function openDesignKit(page: Page): Promise<void> {
	await page.goto("/design-kit");
	await expect(page.locator("[data-design-kit-ready='true']")).toBeVisible();
}

test.describe("ui-kit form primitives reference", () => {
	test("label exposes required and optional treatments without breaking access", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='label']");
		await expect(section).toBeVisible();
		const required = section.locator("[data-slot='label'][data-required='true']");
		const optional = section.locator("[data-slot='label'][data-optional='true']");
		const plain = section
			.locator("[data-slot='label']")
			.filter({ hasNotText: "(optional)" })
			.filter({ hasText: "Display" });
		await expect(required).toBeVisible();
		await expect(required.locator("span.sr-only")).toContainText("required");
		await expect(optional).toBeVisible();
		await expect(optional).toContainText("(optional)");
		await expect(plain).toBeVisible();
	});

	test("checkbox toggles, exposes indeterminate state, and disables cleanly", async ({ page }) => {
		await openDesignKit(page);
		const checkboxes = page.locator("[data-slot='checkbox']");
		await expect(checkboxes).toHaveCount(4);

		const first = checkboxes.nth(0);
		await expect(first).toHaveAttribute("data-state", "unchecked");
		await first.click();
		await expect(first).toHaveAttribute("data-state", "checked");

		const indeterminate = checkboxes.nth(2);
		await expect(indeterminate).toHaveAttribute("data-state", "indeterminate");

		const disabled = checkboxes.nth(3);
		await expect(disabled).toBeDisabled();
	});

	test("radio group selects exclusive options and updates the live indicator", async ({ page }) => {
		await openDesignKit(page);
		const group = page.locator("[data-design-kit-radio-group]");
		await expect(group).toHaveAttribute("role", "radiogroup");
		const items = group.locator("[data-slot='radio-group-item']");
		await expect(items).toHaveCount(3);
		await expect(items.nth(0)).toHaveAttribute("data-state", "checked");
		await items.nth(1).click();
		await expect(items.nth(0)).toHaveAttribute("data-state", "unchecked");
		await expect(items.nth(1)).toHaveAttribute("data-state", "checked");
		await expect(page.locator("[data-design-kit-radio-value]")).toContainText("weekly");
	});

	test("badge renders six tonal variants and two extra sizes", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='badge']");
		const badges = section.locator("[data-slot='badge']");
		await expect(badges).toHaveCount(8);
		await expect(section.locator("[data-slot='badge'][data-variant='accent']")).toHaveCount(1);
		await expect(section.locator("[data-slot='badge'][data-variant='outline']")).toHaveCount(1);
		await expect(section.locator("[data-slot='badge'][data-size='sm']")).toBeVisible();
		await expect(section.locator("[data-slot='badge'][data-size='lg']")).toBeVisible();
	});

	test("status-badge covers the full workflow vocabulary with ARIA + glyphs", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='status-badge']");
		const badges = section.locator("[data-slot='status-badge']");
		await expect(badges).toHaveCount(9);
		const statuses = [
			"queued",
			"running",
			"waiting-input",
			"paused",
			"completed",
			"failed",
			"blocked",
			"cancelled",
			"scheduled",
		];
		for (const status of statuses) {
			const badge = section.locator(`[data-slot='status-badge'][data-status='${status}']`);
			await expect(badge).toBeVisible();
			await expect(badge).toHaveAttribute("role", "status");
			await expect(badge.locator(`[data-status-glyph='${status}']`)).toBeVisible();
		}
	});

	test("avatar exposes sized fallbacks and renders fallback for missing image", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='avatar']");
		const avatars = section.locator("[data-slot='avatar']");
		await expect(avatars).toHaveCount(6);
		await expect(section.locator("[data-slot='avatar'][data-size='xs']")).toHaveCount(1);
		await expect(section.locator("[data-slot='avatar'][data-size='md']")).toHaveCount(2);
		await expect(section.locator("[data-slot='avatar-fallback']").nth(0)).toBeVisible();
	});

	test("chip removes itself when the remove control fires", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='chip']");
		await expect(section.locator("[data-slot='chip']")).toHaveCount(6);
		const removable = section.locator("[data-slot='chip'][data-removable='true']");
		await expect(removable).toBeVisible();
		await removable.locator("[data-slot='chip-remove']").click();
		await expect(removable).toHaveCount(0);
		await expect(section.locator("[data-design-kit-chip-removed]")).toBeVisible();
	});

	test("kbd renders monospace key hints", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='kbd']");
		await expect(section.locator("[data-slot='kbd']")).toHaveCount(5);
		await expect(section).toContainText("⌘");
	});

	test("progress updates aria-valuenow and increments via the +10 control", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='progress']");
		const progress = section.locator("[data-design-kit-progress]");
		await expect(progress).toHaveAttribute("aria-valuenow", "42");
		await section.locator("[data-design-kit-progress-step]").click();
		await expect(progress).toHaveAttribute("aria-valuenow", "52");
		await expect(section.locator("[data-design-kit-progress-value]")).toContainText("52%");
	});

	test("skeleton renders text/rect/circle shapes with role=status", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='skeleton']");
		await expect(section.locator("[data-slot='skeleton'][data-shape='text']")).toBeVisible();
		await expect(section.locator("[data-slot='skeleton'][data-shape='rect']")).toBeVisible();
		await expect(section.locator("[data-slot='skeleton'][data-shape='circle']")).toBeVisible();
		await expect(section.locator("[data-slot='skeleton-line']")).toHaveCount(3);
	});

	test("select opens, selects an option, and reflects the value", async ({ page }) => {
		await openDesignKit(page);
		const trigger = page.locator("[data-design-kit-select-trigger]");
		await expect(trigger).toBeVisible();
		await trigger.click();
		const items = page.locator("[data-slot='select-item']");
		await expect(items).toHaveCount(4);
		await items.filter({ hasText: "P1" }).click();
		await expect(trigger).toContainText("P1");
		await expect(page.locator("[data-design-kit-select-value]")).toContainText("p1");
	});

	test("alert renders five tones with role and glyph", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='alert']");
		await expect(section.locator("[data-slot='alert']")).toHaveCount(5);
		await expect(section.locator("[data-slot='alert'][data-tone='warning']")).toHaveAttribute(
			"role",
			"alert",
		);
		await expect(section.locator("[data-slot='alert'][data-tone='info']")).toHaveAttribute(
			"role",
			"status",
		);
		await expect(section.locator("[data-slot='alert-icon']")).toHaveCount(5);
	});

	test("banner can be dismissed and announces the dismissed state", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='banner']");
		const banner = section.locator("[data-slot='banner']");
		await expect(banner).toBeVisible();
		await expect(banner).toHaveAttribute("role", "alert");
		await banner.locator("[data-slot='banner-dismiss']").click();
		await expect(banner).toHaveCount(0);
		await expect(section.locator("[data-design-kit-banner-dismissed]")).toBeVisible();
	});

	test("empty-state exposes title, description, icon, and an action slot", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='empty-state']");
		const root = section.locator("[data-slot='empty-state']");
		await expect(root).toBeVisible();
		await expect(root).toHaveAttribute("role", "status");
		await expect(root.locator("[data-slot='empty-state-title']")).toContainText("No tasks yet");
		await expect(root.locator("[data-slot='empty-state-icon']")).toBeVisible();
		await expect(section.locator("[data-design-kit-empty-action]")).toBeVisible();
	});

	test("toast publishes into the region with correct tone and dismiss control", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='toast']");
		await section.locator("[data-design-kit-toast-publish='success']").click();
		await section.locator("[data-design-kit-toast-publish='error']").click();
		const region = page.locator("[data-slot='toast-region']");
		await expect(region).toBeVisible();
		await expect(region.locator("[data-slot='toast']")).toHaveCount(2);
		await expect(region.locator("[data-slot='toast'][data-tone='success']")).toBeVisible();
		await expect(region.locator("[data-slot='toast'][data-tone='error']")).toBeVisible();
		await expect(
			region.locator("[data-slot='toast'][data-tone='error'] [data-slot='toast-dismiss']"),
		).toHaveAttribute("aria-label", "Dismiss notification");
		await expect(section.locator("[data-design-kit-toast-count]")).toContainText("Active: 2");
	});

	test("textarea reflects typed length and auto-resizes", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='textarea']");
		const textarea = section.locator("[data-design-kit-textarea]");
		await expect(textarea).toHaveAttribute("data-auto-resize", "true");
		await textarea.fill("Hello fulcrum");
		await expect(section.locator("[data-design-kit-textarea-length]")).toContainText("Length: 13");
	});

	test("switch toggles the bound state via click", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='switch']");
		const toggle = section.locator("[data-slot='switch']");
		await expect(toggle).toHaveAttribute("data-state", "checked");
		await toggle.click();
		await expect(toggle).toHaveAttribute("data-state", "unchecked");
		await expect(section.locator("[data-design-kit-switch-state]")).toContainText("false");
	});

	test("form-field renders label, description, error, and toggles aria-invalid", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='form-field']");
		const fields = section.locator("[data-slot='form-field']");
		await expect(fields).toHaveCount(2);
		await expect(fields.nth(0)).toHaveAttribute("data-invalid", "true");
		await expect(fields.nth(0).locator("[data-slot='field-error']")).toContainText(
			"Title is required.",
		);
		const input = section.locator("[data-design-kit-form-input]");
		await input.fill("Plan refactor");
		await expect(fields.nth(0)).not.toHaveAttribute("data-invalid", "true");
		await expect(fields.nth(0).locator("[data-slot='form-field-description']")).toBeVisible();
		await expect(fields.nth(1).locator("[data-slot='label'][data-optional='true']")).toBeVisible();
	});

	test("popover opens on trigger click and reports state", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='popover']");
		await section.locator("[data-design-kit-popover-trigger]").click();
		await expect(page.locator("[data-design-kit-popover-content]")).toBeVisible();
		await expect(section.locator("[data-design-kit-popover-state]")).toContainText("Open: true");
	});

	test("context menu shows item list on right click", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='context-menu']");
		await section.locator("[data-design-kit-context-trigger]").click({ button: "right" });
		await expect(page.locator("[data-design-kit-context-content]")).toBeVisible();
		await expect(page.locator("[data-design-kit-context-item='rename']")).toBeVisible();
		await expect(page.locator("[data-design-kit-context-item='delete']")).toHaveAttribute(
			"data-tone",
			"destructive",
		);
	});

	test("alert dialog opens and confirms a destructive action", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='alert-dialog']");
		await section.locator("[data-design-kit-alert-trigger]").click();
		const content = page.locator("[data-design-kit-alert-content]");
		await expect(content).toBeVisible();
		await content.locator("[data-design-kit-alert-confirm]").click();
		await expect(section.locator("[data-design-kit-alert-state]")).toContainText("confirmed");
	});

	test("skill conflict dialog exposes recommendation, alt version, warning ack, and skip choices", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='skill-conflict-dialog']");
		await section.locator("[data-design-kit-skill-conflict-trigger]").click();
		const content = page.locator("[data-design-kit-skill-conflict-content]");
		await expect(content).toBeVisible();
		await expect(content).toContainText("formatter v1");
		await expect(content).toContainText("Recommended");
		await expect(content.locator("[data-design-kit-skill-conflict-alt]")).toBeVisible();
		await content.locator("[data-design-kit-skill-conflict-force-ack]").click();
		await content.locator("[data-design-kit-skill-conflict-confirm-alt]").click();
		await expect(section.locator("[data-design-kit-skill-conflict-state]")).toContainText("alt:v1.latest");
	});

	test("command palette opens and exposes searchable items", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='command-palette']");
		await section.locator("[data-design-kit-palette-open]").click();
		await expect(page.locator("[data-design-kit-palette-input]")).toBeVisible();
		await expect(page.locator("[data-slot='command-palette-item']")).toHaveCount(3);
		await expect(page.getByText("Dispatch run")).toBeVisible();
	});

	test("tabs switch active panel via trigger click", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='tabs']");
		await expect(section.locator("[data-design-kit-tab='overview']")).toHaveAttribute(
			"data-state",
			"active",
		);
		await section.locator("[data-design-kit-tab='runs']").click();
		await expect(section.locator("[data-design-kit-tab='runs']")).toHaveAttribute(
			"data-state",
			"active",
		);
		await expect(section.locator("[data-design-kit-tab-panel='runs']")).toBeVisible();
	});

	test("breadcrumb marks the final crumb as current with aria-current", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='breadcrumb']");
		const items = section.locator("[data-slot='breadcrumb-item']");
		await expect(items).toHaveCount(3);
		await expect(items.last()).toHaveAttribute("data-current", "true");
		await expect(items.last().getByText("Tasks")).toHaveAttribute("aria-current", "page");
	});

	test("pagination advances pages via next button", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='pagination']");
		await expect(section.locator("[data-design-kit-pagination-value]")).toContainText(
			"Current page: 2",
		);
		await section.locator("[data-slot='pagination-next']").click();
		await expect(section.locator("[data-design-kit-pagination-value]")).toContainText(
			"Current page: 3",
		);
	});

	test("stepper marks complete, current, and upcoming statuses", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='stepper']");
		const steps = section.locator("[data-slot='stepper-step']");
		await expect(steps).toHaveCount(3);
		await expect(steps.nth(0)).toHaveAttribute("data-status", "complete");
		await expect(steps.nth(1)).toHaveAttribute("data-status", "current");
		await expect(steps.nth(2)).toHaveAttribute("data-status", "upcoming");
	});

	test("data-table sorts on header click and reports new sort", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='data-table']");
		await expect(section.locator("[data-design-kit-table-sort]")).toContainText("key asc");
		await section.locator("[data-slot='data-table-sort-trigger'][data-field='priority']").click();
		await expect(section.locator("[data-design-kit-table-sort]")).toContainText("priority asc");
		await expect(
			section.locator("[data-slot='data-table-header'][data-field='priority']"),
		).toHaveAttribute("aria-sort", "ascending");
		await section.locator("[data-slot='data-table-sort-trigger'][data-field='priority']").click();
		await expect(section.locator("[data-design-kit-table-sort]")).toContainText("priority desc");
	});

	test("data-list renders inline label/value pairs", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='data-list']");
		await expect(section.locator("[data-slot='data-list-label']")).toHaveCount(3);
		await expect(section.locator("[data-slot='data-list-value']")).toHaveCount(3);
		await expect(section.locator("[data-slot='data-list']")).toHaveAttribute(
			"data-variant",
			"inline",
		);
	});

	test("tree-view expands a branch and selects a leaf", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='tree-view']");
		await section.locator("[data-slot='tree-view-toggle'][data-id='apps']").click();
		await expect(section.locator("[data-slot='tree-view-item'][data-id='apps-cli']")).toBeVisible();
		await section.locator("[data-slot='tree-view-label'][data-id='apps-cli']").click();
		await expect(
			section.locator("[data-slot='tree-view-item'][data-id='apps-cli']"),
		).toHaveAttribute("data-selected", "true");
		await expect(section.locator("[data-design-kit-tree-selection]")).toContainText("apps-cli");
	});

	test("stat renders three trend variants with semantic glyphs", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='stat']");
		await expect(section.locator("[data-slot='stat']")).toHaveCount(3);
		await expect(section.locator("[data-slot='stat'][data-trend='up']")).toBeVisible();
		await expect(section.locator("[data-slot='stat'][data-trend='down']")).toBeVisible();
		await expect(section.locator("[data-slot='stat'][data-trend='flat']")).toBeVisible();
	});

	test("mode-row toggles the active workflow mode", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='mode-row']");
		const row = section.locator("[data-slot='mode-row']");
		await expect(row).toHaveAttribute("data-value", "play");
		await row.locator("[data-slot='mode-row-option'][data-mode='ai-assist']").click();
		await expect(row).toHaveAttribute("data-value", "ai-assist");
		await expect(section.locator("[data-design-kit-mode-active]")).toContainText("ai-assist");
	});

	test("trace-chip truncates and exposes a copy control", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='trace-chip']");
		const chips = section.locator("[data-slot='trace-chip']");
		await expect(chips).toHaveCount(2);
		await expect(chips.first()).toContainText("…");
		await expect(chips.first().locator("[data-slot='trace-chip-copy']")).toBeVisible();
		await expect(chips.last().locator("[data-slot='trace-chip-copy']")).toHaveCount(0);
	});

	test("run-feed-item renders task, agent, status, and timing metadata", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='run-feed-item']");
		const items = section.locator("[data-slot='run-feed-item']");
		await expect(items).toHaveCount(3);
		await expect(items.nth(0)).toHaveAttribute("data-status", "running");
		await expect(items.nth(0).locator("[data-slot='run-feed-item-elapsed']")).toContainText("2m");
		await expect(items.nth(1).locator("[data-slot='status-badge']")).toHaveAttribute(
			"data-status",
			"waiting-input",
		);
	});

	test("task-row selects via checkbox and reports state", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='task-row']");
		const rows = section.locator("[data-slot='task-row']");
		await expect(rows).toHaveCount(2);
		await rows.nth(0).locator("[data-slot='task-row-select']").check();
		await expect(rows.nth(0)).toHaveAttribute("data-selected", "true");
		await expect(section.locator("[data-design-kit-task-selected]")).toContainText(
			"Selected first row: true",
		);
	});

	test("agent-identity-card renders provider, model, caps, and token budget", async ({ page }) => {
		await openDesignKit(page);
		const section = page.locator("[data-design-kit-section='agent-identity-card']");
		const cards = section.locator("[data-slot='agent-identity-card']");
		await expect(cards).toHaveCount(2);
		await expect(cards.first().locator("[data-slot='agent-identity-card-name']")).toContainText(
			"Sonnet",
		);
		await expect(cards.first().locator("[data-slot='agent-identity-card-meta']")).toContainText(
			"claude-sonnet-4-6",
		);
		await expect(cards.first().locator("[data-slot='agent-identity-card-cap']")).toHaveCount(3);
		await expect(cards.first().locator("[data-slot='agent-identity-card-tokens']")).toContainText(
			"87,423",
		);
	});
});
