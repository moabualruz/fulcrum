import { randomUUID } from "node:crypto";
import type { EntityManager } from "typeorm";

import { AppNotFoundError, AppValidationError } from "@platform-core/domain/errors.ts";
import { appendEventOrm } from "@platform-core/application/orm-helpers.ts";
import {
  buildReviewWorkbenchModel,
  type ReviewWorkbenchInput,
  type ReviewWorkbenchModel,
} from "@planning-review/application/reviews/review-workbench.ts";
import type { CodeReviewAnnotation } from "@planning-review/application/reviews/shared/review-feedback.ts";

export type ReviewWorkbenchSessionType = "plan" | "uat" | "code_review";
export type ReviewWorkbenchSessionStatus = "saved" | "loaded" | "annotated";

export interface ReviewWorkbenchSessionContext {
  orgId: string;
  userId: string | null;
  projectId?: string | null;
}

export interface SaveReviewWorkbenchSessionInput extends ReviewWorkbenchInput {
  projectId: string;
  reviewId?: string;
  reviewType?: ReviewWorkbenchSessionType;
  title?: string;
}

export interface LoadReviewWorkbenchSessionInput {
  projectId: string;
  reviewId?: string;
  traceId?: string;
  selectedFilePath?: string | null;
  viewedFilePaths?: string[];
  hideViewedFiles?: boolean;
  searchQuery?: string;
  activeSearchMatchId?: string | null;
}

export interface AppendReviewWorkbenchAnnotationInput {
  projectId: string;
  reviewId?: string;
  traceId?: string;
  annotationId?: string;
  type?: "comment" | "suggestion" | "concern";
  scope?: "line" | "file";
  filePath: string;
  lineStart: number;
  lineEnd: number;
  side?: "old" | "new";
  text?: string;
  suggestedCode?: string;
  originalCode?: string;
  severity?: "important" | "nit" | "pre_existing";
  conventionalLabel?: string;
  decorations?: Array<"blocking" | "non-blocking" | "if-minor">;
  author?: string;
  source?: string;
  createdAt?: number;
  selectedFilePath?: string | null;
  viewedFilePaths?: string[];
  hideViewedFiles?: boolean;
  searchQuery?: string;
  activeSearchMatchId?: string | null;
}

export interface ReviewWorkbenchSessionOutput {
  projectId: string;
  traceId?: string;
  reviewId: string;
  reviewType: ReviewWorkbenchSessionType;
  title?: string;
  status: ReviewWorkbenchSessionStatus;
  revision: number;
  eventId: string;
  model: ReviewWorkbenchModel;
}

interface StoredReviewWorkbenchSession {
  projectId: string;
  traceId?: string;
  reviewId: string;
  reviewType: ReviewWorkbenchSessionType;
  title?: string;
  revision: number;
  workbenchInput: ReviewWorkbenchInput & { viewedFilePaths?: string[] };
}

interface ReviewSessionEventRow {
  id: string;
  payload: Record<string, unknown> | string | null;
}

export async function saveReviewWorkbenchSession(
  em: EntityManager,
  ctx: ReviewWorkbenchSessionContext,
  input: SaveReviewWorkbenchSessionInput,
): Promise<ReviewWorkbenchSessionOutput> {
  if (!input.projectId) throw new AppValidationError("projectId is required for review sessions.");
  if (input.files.length === 0) throw new AppValidationError("At least one review file is required.");
  const reviewType = input.reviewType ?? "code_review";
  const reviewId = input.reviewId?.trim() || sessionId(reviewType, input.projectId, input.traceId);
  const revision = await nextRevision(em, ctx.orgId, input.projectId, reviewId);
  const workbenchInput = normalizeWorkbenchInput({ ...input, reviewId });
  const model = buildReviewWorkbenchModel(workbenchInput);
  const event = await appendEventOrm(em, {
    orgId: ctx.orgId,
    projectId: input.projectId,
    actor: ctx.userId ?? "system",
    subjectKind: "review_session",
    subjectId: reviewId,
    verb: "review_session_saved",
    payload: {
      traceId: input.traceId ?? null,
      reviewId,
      reviewType,
      title: input.title ?? null,
      revision,
      fileCount: workbenchInput.files.length,
      annotationCount: workbenchInput.annotations.length,
      visibleFileCount: model.summary.visibleFileCount,
      blockingAnnotationCount: model.summary.blockingAnnotationCount,
      suggestionCount: model.summary.suggestionCount,
      workbenchInput,
    },
  });

  return {
    projectId: input.projectId,
    ...(input.traceId ? { traceId: input.traceId } : {}),
    reviewId,
    reviewType,
    ...(input.title ? { title: input.title } : {}),
    status: "saved",
    revision,
    eventId: event.id,
    model,
  };
}

