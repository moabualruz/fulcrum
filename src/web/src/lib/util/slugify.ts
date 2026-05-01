/**
 * Convert a free-form name into a project slug that matches the
 * `^[a-z0-9][a-z0-9-]{0,63}$` shape used by the active-project module.
 *
 * Rules:
 *   - Lowercase
 *   - Strip leading/trailing whitespace
 *   - Collapse runs of whitespace + ASCII punctuation into a single hyphen
 *   - Map common Latin-extended diacritics to ASCII (é → e, ü → u, ß → ss).
 *   - Strip any character that is not [a-z0-9-]
 *   - Collapse runs of hyphens
 *   - Trim leading/trailing hyphens
 *   - Trim to 64 characters max
 *   - Returns "" for empty/whitespace-only input AND for input that
 *     produces an empty result after the rules.
 *   - If the first character would be a hyphen after the above (impossible
 *     in normal cases since leading hyphens are trimmed), return "".
 */
export function slugify(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (trimmed === "") return "";
  const mapped = trimmed.replace(/ß/g, "ss");
  const ascii = mapped.normalize("NFKD").replace(/\p{Diacritic}/gu, "");
  const hyphened = ascii.replace(/[^a-z0-9]+/g, "-");
  const collapsed = hyphened.replace(/-+/g, "-").replace(/^-|-$/g, "");
  const truncated = collapsed.slice(0, 64).replace(/-+$/, "");
  if (truncated === "" || truncated.startsWith("-")) return "";
  return truncated;
}
