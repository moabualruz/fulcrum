import { error, fail, redirect } from "@sveltejs/kit";
import { createDocumentApiForEvent } from "$lib/server/document-api";
import { renderDocMarkdownToHtml } from "./doc-render.ts";

interface LoadEvent {
  params: { id: string };
  locals: App.Locals & { activeProjectId?: string | null };
  fetch: typeof fetch;
  request: Request;
  url: URL;
}

interface ActionEvent {
  params: { id: string };
  locals: App.Locals;
  fetch: typeof fetch;
  request: Request;
  url: URL;
}

interface PublicDocument {
  id: string;
  orgId?: string;
  org_id?: string;
  projectId?: string | null;
  project_id?: string | null;
  type?: string;
  docType?: string;
  title: string;
  bodyMd?: string;
  body_md?: string;
  frontmatter?: Record<string, unknown>;
  updatedAt?: string;
  updated_at?: string;
}

interface PublicBacklink {
  fromDocId?: string;
  from_doc_id?: string;
  id?: string;
  title?: string;
}

interface PublicComment {
  id: string;
  bodyMd?: string;
  body_md?: string;
  authorId?: string;
  author_id?: string;
  parentCommentId?: string | null;
  parent_comment_id?: string | null;
  resolved?: boolean;
  status?: string;
}

interface PublicAttachment {
  id: string;
  fileName?: string;
  file_name?: string;
  mimeType?: string;
  mime_type?: string;
  sizeBytes?: number | string;
  size_bytes?: number | string;
  storagePath?: string;
  storage_path?: string;
}

export const load = (event: LoadEvent) => ({
  activeProjectId: event.locals?.activeProjectId ?? null,
  streamed: {
    data: (async () => {
      const { params } = event;
      const api = createDocumentApiForEvent(event);
      const doc = await api.docs.get({ id: params.id }).catch(mapDocumentNotFound) as PublicDocument;
      const body = doc.bodyMd ?? doc.body_md ?? "";
      const docResult = {
        doc: {
          id: doc.id,
          org_id: doc.orgId ?? doc.org_id ?? "",
          project_id: doc.projectId ?? doc.project_id ?? null,
          kind: doc.docType ?? doc.type ?? "note",
          title: doc.title,
          body,
          renderedHtml: renderDocMarkdownToHtml(body),
          frontmatter: doc.frontmatter ?? {},
          updated_at: doc.updatedAt ?? doc.updated_at ?? "",
        },
      };
      const backlinks = ((await api.docs.listBacklinks({ id: params.id })) as PublicBacklink[]).map((backlink) => ({
        id: backlink.fromDocId ?? backlink.from_doc_id ?? backlink.id ?? "",
        title: backlink.title,
        href: `/docs/${backlink.fromDocId ?? backlink.from_doc_id ?? backlink.id ?? ""}`,
      }));
      const comments = ((await api.docs.listComments({ id: params.id })) as PublicComment[]).map((comment) => ({
        id: comment.id,
        bodyMd: comment.bodyMd ?? comment.body_md ?? "",
        authorId: comment.authorId ?? comment.author_id ?? "",
        parentCommentId: comment.parentCommentId ?? comment.parent_comment_id ?? null,
        resolved: comment.resolved === true || comment.status === "resolved",
      }));
      const attachments = ((await api.docs.listAttachments({ id: params.id })) as PublicAttachment[]).map((attachment) => {
        const storagePath = attachment.storagePath ?? attachment.storage_path ?? "";
        return {
          id: attachment.id,
          fileName: attachment.fileName ?? attachment.file_name ?? "",
          mimeType: attachment.mimeType ?? attachment.mime_type ?? "",
          sizeBytes: Number(attachment.sizeBytes ?? attachment.size_bytes ?? 0),
          href: attachmentHref(storagePath),
        };
      });
      return { ...docResult, backlinks, comments, attachments };
    })(),
  },
});

export const actions = {
  delete: async (event: ActionEvent) => {
    await createDocumentApiForEvent(event).docs.delete({ id: event.params.id! }).catch(mapDocumentNotFound);
    throw redirect(303, "/docs");
  },
  createComment: async (event: ActionEvent) => {
    const form = await event.request.formData();
    const bodyMd = String(form.get("bodyMd") ?? "").trim();
    const parentCommentId = String(form.get("parentCommentId") ?? "").trim();
    const authorId = readAuthorId(event.locals);
    if (!bodyMd) return fail(400, { message: "Comment body is required." });
    if (!authorId) return fail(400, { message: "Comment author is required." });

    await createDocumentApiForEvent(event).docs.createComment({
      id: event.params.id!,
      authorId,
      bodyMd,
      parentCommentId: parentCommentId || undefined,
    }).catch(mapDocumentNotFound);
    throw redirect(303, `/docs/${event.params.id}`);
  },
  resolveComment: async (event: ActionEvent) => {
    const form = await event.request.formData();
    const commentId = String(form.get("commentId") ?? "").trim();
    if (!commentId) return fail(400, { message: "Comment id is required." });

    await createDocumentApiForEvent(event).docs.resolveComment({
      commentId,
      resolved: true,
    }).catch(mapDocumentNotFound);
    throw redirect(303, `/docs/${event.params.id}`);
  },
};

function mapDocumentNotFound(errorValue: unknown): never {
  const message = errorValue instanceof Error ? errorValue.message : String(errorValue);
  if (/not found/i.test(message)) throw error(404, "Document not found");
  throw errorValue;
}

function readAuthorId(locals: App.Locals): string | null {
  const candidate = locals as App.Locals & { userId?: unknown; user?: { id?: unknown } };
  if (typeof candidate.userId === "string" && candidate.userId.length > 0) return candidate.userId;
  if (typeof candidate.user?.id === "string" && candidate.user.id.length > 0) return candidate.user.id;
  return null;
}

function attachmentHref(storagePath: string): string {
  if (!storagePath) return "#";
  if (/^https?:\/\//.test(storagePath) || storagePath.startsWith("/")) return storagePath;
  return `/${storagePath.replace(/^\/+/, "")}`;
}