export async function loadReviewWorkbenchSession(
  em: EntityManager,
  ctx: ReviewWorkbenchSessionContext,
  input: LoadReviewWorkbenchSessionInput,
): Promise<ReviewWorkbenchSessionOutput> {
  if (!input.reviewId && !input.traceId) {
    throw new AppValidationError("reviewId or traceId is required to load a review session.");
  }
  const row = await loadLatestSessionEvent(em, ctx.orgId, input);
  if (!row) {
    throw new AppNotFoundError("Review session not found.");
  }

  const session = parseStoredSession(row.payload);
  const workbenchInput = normalizeWorkbenchInput({
    ...session.workbenchInput,
    projectId: input.projectId,
    traceId: session.traceId,
    reviewId: session.reviewId,
    selectedFilePath: input.selectedFilePath ?? session.workbenchInput.selectedFilePath,
    viewedFilePaths: input.viewedFilePaths ?? session.workbenchInput.viewedFilePaths,
    hideViewedFiles: input.hideViewedFiles ?? session.workbenchInput.hideViewedFiles,
    searchQuery: input.searchQuery ?? session.workbenchInput.searchQuery,
    activeSearchMatchId: input.activeSearchMatchId ?? session.workbenchInput.activeSearchMatchId,
  });
  const model = buildReviewWorkbenchModel(workbenchInput);

  return {
    projectId: input.projectId,
    ...(session.traceId ? { traceId: session.traceId } : {}),
    reviewId: session.reviewId,
    reviewType: session.reviewType,
    ...(session.title ? { title: session.title } : {}),
    status: "loaded",
    revision: session.revision,
    eventId: row.id,
    model,
  };
}

export async function appendReviewWorkbenchAnnotation(
  em: EntityManager,
  ctx: ReviewWorkbenchSessionContext,
  input: AppendReviewWorkbenchAnnotationInput,
): Promise<ReviewWorkbenchSessionOutput> {
  if (!input.reviewId && !input.traceId) {
    throw new AppValidationError("reviewId or traceId is required to append a review annotation.");
  }
  if (!input.filePath.trim()) throw new AppValidationError("filePath is required for review annotations.");
  if (!Number.isInteger(input.lineStart) || !Number.isInteger(input.lineEnd) || input.lineStart < 1 || input.lineEnd < input.lineStart) {
    throw new AppValidationError("lineStart and lineEnd must describe a valid review annotation range.");
  }
  if (!input.text?.trim() && !input.suggestedCode?.trim()) {
    throw new AppValidationError("Review annotation requires text or suggestedCode.");
  }

  const row = await loadLatestSessionEvent(em, ctx.orgId, input);
  if (!row) throw new AppNotFoundError("Review session not found.");

  const session = parseStoredSession(row.payload);
  const fileExists = session.workbenchInput.files.some((file) => file.path === input.filePath);
  if (!fileExists) {
    throw new AppValidationError(`Review annotation file is not in the session diff: ${input.filePath}`);
  }

  const annotation: CodeReviewAnnotation = {
    id: input.annotationId?.trim() || randomUUID(),
    type: input.type ?? (input.suggestedCode ? "suggestion" : "comment"),
    scope: input.scope ?? "line",
    filePath: input.filePath,
    lineStart: input.lineStart,
    lineEnd: input.lineEnd,
    side: input.side ?? "new",
    ...(input.text?.trim() ? { text: input.text.trim() } : {}),
    ...(input.suggestedCode?.trim() ? { suggestedCode: input.suggestedCode } : {}),
    ...(input.originalCode?.trim() ? { originalCode: input.originalCode } : {}),
    ...(input.severity ? { severity: input.severity } : {}),
    ...(input.conventionalLabel?.trim() ? { conventionalLabel: input.conventionalLabel.trim() } : {}),
    ...(input.decorations?.length ? { decorations: input.decorations } : {}),
    author: input.author?.trim() || ctx.userId || "system",
    source: input.source?.trim() || "fulcrum-review-session",
    createdAt: input.createdAt ?? Date.now(),
  };

  const workbenchInput = normalizeWorkbenchInput({
    ...session.workbenchInput,
    projectId: input.projectId,
    traceId: session.traceId,
    reviewId: session.reviewId,
    annotations: [...session.workbenchInput.annotations, annotation],
    selectedFilePath: input.selectedFilePath ?? input.filePath,
    viewedFilePaths: input.viewedFilePaths ?? session.workbenchInput.viewedFilePaths,
    hideViewedFiles: input.hideViewedFiles ?? session.workbenchInput.hideViewedFiles,
    searchQuery: input.searchQuery ?? session.workbenchInput.searchQuery,
    activeSearchMatchId: input.activeSearchMatchId ?? session.workbenchInput.activeSearchMatchId,
  });
  const model = buildReviewWorkbenchModel(workbenchInput);
  const revision = await nextRevision(em, ctx.orgId, input.projectId, session.reviewId);
  const event = await appendEventOrm(em, {
    orgId: ctx.orgId,
    projectId: input.projectId,
    actor: ctx.userId ?? "system",
    subjectKind: "review_session",
    subjectId: session.reviewId,
    verb: "review_session_annotation_added",
    payload: {
      traceId: session.traceId ?? null,
      reviewId: session.reviewId,
      reviewType: session.reviewType,
      title: session.title ?? null,
      revision,
      fileCount: workbenchInput.files.length,
      annotationCount: workbenchInput.annotations.length,
      visibleFileCount: model.summary.visibleFileCount,
      blockingAnnotationCount: model.summary.blockingAnnotationCount,
      suggestionCount: model.summary.suggestionCount,
      addedAnnotationId: annotation.id,
      workbenchInput,
    },
  });

  return {
    projectId: input.projectId,
    ...(session.traceId ? { traceId: session.traceId } : {}),
    reviewId: session.reviewId,
    reviewType: session.reviewType,
    ...(session.title ? { title: session.title } : {}),
    status: "annotated",
    revision,
    eventId: event.id,
    model,
  };
}

