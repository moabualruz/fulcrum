/**
 * Complete `mock.module` factory for `$lib/util/media-query`.
 *
 * Bun's `mock.module` is process-global and freezes a module's *export-name
 * set* on first registration. `routes/layout.svelte.test.ts` mocked this
 * module with only `MOBILE_QUERY` / `browserDriver` / `isMobileViewport` to
 * pin the layout's mobile-vs-desktop branch: which stripped the `BREAKPOINTS`
 * export and replaced `isMobileViewport` with a constant for every other
 * importer. `lib/util/media-query.test.ts`, which expects the real
 * `BREAKPOINTS` and the real `isMobileViewport`, then failed.
 *
 * The real `$lib/util/media-query` is intentionally NOT imported here: Bun's
 * `mock.module` retroactively rewrites already-resolved import bindings, so a
 * static import of the mocked path would make this factory's "real" delegation
 * call itself and recurse forever. `media-query` is a tiny pure leaf module -
 * its surface is reproduced verbatim below so the factory has a genuine
 * implementation that the mock can never hijack.
 */

export interface MediaQueryDriver {
  matches(query: string): boolean;
}

// Verbatim copy of `$lib/util/media-query` so foreign suites get real behaviour
// without importing (and thus re-mocking) the module under test.
const BREAKPOINTS = {
  xs: 480,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
} as const;

const MOBILE_QUERY = `(max-width: ${BREAKPOINTS.md - 1}px)`;

function realBrowserDriver(): MediaQueryDriver {
  return {
    matches: (q) => {
      if (typeof globalThis === "undefined") return false;
      const mm = (globalThis as { matchMedia?: (query: string) => { matches: boolean } })
        .matchMedia;
      if (typeof mm !== "function") return false;
      return mm(q).matches;
    },
  };
}

function realIsMobileViewport(driver: MediaQueryDriver): boolean {
  return driver.matches(MOBILE_QUERY);
}

export interface MediaQueryDoubles {
  browserDriver: () => MediaQueryDriver;
  isMobileViewport: (driver: MediaQueryDriver) => boolean;
}

/**
 * Seam invoked on every `browserDriver` / `isMobileViewport` call. Return the
 * owning suite's doubles while the suite is active, or `null` to use the real
 * implementations (foreign-suite path).
 */
export type MediaQuerySuiteSeam = () => MediaQueryDoubles | null;

export interface MediaQueryMockExports {
  BREAKPOINTS: typeof BREAKPOINTS;
  MOBILE_QUERY: typeof MOBILE_QUERY;
  browserDriver: () => MediaQueryDriver;
  isMobileViewport: (driver: MediaQueryDriver) => boolean;
}

export function mediaQueryMock(suiteSeam: MediaQuerySuiteSeam): MediaQueryMockExports {
  return {
    BREAKPOINTS,
    MOBILE_QUERY,
    browserDriver() {
      return (suiteSeam()?.browserDriver ?? realBrowserDriver)();
    },
    isMobileViewport(driver) {
      return (suiteSeam()?.isMobileViewport ?? realIsMobileViewport)(driver);
    },
  };
}
