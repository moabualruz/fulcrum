export const KEYBINDING_ACTIONS = [
	"palette.open",
	"navigate.search",
	"navigate.back",
	"view.toggle-sidebar",
] as const;

export type KeybindingAction = (typeof KEYBINDING_ACTIONS)[number];

export type KeybindingContext = "global" | "navigation" | "view";

export interface Keybinding {
	context: KeybindingContext;
	key: string;
}

export type KeybindingMap = Record<KeybindingAction, Keybinding>;

