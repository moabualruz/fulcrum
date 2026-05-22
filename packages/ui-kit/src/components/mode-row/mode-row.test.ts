import { describe, expect, test } from "bun:test";
import { render } from "svelte/server";
import ModeRowRoot from "./mode-row.svelte";
import { TIGHT_MODES, WORKFLOW_MODES, modeGlyph, modeLabel } from "./index.js";

/**
 * ModeRow: the universal per-Step mode affordance row.
 *
 * Rendered design proof for `prd-web-mode-affordance-system`: every assertion
 * pins the primitive to DESIGN.md §4.13: the canonical four modes, the OD
 * glyphs, the `role="toolbar" aria-label="Step modes"` semantics, per-action
 * titles, and the three density forms. A Step row that drops a mode hook is
 * caught by the `data-slot` assertions here.
 */
describe("ModeRow: universal Step mode affordance (DESIGN.md §4.13)", () => {
	test("renders the four canonical modes: Manual / Play / Discuss / AI Assist", () => {
		const { body } = render(ModeRowRoot, {});

		// §4.13: the long form renders all four buttons with labels.
		expect(body).toContain('data-slot="mode-row"');
		expect(body).toContain('data-mode="manual"');
		expect(body).toContain('data-mode="play"');
		expect(body).toContain('data-mode="discuss"');
		expect(body).toContain('data-mode="assist"');

		// Copy assertion: the locked mode labels (DESIGN.md §4.13, COPY.md).
		expect(body).toContain("Manual");
		expect(body).toContain("Play");
		expect(body).toContain("Discuss");
		expect(body).toContain("AI Assist");

		// §4.13 OD glyphs: ✋ ▶ 💬 ⊞.
		expect(body).toContain("✋");
		expect(body).toContain("▶");
		expect(body).toContain("💬");
		expect(body).toContain("⊞");
	});

	test("uses toolbar semantics: role=toolbar, aria-label, per-action titles", () => {
		const { body } = render(ModeRowRoot, {});

		// §4.13: every form uses `role="toolbar" aria-label="Step modes"`.
		expect(body).toContain('role="toolbar"');
		expect(body).toContain('aria-label="Step modes"');

		// Interaction assertion: every mode button carries a `title`/tooltip.
		expect(body).toContain('title="Manual: work this step yourself"');
		expect(body).toContain('title="▶ Play: hand off to an AI agent"');
		expect(body).toContain('title="💬 Discuss: open the comment thread"');
		expect(body).toContain(
			'title="⊞ AI Assist: open the AI Assist drawer scoped to this step"',
		);

		// Toolbar buttons expose pressed state, not radio state.
		expect(body).toContain("aria-pressed");
		expect(body).not.toContain('role="radio"');
	});

	test("marks the selected mode pressed via aria-pressed + data-active", () => {
		const { body } = render(ModeRowRoot, { props: { value: "play" } });

		expect(body).toContain('data-value="play"');
		// The active Play button carries `aria-pressed="true"` + `data-active="true"`;
		// attributes render in source order (aria-pressed … data-mode … data-active).
		expect(body).toMatch(
			/aria-pressed="true"[^>]*data-mode="play"[^>]*data-active="true"/,
		);
		// The unselected Manual button stays `aria-pressed="false"` with no data-active.
		expect(body).toMatch(/aria-pressed="false"[^>]*data-mode="manual"/);
	});

	test("compact density renders icon-only 24x24 buttons", () => {
		const { body } = render(ModeRowRoot, { props: { density: "compact" } });

		// §4.13 compact: icon-only, 24x24 min target size.
		expect(body).toContain('data-density="compact"');
		expect(body).toContain("min-h-6");
		expect(body).toContain("min-w-6");
		// Glyphs still present; labels suppressed in compact form.
		expect(body).toContain("✋");
		expect(body).toContain("⊞");
	});

	test("tight density renders Suggest / Discuss only", () => {
		const { body } = render(ModeRowRoot, { props: { density: "tight" } });

		// §4.13 tight: `▶ Suggest / 💬 Discuss` only: Manual + Assist dropped.
		expect(body).toContain('data-density="tight"');
		expect(body).toContain('data-mode="play"');
		expect(body).toContain('data-mode="discuss"');
		expect(body).toContain("Suggest");
		expect(body).not.toContain('data-mode="manual"');
		expect(body).not.toContain('data-mode="assist"');
	});

	test("every mode button is keyboard-focusable with a visible focus ring", () => {
		const { body } = render(ModeRowRoot, {});

		// Native <button> elements are keyboard-reachable; focus-visible ring.
		expect(body).toContain("<button");
		expect(body).toContain("focus-visible:ring-2");
	});

	test("WORKFLOW_MODES is the canonical four; TIGHT_MODES is the tight subset", () => {
		expect(WORKFLOW_MODES).toEqual(["manual", "play", "discuss", "assist"]);
		expect(TIGHT_MODES).toEqual(["play", "discuss"]);
	});

	test("modeGlyph / modeLabel resolve the OD vocabulary for sibling surfaces", () => {
		expect(modeGlyph("manual")).toBe("✋");
		expect(modeGlyph("play")).toBe("▶");
		expect(modeGlyph("discuss")).toBe("💬");
		expect(modeGlyph("assist")).toBe("⊞");
		expect(modeLabel("assist")).toBe("AI Assist");
		// `ai-assist` is a back-compat alias of `assist`.
		expect(modeGlyph("ai-assist")).toBe("⊞");
		expect(modeLabel("ai-assist")).toBe("AI Assist");
	});
});
