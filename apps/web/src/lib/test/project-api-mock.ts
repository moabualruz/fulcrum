/**
 * Complete `mock.module` factory for `$lib/server/project-api`.
 *
 * Bun's `mock.module` is process-global and freezes a module's *export-name
 * set* on its first registration: a later, fuller mock of the same path
 * cannot add names the first one omitted, and the first mock's *values* win
 * for every later importer. Several route server tests mock this module with
 * only `ensureProjectExists`; whichever test ran first both stripped
 * `createProjectApiForEvent` / `activeOrgId` / `currentUserId` and replaced
 * `ensureProjectExists` with a no-op, so sibling settings routes that rely on
 * the *real* `ensureProjectExists` (which fans out to the public project API)
 * silently stopped issuing their API call.
 *
 * `projectApiMock(suiteSeam)` returns an object carrying *every* real export of
 * `$lib/server/project-api`:
 *  - `createProjectApiForEvent`, `activeOrgId`, `currentUserId` always delegate
 *    to the real implementation.
 *  - `ensureProjectExists` first consults `suiteSeam`. The owning suite returns
 *    a handler (its stub) while it is the active suite; foreign suites get
 *    `null` back and fall through to the real `ensureProjectExists`.
 */

import {
  activeOrgId,
  createProjectApiForEvent,
  currentUserId,
  ensureProjectExists as realEnsureProjectExists,
} from "$lib/server/project-api";

type EnsureProjectExists = typeof realEnsureProjectExists;

/**
 * Seam invoked on every `ensureProjectExists` call. Return the owning suite's
 * stub while the suite is active, or `null` to delegate to the real
 * implementation (foreign-suite path).
 */
export type ProjectApiSuiteSeam = () => EnsureProjectExists | null;

export interface ProjectApiMockExports {
  createProjectApiForEvent: typeof createProjectApiForEvent;
  ensureProjectExists: EnsureProjectExists;
  activeOrgId: typeof activeOrgId;
  currentUserId: typeof currentUserId;
}

export function projectApiMock(suiteSeam: ProjectApiSuiteSeam): ProjectApiMockExports {
  return {
    createProjectApiForEvent,
    activeOrgId,
    currentUserId,
    ensureProjectExists: ((event, projectId) => {
      const suiteHandler = suiteSeam();
      if (suiteHandler) return suiteHandler(event, projectId);
      return realEnsureProjectExists(event, projectId);
    }) as EnsureProjectExists,
  };
}
