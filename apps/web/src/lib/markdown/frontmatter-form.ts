import {
  parseKernelMarkdown,
  serializeKernelMarkdown,
} from "@/shared/markdown.ts";

export interface FrontmatterFormValues {
  title: string;
  kind: string;
  labels: string[];
}

export interface FrontmatterFormDoc {
  values: FrontmatterFormValues;
  body: string;
  rawFrontmatter: Record<string, unknown>;
}

const FORM_KEYS = ["title", "kind", "labels"] as const;

export function readFrontmatterForm(input: string): FrontmatterFormDoc {
  const { frontmatter, body } = parseKernelMarkdown(input);
  const title = typeof frontmatter.title === "string" ? frontmatter.title : "";
  const kind = typeof frontmatter.kind === "string" ? frontmatter.kind : "";
  const labels = Array.isArray(frontmatter.labels)
    ? (frontmatter.labels.filter((l) => typeof l === "string") as string[])
    : [];
  const rawFrontmatter: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(frontmatter)) {
    if (!FORM_KEYS.includes(k as (typeof FORM_KEYS)[number])) rawFrontmatter[k] = v;
  }
  return { values: { title, kind, labels }, body, rawFrontmatter };
}

export function writeFrontmatterForm(doc: FrontmatterFormDoc): string {
  const fm: Record<string, unknown> = { ...doc.rawFrontmatter };
  const hasRaw = (k: string) =>
    Object.prototype.hasOwnProperty.call(doc.rawFrontmatter, k);
  if (doc.values.title !== "" || hasRaw("title")) fm.title = doc.values.title;
  if (doc.values.kind !== "" || hasRaw("kind")) fm.kind = doc.values.kind;
  if (doc.values.labels.length > 0 || hasRaw("labels")) fm.labels = doc.values.labels;
  return serializeKernelMarkdown({ frontmatter: fm, body: doc.body });
}
