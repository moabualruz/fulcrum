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
			/** Per-process MikroORM EntityManager used by web tRPC context. */
			em?: import("@mikro-orm/postgresql").EntityManager | null;
			/** needle-di container used by web tRPC context. */
			container?: import("@needle-di/core").Container | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