function normalizeWorkbenchInput(input: SaveReviewWorkbenchSessionInput | (ReviewWorkbenchInput & { viewedFilePaths?: string[] })): ReviewWorkbenchInput & { viewedFilePaths?: string[] } {
  return {
    projectId: input.projectId,
    traceId: input.traceId,
    reviewId: input.reviewId,
    files: input.files,
    annotations: input.annotations,
    selectedFilePath: input.selectedFilePath,
    viewedFilePaths: Array.from(input.viewedFilePaths ?? []),
    hideViewedFiles: input.hideViewedFiles,
    searchQuery: input.searchQuery,
    activeSearchMatchId: input.activeSearchMatchId,
    liveLog: input.liveLog,
    editorAnnotations: input.editorAnnotations,
    currentPrUrl: input.currentPrUrl,
    currentPrMeta: input.currentPrMeta,
  };
}

async function nextRevision(
  em: EntityManager,
  orgId: string,
  projectId: string,
  reviewId: string,
): Promise<number> {
  const rows = await em.query<Array<{ revision: number | string | null }>>(
    `select coalesce(max((payload->>'revision')::int), 0) as revision
       from events
      where org_id = $1
        and project_id = $2
        and subject_kind = 'review_session'
        and subject_id = $3`,
    [orgId, projectId, reviewId],
  );
  return Number(rows[0]?.revision ?? 0) + 1;
}

async function loadLatestSessionEvent(
  em: EntityManager,
  orgId: string,
  input: LoadReviewWorkbenchSessionInput,
): Promise<ReviewSessionEventRow | null> {
  const params: string[] = [orgId, input.projectId];
  const filters: string[] = [];
  if (input.reviewId) {
    params.push(input.reviewId);
    filters.push("subject_id = ?");
  }
  if (input.traceId) {
    params.push(input.traceId);
    filters.push("payload->>'traceId' = ?");
  }
  const rows = await em.query(`select id, payload
       from events
      where org_id = ?
        and project_id = ?
        and subject_kind = 'review_session'
        and verb in ('review_session_saved', 'review_session_annotation_added')
        and (${filters.join(" or ")})
      order by (payload->>'revision')::int desc, created_at desc
      limit 1`, params, );
  return rows[0] ?? null;
}

function parseStoredSession(payload: ReviewSessionEventRow["payload"]): StoredReviewWorkbenchSession {
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (!parsed || typeof parsed !== "object") {
    throw new AppValidationError("Review session payload is missing.");
  }
  const workbenchInput = (parsed as Record<string, unknown>)["workbenchInput"];
  if (!workbenchInput || typeof workbenchInput !== "object") {
    throw new AppValidationError("Review session payload has no workbench input.");
  }
  const reviewId = stringValue(parsed, "reviewId");
  const projectId = stringValue(parsed, "projectId") || stringValue(workbenchInput, "projectId");
  const revision = Number((parsed as Record<string, unknown>)["revision"] ?? 1);
  if (!projectId) throw new AppValidationError("Review session payload has no project id.");
  if (!reviewId) throw new AppValidationError("Review session payload has no review id.");

  return {
    projectId,
    traceId: stringValue(parsed, "traceId") || undefined,
    reviewId,
    reviewType: reviewTypeValue((parsed as Record<string, unknown>)["reviewType"]),
    title: stringValue(parsed, "title") || undefined,
    revision,
    workbenchInput: workbenchInput as StoredReviewWorkbenchSession["workbenchInput"],
  };
}

function reviewTypeValue(value: unknown): ReviewWorkbenchSessionType {
  return value === "plan" || value === "uat" || value === "code_review" ? value : "code_review";
}

function stringValue(source: unknown, key: string): string {
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function sessionId(kind: ReviewWorkbenchSessionType, projectId: string, traceId?: string): string {
  return `${kind}-${slug(traceId || projectId)}`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "review";
}
