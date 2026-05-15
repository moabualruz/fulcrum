export interface DocumentApiEnvironment {
  FULCRUM_SERVER_URL?: string;
  FULCRUM_PUBLIC_API_URL?: string;
  FULCRUM_ORG_ID?: string;
}

export interface DocumentApiClientOptions {
  baseUrl: string;
  orgId?: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
}

type JsonRecord = Record<string, unknown>;

export function createDocumentApiCaller(options: DocumentApiClientOptions) {
  const request = documentRequest(options);
  return {
    docs: {
      list: async (input: JsonRecord = {}) =>
        await request("/api/v1/docs", { method: "GET", query: documentListQuery(options, input) }),
      create: async (input: JsonRecord) =>
        await request("/api/v1/docs", { method: "POST", body: documentBody(input) }),
      listTemplates: async (input: JsonRecord = {}) =>
        await request("/api/v1/docs/templates", {
          method: "GET",
          query: compact({ projectId: input.projectId ?? input.project_id }),
        }),
      resolveTemplate: async (input: JsonRecord = {}) =>
        await request("/api/v1/docs/templates/resolve", {
          method: "GET",
          query: compact({
            projectId: input.projectId ?? input.project_id,
            docType: input.docType ?? input.doc_type,
          }),
        }),
      get: async (input: JsonRecord & { id: string }) =>
        await request(`/api/v1/docs/${encodeURIComponent(input.id)}`, { method: "GET" }),
      update: async (input: JsonRecord & { id: string }) => {
        const { id, ...body } = input;
        return await request(`/api/v1/docs/${encodeURIComponent(id)}`, { method: "PATCH", body: documentBody(body) });
      },
      delete: async (input: JsonRecord & { id: string }) =>
        await request(`/api/v1/docs/${encodeURIComponent(input.id)}`, { method: "DELETE" }),
      listComments: async (input: JsonRecord & { id?: string; docId?: string }) =>
        await request(`/api/v1/docs/${encodeURIComponent(requiredId(input))}/comments`, {
          method: "GET",
          query: compact({ resolved: input.resolved }),
        }),
      createComment: async (input: JsonRecord & { id?: string; docId?: string }) =>
        await request(`/api/v1/docs/${encodeURIComponent(requiredId(input))}/comments`, {
          method: "POST",
          body: commentBody(input),
        }),
      updateComment: async (input: JsonRecord & { id?: string; commentId?: string }) =>
        await request(`/api/v1/docs/comments/${encodeURIComponent(requiredCommentId(input))}`, {
          method: "PATCH",
          body: commentPatchBody(input),
        }),
      resolveComment: async (input: JsonRecord & { id?: string; commentId?: string }) =>
        await request(`/api/v1/docs/comments/${encodeURIComponent(requiredCommentId(input))}/resolve`, {
          method: "PATCH",
          body: compact({ resolved: input.resolved }),
        }),
      deleteComment: async (input: JsonRecord & { id?: string; commentId?: string }) =>
        await request(`/api/v1/docs/comments/${encodeURIComponent(requiredCommentId(input))}`, { method: "DELETE" }),
      listAttachments: async (input: JsonRecord & { id?: string; docId?: string }) =>
        await request(`/api/v1/docs/${encodeURIComponent(requiredId(input))}/attachments`, { method: "GET" }),
      createAttachment: async (input: JsonRecord & { id?: string; docId?: string }) =>
        await request(`/api/v1/docs/${encodeURIComponent(requiredId(input))}/attachments`, {
          method: "POST",
          body: attachmentBody(input),
        }),
      deleteAttachment: async (input: JsonRecord & { id?: string; attachmentId?: string }) =>
        await request(`/api/v1/docs/attachments/${encodeURIComponent(requiredAttachmentId(input))}`, { method: "DELETE" }),
      listCollaborationStates: async (input: JsonRecord & { id?: string; docId?: string }) =>
        await request(`/api/v1/docs/${encodeURIComponent(requiredId(input))}/collaboration`, { method: "GET" }),
      updateCollaborationState: async (input: JsonRecord & { id?: string; docId?: string; provider: string }) =>
        await request(`/api/v1/docs/${encodeURIComponent(requiredId(input))}/collaboration/${encodeURIComponent(input.provider)}`, {
          method: "PATCH",
          body: collaborationStateBody(input),
        }),
      deleteCollaborationState: async (input: JsonRecord & { id?: string; docId?: string; provider: string }) =>
        await request(`/api/v1/docs/${encodeURIComponent(requiredId(input))}/collaboration/${encodeURIComponent(input.provider)}`, { method: "DELETE" }),
      listBacklinks: async (input: JsonRecord & { id?: string; docId?: string }) =>
        await request(`/api/v1/docs/${encodeURIComponent(requiredId(input))}/backlinks`, { method: "GET" }),
      listForwardLinks: async (input: JsonRecord & { id?: string; docId?: string }) =>
        await request(`/api/v1/docs/${encodeURIComponent(requiredId(input))}/forward-links`, { method: "GET" }),
      createLink: async (input: JsonRecord) =>
        await request("/api/v1/docs/links", { method: "POST", body: linkBody(input) }),
      deleteLink: async (input: JsonRecord & { id?: string; linkId?: string }) =>
        await request(`/api/v1/docs/links/${encodeURIComponent(requiredLinkId(input))}`, { method: "DELETE" }),
      listVersions: async (input: JsonRecord & { id?: string; docId?: string }) =>
        await request(`/api/v1/docs/${encodeURIComponent(requiredId(input))}/versions`, { method: "GET" }),
      getVersion: async (input: JsonRecord & { id?: string; docId?: string; version: string | number }) =>
        await request(`/api/v1/docs/${encodeURIComponent(requiredId(input))}/versions/${encodeURIComponent(String(input.version))}`, { method: "GET" }),
      getVersionById: async (input: JsonRecord & { id?: string; docId?: string; versionId: string }) =>
        await request(`/api/v1/docs/${encodeURIComponent(requiredId(input))}/version-ids/${encodeURIComponent(String(input.versionId))}`, { method: "GET" }),
      diffVersions: async (input: JsonRecord & { id?: string; docId?: string }) =>
        await request(`/api/v1/docs/${encodeURIComponent(requiredId(input))}/versions/diff`, {
          method: "GET",
          query: compact({
            fromVersion: input.fromVersion ?? input.from_version,
            toVersion: input.toVersion ?? input.to_version,
          }),
        }),
      diffVersionById: async (input: JsonRecord & { id?: string; docId?: string; versionId: string }) =>
        await request(`/api/v1/docs/${encodeURIComponent(requiredId(input))}/version-ids/${encodeURIComponent(String(input.versionId))}/diff`, { method: "GET" }),
      restoreVersion: async (input: JsonRecord & { id?: string; docId?: string; version: string | number }) =>
        await request(`/api/v1/docs/${encodeURIComponent(requiredId(input))}/versions/${encodeURIComponent(String(input.version))}/restore`, { method: "POST" }),
      restoreVersionById: async (input: JsonRecord & { id?: string; docId?: string; versionId: string }) =>
        await request(`/api/v1/docs/${encodeURIComponent(requiredId(input))}/version-ids/${encodeURIComponent(String(input.versionId))}/restore`, { method: "POST" }),
    },
  };
}

