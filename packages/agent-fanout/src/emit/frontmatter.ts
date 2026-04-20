// Narrow `frontmatter.description` to a string. Canonical frontmatter is typed as
// Record<string, unknown>; a skill could legally have a non-string description
// (YAML tolerates numbers, bools, objects). Emitters must downgrade to an empty
// string rather than serialize an object into YAML via matter.stringify.
export function readDescription(frontmatter: Record<string, unknown>): string {
  const value = frontmatter.description
  return typeof value === 'string' ? value : ''
}
