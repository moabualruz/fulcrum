/**
 * Complete `mock.module` factory for
 * `@work-management/interface/project-lifecycle.ts`.
 *
 * Bun's `mock.module` is process-global and freezes a module's *export-name
 * set* on its first registration; only the first-registered factory closure
 * survives. Three route tests mock this module: `/projects/[id]` with a
 * six-export subset, `/projects/[id]/repos` and `/projects/[id]/sprints` with
 * only `loadProjectOverview`. Whichever registered first hijacked the others
 * and (for the one-export mocks) stripped `updateProject`, `deleteProject`,
 * `createProject`, `listProjectRows`, …: breaking sibling suites such as the
 * `/projects` route test, whose page server imports `listProjectRows`.
 *
 * `projectLifecycleMock()` returns an object carrying *every* real export name.
 * Each export consults a shared `globalThis` override slot:
 *  - The owning suite publishes its stubs via `useProjectLifecycle` in
 *    `beforeAll` and clears them in `afterAll`.
 *  - With no suite active each export delegates to the real implementation
 *    (captured by a static import that resolves before any `mock.module`
 *    registration runs).
 */

import * as realProjectLifecycle from "@work-management/interface/project-lifecycle.ts";

type ProjectLifecycleModule = typeof realProjectLifecycle;

/** Function export names of `project-lifecycle.ts`. */
const FUNCTION_EXPORTS = [
  "listProjectRows",
  "listProjectOptions",
  "createProject",
  "createProjectFromSetup",
  "loadProjectOverview",
  "updateProject",
  "deleteProject",
] as const;

type ProjectLifecycleFn = (typeof FUNCTION_EXPORTS)[number];

/** Partial map of `project-lifecycle` function overrides supplied by the owning suite. */
export type ProjectLifecycleOverrides = Partial<
  Record<ProjectLifecycleFn, (...args: never[]) => unknown>
>;

const SLOT = "__fulcrumProjectLifecycleOverrides";

function activeOverrides(): ProjectLifecycleOverrides | null {
  return (
    (globalThis as Record<string, unknown>)[SLOT] as
      | ProjectLifecycleOverrides
      | null
      | undefined
  ) ?? null;
}

/**
 * Install `overrides` as the active suite's `project-lifecycle` stubs. Call
 * from the owning suite's `beforeAll`; the returned disposer (call from
 * `afterAll`) clears the slot so sibling suites fall through to the real
 * implementation.
 */
export function useProjectLifecycle(overrides: ProjectLifecycleOverrides): () => void {
  (globalThis as Record<string, unknown>)[SLOT] = overrides;
  return () => {
    if ((globalThis as Record<string, unknown>)[SLOT] === overrides) {
      delete (globalThis as Record<string, unknown>)[SLOT];
    }
  };
}

/**
 * Returns a complete `project-lifecycle` module mock. Every real export name is
 * present; each function consults the shared override slot, then falls back to
 * the real implementation.
 */
export function projectLifecycleMock(): ProjectLifecycleModule {
  const exports = { ...realProjectLifecycle } as Record<string, unknown>;
  for (const name of FUNCTION_EXPORTS) {
    exports[name] = (...args: unknown[]) => {
      const override = activeOverrides()?.[name];
      if (override) return (override as (...a: unknown[]) => unknown)(...args);
      return (realProjectLifecycle[name] as (...a: unknown[]) => unknown)(...args);
    };
  }
  return exports as ProjectLifecycleModule;
}
