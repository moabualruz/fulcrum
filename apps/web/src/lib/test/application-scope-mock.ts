/**
 * Complete `mock.module` factory for `$lib/server/application-scope`.
 *
 * Bun's `mock.module` is process-global and freezes a module's *export-name
 * set* on its first registration — a later, fuller mock of the same path
 * cannot add names the first one omitted. Several route server tests mock this
 * module with only `requestAppScope`; whichever test ran first stripped
 * `__setApplicationScopeForTest`, so a sibling test (tasks/[id]/run-preview)
 * importing it failed with "Export named ... not found".
 *
 * `applicationScopeMock(suiteSeam)` returns an object carrying *every* real
 * export name and keeps `requestAppScope` + `__setApplicationScopeForTest`
 * sharing state:
 *  - The owning suite supplies `suiteSeam`, returning its seeded scope (or
 *    `null` to fall through).
 *  - Foreign suites that call `__setApplicationScopeForTest({ em, ... })` —
 *    e.g. tasks/[id]/run-preview — still work: when the seam falls through and
 *    a test override is set, `requestAppScope` resolves it through the real
 *    `resolveApplicationScope`, mirroring the production module.
 */

import {
  resolveApplicationScope,
  type ApplicationScopeInput,
} from "@platform-core/application/runtime/application-scope.ts";

export interface AppScopeResult {
  em: unknown;
  ctx: { orgId: string; userId: string | null; projectId: string | null };
}

/**
 * Seam invoked first on every `requestAppScope` call. Return the suite's
 * seeded scope, or `null` to delegate (foreign suite / real override path).
 */
export type SuiteScopeSeam = (
  locals: unknown,
  projectId?: string | null,
  taskId?: string | null,
  runId?: string | null,
) => AppScopeResult | null;

export interface ApplicationScopeMockExports {
  requestAppScope: (
    locals?: unknown,
    projectId?: string | null,
    taskId?: string | null,
    runId?: string | null,
  ) => Promise<unknown>;
  __setApplicationScopeForTest: (scope: ApplicationScopeInput | null) => () => void;
}

export function applicationScopeMock(suiteSeam: SuiteScopeSeam): ApplicationScopeMockExports {
  let testScopeOverride: ApplicationScopeInput | null = null;
  return {
    async requestAppScope(locals, projectId = null, taskId = null, runId = null) {
      const seamScope = suiteSeam(locals, projectId, taskId, runId);
      if (seamScope) return seamScope;
      // Foreign-suite path: honour an override set via __setApplicationScopeForTest.
      const scope =
        (locals as { em?: unknown } | undefined)?.em
          ? (locals as ApplicationScopeInput)
          : testScopeOverride ?? (locals as ApplicationScopeInput);
      return resolveApplicationScope(scope, projectId, taskId, runId);
    },
    __setApplicationScopeForTest(scope: ApplicationScopeInput | null): () => void {
      const previous = testScopeOverride;
      testScopeOverride = scope;
      return () => {
        testScopeOverride = previous;
      };
    },
  };
}
