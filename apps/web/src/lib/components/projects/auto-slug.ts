import { slugify } from "$lib/util/slugify";

/**
 * Decide what the slug field should be when the name input changes.
 *
 * Behaviour: if the user has not manually edited the slug field
 * (`slugTouched === false`), keep it auto-derived from the name via
 * `slugify`. If they have, leave whatever value they typed alone.
 *
 * Pulled out of `ProjectForm.svelte` so it can be unit-tested without an
 * SSR/DOM harness — the component delegates to this on every name keystroke.
 */
export function deriveAutoSlug(
  name: string,
  currentSlug: string,
  slugTouched: boolean,
): string {
  if (slugTouched) return currentSlug;
  return slugify(name);
}
