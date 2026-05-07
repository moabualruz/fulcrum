// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			activeProjectId: string | null;
			session: unknown | null;
			orgId: string | null;
			userId?: string | null;
			locale?: import("$lib/i18n").SupportedLocale;
			i18nEnabled?: boolean;
			em: import("@mikro-orm/postgresql").EntityManager | null;
			container: import("../../../src/di/container.ts").Container | null;
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
