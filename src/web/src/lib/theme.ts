export type ThemeMode = "light" | "dark" | "auto";

export interface ThemeSettings {
	mode: ThemeMode;
	vars: Record<string, string>;
}

export interface ThemeState extends ThemeSettings {
	dataMode: ThemeMode;
	style: string;
	setMode: (mode: ThemeMode) => void;
}

const COOKIE_NAME = "fulcrum-theme";
const SAFE_VAR = /^--[a-z0-9-]+$/i;
const SAFE_VALUE = /^[^;{}<>]*$/;

export function useTheme(settings: Partial<ThemeSettings> = {}): ThemeState {
	const mode = normalizeMode(settings.mode);
	const vars = settings.vars ?? {};

	return {
		mode,
		vars,
		dataMode: mode,
		style: buildThemeStyle({ vars }),
		setMode,
	};
}

export function buildThemeStyle(settings: Pick<ThemeSettings, "vars">): string {
	return Object.entries(settings.vars)
		.filter(([name, value]) => SAFE_VAR.test(name) && SAFE_VALUE.test(value))
		.map(([name, value]) => `${name}: ${value}`)
		.join("; ");
}

export function getThemeCookieValue(cookieHeader: string | null | undefined): ThemeMode | null {
	if (!cookieHeader) return null;
	for (const part of cookieHeader.split(";")) {
		const [rawName, rawValue] = part.trim().split("=");
		if (rawName !== COOKIE_NAME) continue;
		return normalizeMode(rawValue);
	}
	return null;
}

export function setMode(mode: ThemeMode): void {
	if (typeof document === "undefined") return;
	const normalized = normalizeMode(mode);
	document.documentElement.dataset.mode = normalized;
	document.documentElement.classList.toggle("dark", normalized === "dark");
	document.cookie = `${COOKIE_NAME}=${normalized}; Path=/; SameSite=Lax; Max-Age=31536000`;
}

export function normalizeMode(mode: unknown): ThemeMode {
	return mode === "dark" || mode === "auto" || mode === "light" ? mode : "light";
}
