import { describe, expect, test } from "bun:test";
import { render } from "svelte/server";
import StatusBadgeRoot from "./status-badge.svelte";
import {
	BANNED_STATUS_SYNONYMS,
	CANONICAL_STATUS_VOCAB,
	statusLabel,
	type CanonicalStatus,
} from "./status-badge.exports.js";

describe("StatusBadge: COPY.md §6 status-label lock", () => {
	test("canonical 8-state vocab is exactly the COPY.md §6 closing line", () => {
		// COPY.md §6: "Canonical 8-state vocab: queued / running / waiting-input /
		// passing / failing / completed / cancelled / blocked." DESIGN.md §13
		// invariant 5 makes this the cross-surface (web/CLI/TUI) status invariant.
		expect([...CANONICAL_STATUS_VOCAB]).toEqual([
			"queued",
			"running",
			"waiting-input",
			"passing",
			"failing",
			"completed",
			"cancelled",
			"blocked",
		]);
	});

	test("banned status synonyms are exactly the COPY.md §6 ban-list", () => {
		// COPY.md §6: "Never In Flight, WIP, Doing, Stuck, Done!."
		expect([...BANNED_STATUS_SYNONYMS]).toEqual(["In Flight", "WIP", "Doing", "Stuck", "Done!"]);
	});

	test("no canonical state collides with a banned synonym", () => {
		for (const banned of BANNED_STATUS_SYNONYMS) {
			expect([...CANONICAL_STATUS_VOCAB]).not.toContain(banned as never);
		}
	});

	test("every canonical state renders its locked label, never a banned synonym", () => {
		const expected: Record<CanonicalStatus, string> = {
			queued: "Queued",
			running: "Running",
			"waiting-input": "Waiting input",
			passing: "Passing",
			failing: "Failing",
			completed: "Completed",
			cancelled: "Cancelled",
			blocked: "Blocked",
		};
		for (const status of CANONICAL_STATUS_VOCAB) {
			expect(statusLabel(status)).toBe(expected[status]);
			const { body } = render(StatusBadgeRoot, { props: { status } });
			expect(body).toContain('data-slot="status-badge"');
			expect(body).toContain(`data-status="${status}"`);
			expect(body).toContain(expected[status]);
			for (const banned of BANNED_STATUS_SYNONYMS) {
				expect(body).not.toContain(banned);
			}
		}
	});

	test("no rendered status label contains an em dash (COPY.md §1 rule 6)", () => {
		// Em dash is U+2014 — a literal hyphen "-" is allowed (Svelte SSR emits
		// `<!--[-->` block markers, and status labels themselves may hyphenate).
		const EM_DASH = "—";
		for (const status of CANONICAL_STATUS_VOCAB) {
			expect(statusLabel(status)).not.toContain(EM_DASH);
			const { body } = render(StatusBadgeRoot, { props: { status } });
			expect(body).not.toContain(EM_DASH);
		}
	});

	test("status-badge exposes role=status and an aria-label for assistive tech", () => {
		const { body } = render(StatusBadgeRoot, { props: { status: "running" } });
		expect(body).toContain('role="status"');
		expect(body).toContain('aria-label="Running"');
	});

	test("uses OKLCH-tokened utilities only: no raw hex/hsl in markup", () => {
		for (const status of CANONICAL_STATUS_VOCAB) {
			const { body } = render(StatusBadgeRoot, { props: { status } });
			expect(body).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
			expect(body).not.toMatch(/\bhsl\(/);
		}
	});
});
