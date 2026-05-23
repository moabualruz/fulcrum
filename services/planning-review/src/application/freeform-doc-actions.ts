import type { EntityManager } from "typeorm";

import { createDoc } from "@knowledge-workspace/application/docs/commands.ts";
import { listDocumentVersions } from "@knowledge-workspace/application/docs/version-queries.ts";
import { getDoc, listDocs } from "@knowledge-workspace/application/docs/queries.ts";
import type { AppContext, DocDto } from "@knowledge-workspace/application/docs/types.ts";
import { appendEventOrm } from "@platform-core/application/orm-helpers.ts";
import {
  buildAcpPlanningPromptWithFreeformDocs,
  buildFreeformDocsPlanningContext,
  type FreeformPlanningContext,
  type FreeformPlanningContextDoc,
} from "@planning-review/application/freeform-doc-context.ts";

export interface BuildFreeformPlanningPromptFromDocsInput {
  userPrompt: string;
  selectedDocIds?: string[];
  traceId?: string;
  maxDocChars?: number;
}

export interface FreeformPlanningPromptFromDocsResult {
  context: FreeformPlanningContext;
  prompt: string;
}

export interface StartFreeformWorkFromDocsInput {
  title: string;
  bodyMd: string;
  userPrompt: string;
  projectId?: string | null;
  parentId?: string | null;
  traceId?: string;
  acpSessionId?: string;
  modeId?: string;
  modelId?: string;
  maxDocChars?: number;
}

export interface StartFreeformWorkFromDocsResult extends FreeformPlanningPromptFromDocsResult {
  status: "ready_for_planning";
  document: DocDto;
  eventId: string;
}

export async function buildFreeformPlanningPromptFromDocs(
  em: EntityManager,
  ctx: AppContext,
  input: BuildFreeformPlanningPromptFromDocsInput,
): Promise<FreeformPlanningPromptFromDocsResult> {
  const docs = await loadPlanningContextDocs(em, ctx, input.selectedDocIds);
  const context = buildFreeformDocsPlanningContext({
    docs: await Promise.all(docs.map((doc) => mapDocDtoToPlanningContextDoc(em, doc))),
    selectedDocIds: input.selectedDocIds,
    traceId: input.traceId,
    maxDocChars: input.maxDocChars,
  });
  return {
    context,
    prompt: buildAcpPlanningPromptWithFreeformDocs({
      userPrompt: input.userPrompt,
      context,
    }),
  };
}

export async function startFreeformWorkFromDocs(
  em: EntityManager,
  ctx: AppContext,
  input: StartFreeformWorkFromDocsInput,
): Promise<StartFreeformWorkFromDocsResult> {
  const projectId = input.projectId ?? ctx.projectId ?? null;
  const document = await createDoc(em, { ...ctx, projectId }, {
    title: input.title,
    bodyMd: input.bodyMd,
    parentId: input.parentId ?? null,
    projectId,
    scope: projectId ? "project" : "global",
    docType: "scratch",
    frontmatter: {
      workflowKind: "freeform_work_intake",
      traceId: input.traceId,
      acpSessionId: input.acpSessionId,
      modeId: input.modeId,
      modelId: input.modelId,
    },
    source: input.traceId ? { kind: "trace", id: input.traceId } : undefined,
  });
  const planning = await buildFreeformPlanningPromptFromDocs(em, { ...ctx, projectId }, {
    userPrompt: input.userPrompt,
    selectedDocIds: [document.id],
    traceId: input.traceId,
    maxDocChars: input.maxDocChars,
  });
  const event = await appendEventOrm(em, {
    orgId: ctx.orgId,
    projectId,
    actor: "system",
    subjectKind: "document",
    subjectId: document.id,
    verb: "freeform_work_started",
    payload: {
      traceId: input.traceId,
      documentId: document.id,
      title: document.title,
      userPrompt: input.userPrompt,
      acpSessionId: input.acpSessionId,
      modeId: input.modeId,
      modelId: input.modelId,
      sourceRefs: planning.context.sourceRefs,
    },
  });

  return {
    status: "ready_for_planning",
    document,
    eventId: event.id,
    ...planning,
  };
}

async function loadPlanningContextDocs(
  em: EntityManager,
  ctx: AppContext,
  selectedDocIds?: string[],
): Promise<DocDto[]> {
  const docs = await listDocs(em, ctx, { archived: false, limit: 500 });
  if (!selectedDocIds?.length) return docs;

  const docsById = new Map(docs.map((doc) => [doc.id, doc]));
  for (const docId of selectedDocIds) {
    if (docsById.has(docId)) continue;
    const selected = await getDoc(em, ctx, docId);
    if (selected) docsById.set(selected.id, selected);
  }
  return [...docsById.values()];
}

async function mapDocDtoToPlanningContextDoc(em: EntityManager, doc: DocDto): Promise<FreeformPlanningContextDoc> {
  const latestVersion = (await listDocumentVersions(em, doc.id))[0];
  return {
    id: doc.id,
    slugId: doc.slug,
    title: doc.title,
    name: doc.title,
    bodyMd: doc.bodyMd,
    parentId: doc.parentId,
    sortPosition: String(doc.sortPosition),
    projectId: doc.projectId,
    versionId: latestVersion?.id,
    versionNum: latestVersion?.version,
    updatedAt: doc.updatedAt.toISOString(),
  };
}
