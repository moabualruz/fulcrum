import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/**
 * `mobile-capture` was a mislabeled route: it rendered a Core-Web-Vitals /
 * performance-instrumentation page (LCP/INP/CLS metrics, telemetry send state,
 * long-task counter) plus an embedded task-create tray — not the OD mobile
 * Capture editor. Its current content is preserved verbatim under
 * `_migrated-content/+page.svelte.preserved` so the route-rebuild PRD
 * `prd-web-capture-stage-shell` can re-home the perf metrics into Operate
 * telemetry and the task-create tray into Build without feature loss. Per
 * `migration-strategy.md`, the real mobile Capture editor is a responsive
 * state of `/<ws>/projects/<projId>/capture/<docId>`, not a standalone route.
 *
 * Until that PRD ships, the old `/mobile-capture` path resolves via a 308
 * permanent redirect to `/cross-cutting-perf` (the existing perf route named
 * by `capture.md` as the re-home home for the Core-Web-Vitals content).
 * See `_migrated-content/MIGRATION.md`.
 */
export const load: PageServerLoad = () => {
  redirect(308, "/cross-cutting-perf");
};
