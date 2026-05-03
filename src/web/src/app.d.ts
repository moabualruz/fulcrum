// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			activeProjectId: string | null;
			container?: {
				get: (token: unknown) => unknown;
			};
		}
		interface PageData {
			theme?: import("$lib/theme").ThemeSettings;
			keybindingOverrides?: import("$lib/keybindings").KeybindingOverrides;
			featureFlags?: Record<string, boolean>;
		}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
