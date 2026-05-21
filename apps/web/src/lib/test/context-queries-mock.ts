/**
 * Complete `mock.module` factory for
 * `@knowledge-workspace/application/context/queries.ts`.
 *
 * Bun's `mock.module` is process-global and freezes a module's *export-name
 * set* on its first registration. The `/context/preview` route test mocks this
 * module with only `loadContextPreviewOptions` + `loadContextBundle` (the two
 * exports its page server uses). That froze `previewContext` out of the
 * export-name set, so a sibling suite — `/runs/[id]`, whose page server pulls
 * in `getProjectRunPageData` → `execution-orchestration/.../runs/queries.ts`,
 * which statically imports `previewContext` — failed to evaluate with
 * "Export named 'previewContext' not found".
 *
 * `contextQueriesMock()` returns an object carrying *every* real export name.
 * Each export consults a shared `globalThis` override slot:
 *  - The owning suite publishes its stubs via `useContextQueries` in
 *    `beforeAll` and clears them in `afterAll`.
 *  - With no suite active each export delegates to the *real*
 *    implementation. The real module is captured by a static import that
 *    resolves before any `mock.module` registration runs (the test imports
 *    this factory module before calling `mock.module`), so the delegate is the
 *    genuine `context/queries.ts`, not this mock.
 */

import * as realContextQueries from "@knowledge-workspace/application/context/queries.ts";

type ContextQueriesModule = typeof realContextQueries;

/** Function export names of `context/queries.ts`. */
const FUNCTION_EXPORTS = [
  "loadContextPreviewOptions",
  "loadContextBundle",
  "previewContext",
] as const;

type ContextQueriesFn = (typeof FUNCTION_EXPORTS)[number];

/** Partial map of `context/queries` function overrides supplied by the owning suite. */
export type ContextQueriesOverrides = Partial<
  Record<ContextQueriesFn, (...args: never[]) => unknown>
>;

const SLOT = "__fulcrumContextQueriesOverrides";

function activeOverrides(): ContextQueriesOverrides | null {
  return (
    (globalThis as Record<string, unknown>)[SLOT] as ContextQueriesOverrides | null | undefined
  ) ?? null;
}

/**
 * Install `overrides` as the active suite's `context/queries` stubs. Call from
 * the owning suite's `beforeAll`; the returned disposer (call from `afterAll`)
 * clears the slot so sibling suites fall through to the real implementation.
 */
export function useContextQueries(overrides: ContextQueriesOverrides): () => void {
  (globalThis as Record<string, unknown>)[SLOT] = overrides;
  return () => {
    if ((globalThis as Record<string, unknown>)[SLOT] === overrides) {
      delete (globalThis as Record<string, unknown>)[SLOT];
    }
  };
}

/**
 * Returns a complete `context/queries` module mock. Every real export name is
 * present; each function consults the shared override slot, then falls back to
 * the real implementation.
 */
export function contextQueriesMock(): ContextQueriesModule {
  const exports = { ...realContextQueries } as Record<string, unknown>;
  for (const name of FUNCTION_EXPORTS) {
    exports[name] = (...args: unknown[]) => {
      const override = activeOverrides()?.[name];
      if (override) return (override as (...a: unknown[]) => unknown)(...args);
      return (realContextQueries[name] as (...a: unknown[]) => unknown)(...args);
    };
  }
  return exports as ContextQueriesModule;
}
