// Tiny media-query indirection so the layout's mobile-vs-desktop branch can
// be exercised in unit tests without dragging in jsdom or simulating window
// resizes. The browser driver is the only path that touches `globalThis`;
// tests inject a `MediaQueryDriver` stub directly.

export interface MediaQueryDriver {
  matches(query: string): boolean;
}

export const MOBILE_QUERY = "(max-width: 767px)";

export function browserDriver(): MediaQueryDriver {
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

export function isMobileViewport(driver: MediaQueryDriver): boolean {
  return driver.matches(MOBILE_QUERY);
}
