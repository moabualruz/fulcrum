/**
 * Validate and normalize the inline-create input value before forwarding it
 * to `onCreate`. Trim whitespace; reject empty/whitespace-only titles.
 */
export function commitNewCardTitle(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}