export function createDocumentApiCallerFromEnv(
  env: DocumentApiEnvironment = process.env as unknown as DocumentApiEnvironment,
  fetchFn: typeof fetch = fetch,
) {
  const baseUrl = env.FULCRUM_SERVER_URL ?? env.FULCRUM_PUBLIC_API_URL;
  if (!baseUrl) return null;
  return createDocumentApiCaller({ baseUrl, orgId: env.FULCRUM_ORG_ID, fetch: fetchFn });
}

function documentRequest(options: DocumentApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchFn = options.fetch ?? fetch;

  return async function request<T = unknown>(
    path: string,
    init: { method?: string; query?: JsonRecord; body?: JsonRecord } = {},
  ): Promise<T> {
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(compact(init.query ?? {}))) {
      url.searchParams.set(key, String(value));
    }
    const response = await fetchFn(url.toString(), {
      method: init.method ?? "GET",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        ...options.headers,
      },
      body: init.body ? JSON.stringify(compact(init.body)) : undefined,
    });
    const body = await parseResponseBody(response);
    if (!response.ok) throw new Error(extractErrorMessage(body, response.status));
    return body as T;
  };
}

function documentListQuery(options: DocumentApiClientOptions, input: JsonRecord): JsonRecord {
  return compact({
    orgId: input.orgId ?? input.org_id ?? options.orgId,
    projectId: input.projectId ?? input.project_id,
    type: input.type ?? input.docType ?? input.doc_type,
  });
}

