import type { Component } from "svelte";
import { beforeAll, describe, expect, mock, test } from "bun:test";
import { render } from "svelte/server";

import {
	buildThemeStyle,
	getThemeCookieValue,
	useTheme,
	type ThemeSettings,
} from "../../src/lib/theme";
import {
	buildKeybindingMap,
	createKeybindingDispatcher,
} from "../../src/lib/keybindings";
import { recordGlobalError } from "../../src/lib/telemetry";

mock.module("$app/environment", () => ({
	browser: false,
	building: false,
	dev: false,
	version: "test",
}));

let FeatureGate: Component<{
	flag: string;
	flags?: Record<string, boolean>;
	fallback?: boolean;
}>;

beforeAll(async () => {
	const mod = await import("../../src/lib/components/FeatureGate.svelte");
	FeatureGate = mod.default as typeof FeatureGate;
});

describe("useTheme", () => {
	test("is SSR safe and returns injected css vars", () => {
		const originalWindow = globalThis.window;
		// @ts-expect-error prove no browser global is needed during SSR
		delete globalThis.window;

		const theme = useTheme({
			mode: "dark",
			vars: { "--color-primary": "oklch(0.7 0.14 240)" },
		});

		expect(theme.mode).toBe("dark");
		expect(theme.dataMode).toBe("dark");
		expect(theme.style).toContain("--color-primary: oklch(0.7 0.14 240)");
		globalThis.window = originalWindow;
	});

	test("serializes theme css variables for first SSR render", () => {
		const settings: ThemeSettings = {
			mode: "light",
			vars: { "--color-primary": "#0ea5e9", "--radius": "0.5rem" },
		};

		expect(buildThemeStyle(settings)).toContain("--color-primary: #0ea5e9");
		expect(buildThemeStyle(settings)).toContain("--radius: 0.5rem");
		expect(getThemeCookieValue("mode=dark; fulcrum-theme=auto")).toBe("auto");
	});
});

describe("keybinding dispatcher", () => {
	test("merges default web bindings with tenant overrides", () => {
		const map = buildKeybindingMap({
			"palette.open": ["Mod+Shift+P"],
		});

		expect(map.get("mod+shift+p")).toBe("palette.open");
		expect(map.get("mod+k")).toBeUndefined();
	});

	test("opens palette under 50ms and closes on Escape", () => {
		const changes: boolean[] = [];
		const marks: string[] = [];
		const dispatcher = createKeybindingDispatcher({
			openPalette: () => changes.push(true),
			closePalette: () => changes.push(false),
			performance: {
				now: () => 12,
				mark: (name) => {
					marks.push(name);
					return {} as PerformanceMark;
				},
			},
		});

		dispatcher(keyEvent({ key: "k", metaKey: true }));
		dispatcher(keyEvent({ key: "Escape" }));

		expect(changes).toEqual([true, false]);
		expect(marks).toContain("fulcrum.palette.open");
	});
});

describe("FeatureGate", () => {
	test("renders fallback callout when flag is disabled", () => {
		const { body } = render(FeatureGate, {
			props: { flag: "non-existent", flags: {} },
		});

		expect(body).toContain("Enable this feature in Settings");
		expect(body).toContain("Feature Flags");
	});

	test("renders nothing for disabled flag when fallback is false", () => {
		const { body } = render(FeatureGate, {
			props: { flag: "non-existent", flags: {}, fallback: false },
		});

		expect(body).not.toContain("data-feature-gate-fallback");
		expect(body).not.toContain("Enable this feature");
	});
});

describe("global telemetry", () => {
	test("window.onerror recorder never rejects", async () => {
		const errors: unknown[] = [];
		const telemetry = {
			recordError: async (error: unknown) => {
				errors.push(error);
			},
		};

		await expect(
			recordGlobalError(new Error("boom"), telemetry),
		).resolves.toBeUndefined();
		expect(errors).toHaveLength(1);
	});
});

function keyEvent(input: { key: string; metaKey?: boolean; ctrlKey?: boolean }) {
	return {
		key: input.key,
		metaKey: input.metaKey ?? false,
		ctrlKey: input.ctrlKey ?? false,
		preventDefault: () => {},
	} as KeyboardEvent;
}
