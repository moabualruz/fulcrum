/**
 * Complete `mock.module` factory for `$lib/server/application-scope`.
 *
 * Bun's `mock.module` is process-global in two ways that bite here:
 *  1. It freezes a module's *export-name set* on first registration: a later,
 *     fuller mock cannot add names the first one omitted.
 *  2. Only the *first-registered factory closure* survives; every later
 *     `mock.module(samePath, …)` is ignored. So a per-file `suiteActive`
 *     boolean or a per-file seam closure is invisible to the losing file -
 *     fourteen route server tests mock this module, but only one file's seam
 *     would ever be consulted.
 *
 * The fix is a *shared* seam slot on `globalThis`. Every consumer registers the
 * same complete-export factory via `applicationScopeMock()`; whichever closure
 * Bun keeps reads the shared slot. The owning suite publishes its seam into the
 * slot in `beforeAll` (via `useApplicationScope`) and clears it in `afterAll`:
 *  - While a suite is active its seam answers `requestAppScope`.
 *  - With no suite active (or the seam returns `null`) the call falls through
 *    to the real `resolveApplicationScope`, honouring any scope injected via
 *    `__setApplicationScopeForTest`: mirroring the production module so
 *    foreign suites (e.g. `tasks/[id]/run-preview`) keep working.
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

const SEAM_SLOT = "__fulcrumApplicationScopeSeam";
const OVERRIDE_SLOT = "__fulcrumApplicationScopeOverride";

function activeSeam(): SuiteScopeSeam | null {
  return (
    (globalThis as Record<string, unknown>)[SEAM_SLOT] as SuiteScopeSeam | null | undefined
  ) ?? null;
}

/**
 * Publish `seam` as the active suite's `application-scope` resolver. Call from
 * the owning suite's `beforeAll`; the returned disposer (call from `afterAll`)
 * clears the slot so sibling suites are never answered by a stale seam.
 */
export function useApplicationScope(seam: SuiteScopeSeam): () => void {
  (globalThis as Record<string, unknown>)[SEAM_SLOT] = seam;
  return () => {
    if ((globalThis as Record<string, unknown>)[SEAM_SLOT] === seam) {
      delete (globalThis as Record<string, unknown>)[SEAM_SLOT];
    }
  };
}

/**
 * Returns a complete `application-scope` module mock. Every consumer registers
 * the *same* factory; the surviving closure routes through the shared seam
 * slot, then through `__setApplicationScopeForTest` overrides, then the real
 * resolver.
 */
export function applicationScopeMock(): ApplicationScopeMockExports {
  return {
    async requestAppScope(locals, projectId = null, taskId = null, runId = null) {
      const seam = activeSeam();
      const seamScope = seam ? seam(locals, projectId, taskId, runId) : null;
      if (seamScope) return seamScope;
      // Foreign-suite path: honour an override set via __setApplicationScopeForTest.
      const override =
        ((globalThis as Record<string, unknown>)[OVERRIDE_SLOT] as
          | ApplicationScopeInput
          | null
          | undefined) ?? null;
      const scope =
        (locals as { em?: unknown } | undefined)?.em
          ? (locals as ApplicationScopeInput)
          : override ?? (locals as ApplicationScopeInput);
      return resolveApplicationScope(scope, projectId, taskId, runId);
    },
    __setApplicationScopeForTest(scope: ApplicationScopeInput | null): () => void {
      const previous =
        ((globalThis as Record<string, unknown>)[OVERRIDE_SLOT] as
          | ApplicationScopeInput
          | null
          | undefined) ?? null;
      (globalThis as Record<string, unknown>)[OVERRIDE_SLOT] = scope;
      return () => {
        (globalThis as Record<string, unknown>)[OVERRIDE_SLOT] = previous;
      };
    },
  };
}
