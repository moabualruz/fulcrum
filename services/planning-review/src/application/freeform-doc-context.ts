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
  title: string;
  breadcrumb: string;
  bodyMd: string;
  versionId?: string;
  updatedAt?: string;
  truncated: boolean;
}

export interface FreeformPlanningContext {
  traceId?: string;
  sourceRefs: Array<{ kind: "doc"; id: string }>;
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

      return {
        id: doc.id,
        title: doc.title ?? doc.name ?? "untitled",
        breadcrumb,
        bodyMd: trimmed.body,
        ...(doc.versionId ? { versionId: doc.versionId } : {}),
        ...(doc.updatedAt ? { updatedAt: doc.updatedAt } : {}),
        truncated: trimmed.truncated,
      };
    });

  return {
    ...(input.traceId ? { traceId: input.traceId } : {}),
    sourceRefs: selectedDocs.map((doc) => ({ kind: "doc", id: doc.id })),
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
      doc.versionId ? `- version_id: ${doc.versionId}` : undefined,
      doc.updatedAt ? `- updated_at: ${doc.updatedAt}` : undefined,
    ].filter((line): line is string => Boolean(line)).join("\n");
    return [
      `## Freeform Document: ${doc.breadcrumb}`,
      metadata,
      "",
      doc.bodyMd,
      doc.truncated ? "\n[truncated]" : "",
    ].join("\n").trimEnd();
  }).join("\n\n");
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
