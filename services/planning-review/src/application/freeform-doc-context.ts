import {
  buildDocumentPageTree,
  findDocumentBreadcrumbPath,
  type FulcrumDocTreePage,
} from "@knowledge-workspace/domain/document-page-tree.ts";
import { getPlanningPrompt } from "@planning-review/application/plan-session.ts";
import type { PromptRuntime } from "@planning-review/application/planning-prompts.ts";

export interface FreeformPlanningContextDoc extends FulcrumDocTreePage {
  bodyMd: string;
  versionId?: string | null;
  versionNum?: number | null;
  updatedAt?: string | null;
}

export interface FreeformPlanningContextInput {
  docs: FreeformPlanningContextDoc[];
  selectedDocIds?: string[];
  traceId?: string;
  maxDocChars?: number;
}

export interface FreeformPlanningSelectedDoc {
  id: string;
  sourceId: string;
  title: string;
  breadcrumb: string;
  bodyMd: string;
  sections: FreeformPlanningContextSection[];
  versionId?: string;
  versionNum?: number;
  updatedAt?: string;
  truncated: boolean;
}

export interface FreeformPlanningContextSection {
  id: string;
  heading: string;
  excerpt: string;
  charStart: number;
  charEnd: number;
}

export interface FreeformPlanningContext {
  traceId?: string;
  sourceRefs: Array<{ kind: "doc"; id: string; sourceId?: string; versionId?: string; versionNum?: number }>;
  selectedDocs: FreeformPlanningSelectedDoc[];
  contextMarkdown: string;
}

export interface AcpPlanningPromptWithDocsInput {
  userPrompt: string;
  context: FreeformPlanningContext;
  runtime?: PromptRuntime;
}

export function buildFreeformDocsPlanningContext(
  input: FreeformPlanningContextInput,
): FreeformPlanningContext {
  const maxDocChars = input.maxDocChars ?? 12_000;
  const tree = buildDocumentPageTree(input.docs);
  const selectedIds = input.selectedDocIds?.length
    ? input.selectedDocIds
    : flattenDocumentTreeIds(tree);
  const selectedSet = new Set(selectedIds);
  const docsById = new Map(input.docs.map((doc) => [doc.id, doc]));

  const selectedDocs = selectedIds
    .map((id) => docsById.get(id))
    .filter((doc): doc is FreeformPlanningContextDoc => doc !== undefined && selectedSet.has(doc.id))
    .map((doc) => {
      const breadcrumb = findDocumentBreadcrumbPath(tree, doc.id)
        ?.map((node) => node.name || "untitled")
        .join(" / ") || doc.title || doc.name || doc.id;
      const trimmed = truncateDocBody(doc.bodyMd, maxDocChars);
      const versionToken = doc.versionNum ? `v${doc.versionNum}` : doc.versionId ?? doc.updatedAt ?? "current";
      const sourceId = `doc:${doc.id}@${versionToken}`;

      return {
        id: doc.id,
        sourceId,
        title: doc.title ?? doc.name ?? "untitled",
        breadcrumb,
        bodyMd: trimmed.body,
        sections: extractContextSections(trimmed.body, sourceId),
        ...(doc.versionId ? { versionId: doc.versionId } : {}),
        ...(doc.versionNum ? { versionNum: doc.versionNum } : {}),
        ...(doc.updatedAt ? { updatedAt: doc.updatedAt } : {}),
        truncated: trimmed.truncated,
      };
    });

  return {
    ...(input.traceId ? { traceId: input.traceId } : {}),
    sourceRefs: selectedDocs.map((doc) => ({
      kind: "doc",
      id: doc.id,
      sourceId: doc.sourceId,
      ...(doc.versionId ? { versionId: doc.versionId } : {}),
      ...(doc.versionNum ? { versionNum: doc.versionNum } : {}),
    })),
    selectedDocs,
    contextMarkdown: renderFreeformDocsContextMarkdown(selectedDocs),
  };
}

export function buildAcpPlanningPromptWithFreeformDocs(
  input: AcpPlanningPromptWithDocsInput,
): string {
  void input.runtime;
  const traceLine = input.context.traceId ? `Trace ID: ${input.context.traceId}\n\n` : "";
  return [
    "Use the following freeform documents as planning context. Preserve their constraints, goals, and success criteria when creating the technical plan, prototype/boilerplate targets, and task breakdown.",
    "Cite context with the listed source_id values when the plan depends on a document excerpt.",
    "",
    traceLine.trimEnd(),
    "## User Request",
    "",
    input.userPrompt.trim(),
    "",
    "## Freeform Document Context",
    "",
    input.context.contextMarkdown || "_No freeform documents selected._",
    "",
    getPlanningPrompt(),
  ].filter((part) => part.length > 0).join("\n");
}

function renderFreeformDocsContextMarkdown(docs: FreeformPlanningSelectedDoc[]): string {
  return docs.map((doc) => {
    const metadata = [
      `- doc_id: ${doc.id}`,
      `- source_id: ${doc.sourceId}`,
      doc.versionId ? `- version_id: ${doc.versionId}` : undefined,
      doc.versionNum ? `- version_num: ${doc.versionNum}` : undefined,
      doc.updatedAt ? `- updated_at: ${doc.updatedAt}` : undefined,
    ].filter((line): line is string => Boolean(line)).join("\n");
    return [
      `## Freeform Document: ${doc.breadcrumb}`,
      metadata,
      "",
      "### Selected Sections",
      doc.sections.map((section) => [
        `- section_id: ${section.id}`,
        `  heading: ${section.heading}`,
        `  excerpt: ${section.excerpt}`,
      ].join("\n")).join("\n"),
      "",
      doc.bodyMd,
      doc.truncated ? "\n[truncated]" : "",
    ].join("\n").trimEnd();
  }).join("\n\n");
}

function extractContextSections(body: string, sourceId: string): FreeformPlanningContextSection[] {
  const headingPattern = /^#{1,6}\s+(.+)$/gm;
  const matches = [...body.matchAll(headingPattern)];
  if (matches.length === 0) {
    return [{
      id: `${sourceId}#section-1`,
      heading: "Document",
      excerpt: excerpt(body),
      charStart: 0,
      charEnd: body.length,
    }];
  }

  return matches.map((match, index) => {
    const headingStart = match.index ?? 0;
    const contentStart = headingStart + match[0].length;
    const nextStart = matches[index + 1]?.index ?? body.length;
    const sectionBody = body.slice(contentStart, nextStart).trim();
    return {
      id: `${sourceId}#section-${index + 1}`,
      heading: match[1]?.trim() || `Section ${index + 1}`,
      excerpt: excerpt(sectionBody || match[0]),
      charStart: headingStart,
      charEnd: nextStart,
    };
  });
}

function excerpt(value: string, maxChars = 240): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 12)).trimEnd()} [truncated]`;
}

function truncateDocBody(body: string, maxChars: number): { body: string; truncated: boolean } {
  if (body.length <= maxChars) {
    return { body, truncated: false };
  }
  return { body: body.slice(0, Math.max(0, maxChars)), truncated: true };
}

function flattenDocumentTreeIds(tree: ReturnType<typeof buildDocumentPageTree>): string[] {
  const ids: string[] = [];
  for (const node of tree) {
    ids.push(node.id);
    ids.push(...flattenDocumentTreeIds(node.children));
  }
  return ids;
}
