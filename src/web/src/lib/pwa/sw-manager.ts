/**
 * Service-worker manager for the pwa-offline feature gate.
 *
 * C1: all behaviour gated behind FULCRUM_FEATURES=pwa-offline.
 * When flag is OFF: no SW registration, no side effects.
 */

/** Returns true when pwa-offline feature is active. */
export function isPwaEnabled(): boolean {
  // Supports both browser (import.meta.env) and test (process.env) contexts.
  const features =
    (typeof process !== "undefined" ? process.env["FULCRUM_FEATURES"] : undefined) ??
    (typeof import.meta !== "undefined" ? (import.meta.env as Record<string, string> | undefined)?.["FULCRUM_FEATURES"] : undefined) ??
    "";
  return features.split(",").map((s) => s.trim()).includes("pwa-offline");
}

export type SWRegistration = ServiceWorkerRegistration | null;

/**
 * Register the PWA service worker.
 * Returns null (no-op) when pwa-offline flag is OFF or when
 * navigator.serviceWorker is unavailable (SSR).
 */
export async function registerSW(): Promise<SWRegistration> {
  if (!isPwaEnabled()) return null;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return registration;
  } catch (err) {
    console.warn("[pwa] SW registration failed:", err);
    return null;
  }
}