function documentBody(input: JsonRecord): JsonRecord {
  return compact({
    projectId: input.projectId ?? input.project_id,
    title: input.title,
    type: input.type ?? input.docType ?? input.doc_type,
    bodyMd: input.bodyMd ?? input.body_md,
    frontmatter: input.frontmatter,
  });
}

function commentBody(input: JsonRecord): JsonRecord {
  return compact({
    authorId: input.authorId ?? input.author_id,
    bodyMd: input.bodyMd ?? input.body_md,
    parentCommentId: input.parentCommentId ?? input.parent_comment_id,
    selection: input.selection,
    traceId: input.traceId ?? input.trace_id,
  });
}

function commentPatchBody(input: JsonRecord): JsonRecord {
  return compact({
    bodyMd: input.bodyMd ?? input.body_md,
    selection: input.selection,
    status: input.status,
  });
}

function attachmentBody(input: JsonRecord): JsonRecord {
  return compact({
    fileName: input.fileName ?? input.file_name,
    mimeType: input.mimeType ?? input.mime_type,
    sizeBytes: input.sizeBytes ?? input.size_bytes,
    storagePath: input.storagePath ?? input.storage_path,
    checksumSha256: input.checksumSha256 ?? input.checksum_sha256,
    traceId: input.traceId ?? input.trace_id,
  });
}

function collaborationStateBody(input: JsonRecord): JsonRecord {
  return compact({
    stateVector: input.stateVector ?? input.state_vector,
    documentState: input.documentState ?? input.document_state,
    activeClientIds: input.activeClientIds ?? input.active_client_ids,
    traceId: input.traceId ?? input.trace_id,
  });
}

function linkBody(input: JsonRecord): JsonRecord {
  return compact({
    sourceDocId: input.sourceDocId ?? input.source_doc_id,
    targetDocId: input.targetDocId ?? input.target_doc_id,
    linkType: input.linkType ?? input.link_type,
    traceId: input.traceId ?? input.trace_id,
  });
}

function requiredId(input: JsonRecord & { id?: string; docId?: string }): string {
  const id = input.docId ?? input.id;
  if (!id) throw new Error("Document id is required.");
  return id;
}

function requiredCommentId(input: JsonRecord & { id?: string; commentId?: string }): string {
  const id = input.commentId ?? input.id;
  if (!id) throw new Error("Comment id is required.");
  return id;
}

function requiredAttachmentId(input: JsonRecord & { id?: string; attachmentId?: string }): string {
  const id = input.attachmentId ?? input.id;
  if (!id) throw new Error("Attachment id is required.");
  return id;
}

function requiredLinkId(input: JsonRecord & { id?: string; linkId?: string }): string {
  const id = input.linkId ?? input.id;
  if (!id) throw new Error("Document link id is required.");
  return id;
}

function compact(input: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) =>
      value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0)
    ),
  );
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractErrorMessage(body: unknown, status: number): string {
  const record = body as { message?: string; error?: { message?: string; json?: { message?: string } } } | null;
  return record?.error?.json?.message ?? record?.error?.message ?? record?.message ?? `Document API request failed with ${status}.`;
}
