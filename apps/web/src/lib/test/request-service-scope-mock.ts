/**
 * Complete `mock.module` factory for `$lib/server/request-service-scope`.
 *
 * Bun's `mock.module` is process-global: the `requestServiceScope` value
 * registered first wins for every later importer, regardless of which suite is
 * running. Six route server tests mock this module, each with a suite-specific
 * stub. Whichever registered first hijacked the scope resolver for every
 * sibling suite — e.g. `/runs/[id]` (which only mocks
 * `$lib/server/application-scope`, relying on the real `requestServiceScope`
 * delegating into it) instead got another suite's `{ em: { kind: "mock-em" } }`
 * and failed with "Run not found" / `em.query is not a function`.
 *
 * `requestServiceScopeMock(suiteSeam)` keeps the single real export name and a
 * seam:
 *  - The owning suite supplies `suiteSeam`, returning its seeded scope while it
 *    is the active suite (or `null` to fall through).
 *  - Foreign suites get `null` and are routed through the *same* delegation the
 *    real `request-service-scope` performs: a dynamic import of
 *    `$lib/server/application-scope` (which itself is the suite's mocked
 *    `application-scope` factory) followed by `requestAppScope`. The real
 *    module is intentionally NOT imported here — a static import of the mocked
 *    path resolves back to this factory and recurses forever.
 */

export interface ServiceScopeResult {
  em: unknown;
  ctx: { orgId: string; userId: string | null; projectId?: string | null };
}

/**
 * Seam invoked first on every `requestServiceScope` call. Return the suite's
 * seeded scope, or `null` to delegate to the real resolution path.
 */
export type ServiceScopeSuiteSeam = (
  locals: unknown,
  projectId?: string | null,
  taskId?: string,
  runId?: string,
) => ServiceScopeResult | null;

export interface RequestServiceScopeMockExports {
  requestServiceScope: (
    locals: unknown,
    projectId?: string | null,
    taskId?: string,
    runId?: string,
  ) => Promise<unknown>;
}

export function requestServiceScopeMock(
  suiteSeam: ServiceScopeSuiteSeam,
): RequestServiceScopeMockExports {
  return {
    async requestServiceScope(locals, projectId = null, taskId, runId) {
      const seamScope = suiteSeam(locals, projectId, taskId, runId);
      if (seamScope) return seamScope;
      // Mirror the real `request-service-scope` wiring: delegate to
      // `application-scope` (the suite's mocked factory routes foreign suites
      // through the real resolver).
      const scope = await import("$lib/server/application-scope");
      return scope.requestAppScope(locals, projectId ?? null, taskId, runId);
    },
  };
}
