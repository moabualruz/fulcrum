/**
 * Helpers for the comma-separated `labels` field on the document form.
 *
 * The DB stores `frontmatter.labels` as `string[]`; the form input is a
 * single text field. These two functions are the boundary mapping —
 * `parseLabels` reads user input, `serializeLabels` re-renders the array
 * back into the form when seeding `superValidate` from a stored doc.
 */
export function parseLabels(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function serializeLabels(labels: readonly string[]): string {
  return labels.join(", ");
}
