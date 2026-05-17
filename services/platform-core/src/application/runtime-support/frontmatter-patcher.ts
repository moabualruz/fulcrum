function quoteYamlScalarLike(previous: string | undefined, value: string): string {
  const escapedDouble = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const escapedSingle = value.replace(/'/g, "''");
  if (previous?.startsWith("'")) return `'${escapedSingle}'`;
  return `"${escapedDouble}"`;
}

export function patchFrontmatterKey(source: string, key: string, value: string): string {
  if (!source.startsWith("---\n")) {
    throw new Error("frontmatter patch requires opening delimiter");
  }

  const closeIndex = source.indexOf("\n---", 4);
  if (closeIndex === -1) {
    throw new Error("frontmatter patch requires closing delimiter");
  }

  const frontmatter = source.slice(4, closeIndex);
  const body = source.slice(closeIndex);
  const pattern = new RegExp(`(^|\\n)([ \\t]*)${key.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}:(.*)(?=\\n|$)`);
  const match = frontmatter.match(pattern);

  if (match?.index !== undefined) {
    const leadingNewline = match[1] ?? "";
    const indent = match[2] ?? "";
    const lineStart = match.index + leadingNewline.length;
    const lineEnd = frontmatter.indexOf("\n", lineStart);
    const end = lineEnd === -1 ? frontmatter.length : lineEnd;
    const currentLine = frontmatter.slice(lineStart, end);
    const currentValue = currentLine.slice(currentLine.indexOf(":") + 1).trim();
    const replacement = `${indent}${key}: ${quoteYamlScalarLike(currentValue, value)}`;
    return `---\n${frontmatter.slice(0, lineStart)}${replacement}${frontmatter.slice(end)}${body}`;
  }

  return `---\n${frontmatter}\n${key}: ${quoteYamlScalarLike(undefined, value)}${body}`;
}
