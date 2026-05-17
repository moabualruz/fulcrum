import { parse, stringify } from "yaml";

export interface KernelMarkdown {
  frontmatter: Record<string, unknown>;
  body: string;
}

const FRONTMATTER = /^---\n([\s\S]*?)\n---\n?/;

export function parseKernelMarkdown(input: string): KernelMarkdown {
  const match = input.match(FRONTMATTER);
  if (!match) return { frontmatter: {}, body: input };
  return {
    frontmatter: (parse(match[1] ?? "") ?? {}) as Record<string, unknown>,
    body: input.slice(match[0].length),
  };
}

export function serializeKernelMarkdown(doc: KernelMarkdown): string {
  if (Object.keys(doc.frontmatter).length === 0) return doc.body;
  const yaml = stringify(doc.frontmatter).trimEnd();
  const separator = doc.body.startsWith("\n") ? "" : "\n";
  return `---\n${yaml}\n---\n${separator}${doc.body}`;
}
