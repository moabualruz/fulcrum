import type { KeybindingMap } from "./schema";

export const DEFAULT_WEB_KEYBINDINGS: KeybindingMap = {
	"palette.open": { context: "global", key: "Mod+K" },
	"navigate.search": { context: "navigation", key: "/" },
	"navigate.back": { context: "navigation", key: "Alt+ArrowLeft" },
	"view.toggle-sidebar": { context: "view", key: "Mod+B" },
};

