import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/**
 * `/palette-cmd-k` was a second standalone preview route — a route-level mock
 * of a `⌘K` workspace palette with its own `Item` type and `ITEMS` array. It
 * is a genuine duplicate of the one canonical shell palette
 * (`$lib/components/command-palette/CommandPalette.svelte`, mounted once in
 * `+layout.svelte`).
 *
 * Per `migration-strategy.md` ("Genuine duplicates collapse into one") and
 * `prd-web-command-palette-od-fidelity`, the preview route is retired. To keep
 * the value-preservation guarantee ("every old route path still resolves — no
 * 404"), `/palette-cmd-k` now 308-redirects to the workspace root `/`, where
 * the canonical palette is one `⌘K` keystroke away. Its unique behaviors —
 * Recent-above-non-recent ordering, fuzzy match, arrow-key selection — are all
 * delivered by the canonical `CommandPalette` (IA-MAP §6 Recent section + the
 * `@fulcrum/ui-kit` `command-palette` primitive's native keyboard nav).
 */
export const load: PageServerLoad = () => {
  redirect(308, "/");
};
