import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
	MODE_AFFORDANCE_LABELS,
	MODE_AFFORDANCE_TOOLBAR_LABEL,
	createStepModeRow,
	densityForStepKind,
	modeAffordanceHooks,
	openAssistForStep,
	type ModeAssistDetail,
	type ModeStepScope,
} from "./mode-affordance-host.ts";

/**
 * In the browser the host dispatches on `window`; the bun test env has no
 * `window`. Install a minimal `EventTarget`-backed `window` so the event
 * routing under test exercises the same path as production.
 */
const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
beforeEach(() => {
	(globalThis as { window?: EventTarget }).window = new EventTarget();
});

/**
 * Tests for the web ModeAffordance host (`prd-web-mode-affordance-system`).
 *
 * The host makes the per-Step mode affordance universal: every Step-bearing
 * route binds its `ModeRow` through `createStepModeRow` and spreads the
 * `modeAffordanceHooks` `data-*` set, so a Step row can never silently lose its
 * affordance. These tests pin the density mapping, the locked labels, the hook
 * contract the design gate filters on, and the AI Assist event the four-mode
 * row dispatches.
 */
describe("ModeAffordance host: universal per-Step mode row", () => {
	test("locks the four canonical mode labels (DESIGN.md §4.13)", () => {
		expect(MODE_AFFORDANCE_LABELS).toEqual({
			manual: "Manual",
			play: "Play",
			discuss: "Discuss",
			assist: "AI Assist",
		});
		expect(MODE_AFFORDANCE_TOOLBAR_LABEL).toBe("Step modes");
	});

	test("picks ModeRow density from the Step kind", () => {
		// Dense board / lane Steps render compact (icon-only).
		expect(densityForStepKind("task-card")).toBe("compact");
		expect(densityForStepKind("subsystem-row")).toBe("compact");
		expect(densityForStepKind("audit-row")).toBe("compact");
		// Settings + doc surfaces render tight (Suggest / Discuss only).
		expect(densityForStepKind("setting-row")).toBe("tight");
		expect(densityForStepKind("doc-block")).toBe("tight");
		// Primary list rows render the long labelled form.
		expect(densityForStepKind("review-item")).toBe("long");
		expect(densityForStepKind("artifact-row")).toBe("long");
		expect(densityForStepKind("run-row")).toBe("long");
	});

	test("builds the data-* hook set every Step row must carry", () => {
		const hooks = modeAffordanceHooks({ stepId: "AUTH-42", kind: "task-card" });
		expect(hooks).toEqual({
			"data-mode-affordance": "step",
			"data-mode-step-kind": "task-card",
			"data-mode-step-id": "AUTH-42",
		});
	});

	test("createStepModeRow resolves density + canonical toolbar label", () => {
		const card = createStepModeRow({ stepId: "AUTH-42", kind: "task-card" });
		expect(card.density).toBe("compact");
		expect(card.ariaLabel).toBe("Step modes");
		expect(card.modes).toEqual(["manual", "play", "discuss", "assist"]);

		const setting = createStepModeRow({ stepId: "general", kind: "setting-row" });
		expect(setting.density).toBe("tight");
		// Tight form drops Manual + Assist (DESIGN.md §4.13).
		expect(setting.modes).toEqual(["play", "discuss"]);
	});

	test("AI Assist mode routes to the one shell drawer event, scoped to the Step", () => {
		const events: ModeAssistDetail[] = [];
		(globalThis.window as EventTarget).addEventListener(
			"fulcrum:open-ai-assist",
			(event) => events.push((event as CustomEvent<ModeAssistDetail>).detail),
		);

		const scope: ModeStepScope = {
			stepId: "AUTH-42",
			kind: "task-card",
			traceId: "4f3a1c9e",
			title: "Session migration",
		};
		const binding = createStepModeRow(scope);
		binding.onSelect("assist");

		expect(events).toHaveLength(1);
		expect(events[0]).toEqual({
			stepId: "AUTH-42",
			stepKind: "task-card",
			traceId: "4f3a1c9e",
			title: "Session migration",
		});
	});

	test("the deprecated ai-assist alias also opens the shell drawer", () => {
		let opened = false;
		(globalThis.window as EventTarget).addEventListener(
			"fulcrum:open-ai-assist",
			() => {
				opened = true;
			},
		);

		createStepModeRow({ stepId: "doc_1", kind: "doc-block" }).onSelect("ai-assist");
		expect(opened).toBe(true);
	});

	test("custom handlers override the default mode actions", () => {
		const seen: string[] = [];
		const binding = createStepModeRow(
			{ stepId: "REV-7", kind: "review-item" },
			{
				onManual: () => seen.push("manual"),
				onPlay: () => seen.push("play"),
				onDiscuss: () => seen.push("discuss"),
				onAssist: () => seen.push("assist"),
			},
		);
		binding.onSelect("manual");
		binding.onSelect("play");
		binding.onSelect("discuss");
		binding.onSelect("assist");
		expect(seen).toEqual(["manual", "play", "discuss", "assist"]);
	});

	test("openAssistForStep is SSR-safe: no throw without a window", () => {
		// @ts-expect-error: simulate the server (no window global).
		delete globalThis.window;
		expect(() => openAssistForStep({ stepId: "x", kind: "task-card" })).not.toThrow();
	});
});

afterEach(() => {
	// Restore the original `window` descriptor: each test gets a fresh stub.
	if (windowDescriptor) {
		Object.defineProperty(globalThis, "window", windowDescriptor);
	} else {
		delete (globalThis as { window?: unknown }).window;
	}
});
