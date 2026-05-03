import {
	DEFAULT_WEB_KEYBINDINGS,
} from "../../../keybindings/default-web";
import type { KeybindingAction } from "../../../keybindings/schema";

export type KeybindingOverrides = Partial<Record<KeybindingAction, string[]>>;

export interface KeybindingDispatcherOptions {
	openPalette: () => void;
	closePalette: () => void;
	overrides?: KeybindingOverrides;
	performance?: Pick<Performance, "now" | "mark">;
}

export function buildKeybindingMap(overrides: KeybindingOverrides = {}) {
	const map = new Map<string, KeybindingAction>();
	for (const [action, binding] of Object.entries(DEFAULT_WEB_KEYBINDINGS) as [
		KeybindingAction,
		{ key: string },
	][]) {
		const override = overrides[action];
		const keys = override && override.length > 0 ? override : [binding.key];
		for (const key of keys) map.set(normalizeShortcut(key), action);
	}
	return map;
}

export function createKeybindingDispatcher(options: KeybindingDispatcherOptions) {
	const keyMap = buildKeybindingMap(options.overrides);
	let paletteOpen = false;

	return (event: KeyboardEvent) => {
		const action = keyMap.get(eventToShortcut(event));

		if (action === "palette.open") {
			event.preventDefault();
			paletteOpen = true;
			options.performance?.mark("fulcrum.palette.open");
			options.openPalette();
			return;
		}

		if (paletteOpen && event.key === "Escape") {
			event.preventDefault();
			paletteOpen = false;
			options.closePalette();
		}
	};
}

export function installKeybindingDispatcher(options: KeybindingDispatcherOptions) {
	if (typeof window === "undefined") return () => {};
	const dispatcher = createKeybindingDispatcher(options);
	window.addEventListener("keydown", dispatcher);
	return () => window.removeEventListener("keydown", dispatcher);
}

function eventToShortcut(event: KeyboardEvent): string {
	const parts: string[] = [];
	if (event.ctrlKey) parts.push("ctrl");
	if (event.altKey) parts.push("alt");
	if (event.shiftKey) parts.push("shift");
	if (event.metaKey) parts.push("mod");
	parts.push(normalizeKey(event.key));
	return parts.join("+");
}

function normalizeShortcut(shortcut: string): string {
	return shortcut
		.replace(/^Mod\+/i, "mod+")
		.replace(/^⌘\+/, "mod+")
		.split("+")
		.map(normalizeKey)
		.join("+");
}

function normalizeKey(key: string): string {
	if (key === " ") return "space";
	if (key === "Esc") return "escape";
	return key.toLowerCase();
}
