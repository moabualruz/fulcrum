// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			activeProjectId: string | null;
			/** Better-Auth session — null for unauthenticated requests. */
			session: import("better-auth").Session | null;
			/** OrgId derived from session (getOrgId helper). Null when unauthenticated. */
			orgId: string | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
