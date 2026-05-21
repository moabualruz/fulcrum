/**
 * Complete `mock.module` factory for `../project-request-scope`
 * (`apps/web/src/routes/projects/project-request-scope.ts`).
 *
 * Bun's `mock.module` is process-global: only one factory closure survives per
 * path, and the `requestProjectScope` value registered first wins for every
 * later importer. The `/projects/[id]/intake` and `/projects/[id]/modules`
 * route tests both mock this module with their own suite-specific stubs;
 * whichever registered first hijacked the scope resolver for the other suite.
 *
 * Because only one factory closure survives, a per-file `suiteActive` boolean
 * is invisible to the losing file. Instead the active suite publishes its
 * scope resolver into a shared `globalThis` slot (installed in `beforeAll`,
 * cleared in `afterAll`); whichever factory closure won reads that slot:
 *  - While a suite is active its resolver answers.
 *  - With no suite active the call falls through to the *same* delegation the
 *    real `project-request-scope` performs: a dynamic import of
 *    `$lib/server/request-service-scope` (itself the suite's mocked factory)
 *    followed by `requestServiceScope`. The real module is intentionally NOT
 *    imported here: a static import of the mocked path resolves back to this
 *    factory and recurses forever.
 */

export interface ProjectScopeResult {
  em: unknown;
  ctx: { orgId: string; userId: string | null; projectId?: string | null };
}

/** Resolver supplied by the owning suite for `requestProjectScope`. */
export type ProjectScopeResolver = (
  locals: unknown,
  projectId?: string | null,
) => ProjectScopeResult;

export interface ProjectRequestScopeMockExports {
  requestProjectScope: (locals: unknown, projectId?: string | null) => Promise<unknown>;
}

const SLOT = "__fulcrumProjectRequestScopeResolver";

function activeResolver(): ProjectScopeResolver | null {
  return (
    (globalThis as Record<string, unknown>)[SLOT] as ProjectScopeResolver | null | undefined
  ) ?? null;
}

/**
 * Install `resolver` as the active suite's `requestProjectScope` implementation.
 * Call from the owning suite's `beforeAll`; the returned disposer (call from
 * `afterAll`) clears the slot so foreign suites fall through.
 */
export function useProjectRequestScope(resolver: ProjectScopeResolver): () => void {
  (globalThis as Record<string, unknown>)[SLOT] = resolver;
  return () => {
    if ((globalThis as Record<string, unknown>)[SLOT] === resolver) {
      delete (globalThis as Record<string, unknown>)[SLOT];
    }
  };
}

export function projectRequestScopeMock(): ProjectRequestScopeMockExports {
  return {
    async requestProjectScope(locals, projectId = null) {
      const resolver = activeResolver();
      if (resolver) return resolver(locals, projectId);
      // Mirror the real `project-request-scope` wiring: delegate to
      // `request-service-scope` (the suite's mocked factory routes foreign
      // suites through the real resolver).
      const scope = await import("$lib/server/request-service-scope");
      return scope.requestServiceScope(locals as App.Locals, projectId ?? null);
    },
  };
}
