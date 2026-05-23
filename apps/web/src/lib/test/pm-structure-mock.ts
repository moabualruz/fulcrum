/**
 * Complete `mock.module` factory for `@work-management/interface/pm-structure.ts`.
 *
 * Bun's `mock.module` is process-global and freezes a module's *export-name
 * set* on its first registration: a later, fuller mock of the same path
 * cannot add names the first one omitted, and only the first-registered
 * factory closure survives for every later importer. The
 * `/projects/[id]/intake` and `/projects/[id]/modules` route tests each mock
 * this module with their own suite-specific stubs over an 8-of-10 export
 * subset; whichever registered first hijacked the other suite's `calls`
 * recorder and stripped `getProjectModule` / `getIntakeRequest`.
 *
 * Because only one factory closure survives, a per-file `suiteActive` boolean
 * is invisible to the losing file. Instead the active suite publishes its
 * override map into a shared `globalThis` slot (installed in `beforeAll`,
 * cleared in `afterAll`); whichever factory closure won reads that slot.
 *
 * `pmStructureMock()` returns an object carrying *every* real export name of
 * `pm-structure` so no sibling importer is ever frozen out. The real
 * `pm-structure` is intentionally NOT imported: a static import of the mocked
 * path resolves back to this factory. The only test consumers of this module
 * (`intake`, `modules`) always publish their overrides while active, so the
 * "no active suite" branch never fires in practice; it throws a descriptive
 * error rather than silently hitting the database.
 */

/** Every export name of `@work-management/interface/pm-structure.ts`. */
const FUNCTION_EXPORTS = [
  "listProjectModules",
  "getProjectModule",
  "createProjectModule",
  "updateProjectModule",
  "deleteProjectModule",
  "listIntakeRequests",
  "getIntakeRequest",
  "createIntakeRequest",
  "updateIntakeRequest",
  "deleteIntakeRequest",
] as const;

type PmStructureFn = (typeof FUNCTION_EXPORTS)[number];

/** Partial map of `pm-structure` function overrides supplied by the owning suite. */
export type PmStructureOverrides = Partial<Record<PmStructureFn, (...args: never[]) => unknown>>;

const SLOT = "__fulcrumPmStructureOverrides";

function activeOverrides(): PmStructureOverrides | null {
  return (
    (globalThis as Record<string, unknown>)[SLOT] as PmStructureOverrides | null | undefined
  ) ?? null;
}

/**
 * Install `overrides` as the active suite's `pm-structure` stubs. Call from the
 * owning suite's `beforeAll`; the returned disposer (call from `afterAll`)
 * clears the slot.
 */
export function usePmStructureOverrides(overrides: PmStructureOverrides): () => void {
  (globalThis as Record<string, unknown>)[SLOT] = overrides;
  return () => {
    if ((globalThis as Record<string, unknown>)[SLOT] === overrides) {
      delete (globalThis as Record<string, unknown>)[SLOT];
    }
  };
}

/**
 * Returns a complete `pm-structure` module mock. Every real export name is
 * present; each function consults the shared override slot.
 */
export function pmStructureMock(): Record<PmStructureFn, (...args: unknown[]) => unknown> {
  const exports = {} as Record<PmStructureFn, (...args: unknown[]) => unknown>;
  for (const name of FUNCTION_EXPORTS) {
    exports[name] = (...args: unknown[]) => {
      const override = activeOverrides()?.[name];
      if (!override) {
        throw new Error(
          `pm-structure mock: '${name}' called with no active suite overrides. ` +
            `Publish overrides via usePmStructureOverrides() in beforeAll.`,
        );
      }
      return (override as (...a: unknown[]) => unknown)(...args);
    };
  }
  return exports;
}
