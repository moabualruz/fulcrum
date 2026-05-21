import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/**
 * `/palette` was a standalone preview route: a route-level mock of a
 * permission-aware command palette. It is a genuine duplicate of the one
 * canonical shell palette (`$lib/components/command-palette/CommandPalette.svelte`,
 * mounted once in `+layout.svelte` and opened with `⌘K` from any route).
 *
 * Per `migration-strategy.md` ("Genuine duplicates collapse into one") and
 * `prd-web-command-palette-od-fidelity`, the preview route is retired. To keep
 * the value-preservation guarantee ("every old route path still resolves: no
 * 404"), `/palette` now 308-redirects to the workspace root `/`, where the
 * canonical palette is one `⌘K` keystroke away. No palette behavior is lost:
 * the permission-aware action set, federated search, and Scope-awareness now
 * live in the canonical `CommandPalette` rendered by the shell.
 */
export const load: PageServerLoad = () => {
  redirect(308, "/");
};
