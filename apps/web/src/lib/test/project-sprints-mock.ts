/**
 * Complete `mock.module` factory for
 * `@work-management/interface/project-sprints.ts`.
 *
 * Bun's `mock.module` is process-global and freezes a module's *export-name
 * set* on its first registration; only the first-registered factory closure
 * survives. The `/projects/[id]/sprints` route test mocks this module with all
 * eight exports, `/projects/[id]/sprint/[sprintId]` with only five. Whichever
 * registered first hijacked the other suite: if the five-export mock won,
 * `loadProjectSprints` / `createProjectSprint` / `startProjectSprint` were
 * frozen out and the sprints-list suite broke.
 *
 * `projectSprintsMock()` returns an object carrying *every* real export name.
 * Each export consults a shared `globalThis` override slot:
 *  - The owning suite publishes its stubs via `useProjectSprints` in
 *    `beforeAll` and clears them in `afterAll`.
 *  - With no suite active each export delegates to the real implementation
 *    (captured by a static import that resolves before any `mock.module`
 *    registration runs).
 */

import * as realProjectSprints from "@work-management/interface/project-sprints.ts";

type ProjectSprintsModule = typeof realProjectSprints;

/** Function export names of `project-sprints.ts`. */
const FUNCTION_EXPORTS = [
  "loadProjectSprints",
  "loadProjectSprintDetail",
  "createProjectSprint",
  "startProjectSprint",
  "completeProjectSprint",
  "updateSprintGoal",
  "createProjectTask",
  "updateProjectTask",
] as const;

type ProjectSprintsFn = (typeof FUNCTION_EXPORTS)[number];

/** Partial map of `project-sprints` function overrides supplied by the owning suite. */
export type ProjectSprintsOverrides = Partial<
  Record<ProjectSprintsFn, (...args: never[]) => unknown>
>;

const SLOT = "__fulcrumProjectSprintsOverrides";

function activeOverrides(): ProjectSprintsOverrides | null {
  return (
    (globalThis as Record<string, unknown>)[SLOT] as
      | ProjectSprintsOverrides
      | null
      | undefined
  ) ?? null;
}

/**
 * Install `overrides` as the active suite's `project-sprints` stubs. Call from
 * the owning suite's `beforeAll`; the returned disposer (call from `afterAll`)
 * clears the slot so sibling suites fall through to the real implementation.
 */
export function useProjectSprints(overrides: ProjectSprintsOverrides): () => void {
  (globalThis as Record<string, unknown>)[SLOT] = overrides;
  return () => {
    if ((globalThis as Record<string, unknown>)[SLOT] === overrides) {
      delete (globalThis as Record<string, unknown>)[SLOT];
    }
  };
}

/**
 * Returns a complete `project-sprints` module mock. Every real export name is
 * present; each function consults the shared override slot, then falls back to
 * the real implementation.
 */
export function projectSprintsMock(): ProjectSprintsModule {
  const exports = { ...realProjectSprints } as Record<string, unknown>;
  for (const name of FUNCTION_EXPORTS) {
    exports[name] = (...args: unknown[]) => {
      const override = activeOverrides()?.[name];
      if (override) return (override as (...a: unknown[]) => unknown)(...args);
      return (realProjectSprints[name] as (...a: unknown[]) => unknown)(...args);
    };
  }
  return exports as ProjectSprintsModule;
}
