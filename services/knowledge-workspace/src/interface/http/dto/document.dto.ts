export type PublicDocumentType = string;

export class DocumentListQueryDto {
  orgId?: string;
  projectId?: string;
  type?: PublicDocumentType;
}

export class DocumentTemplateQueryDto {
  projectId?: string;
  docType?: string;
}

export class DocumentIdParamsDto {
  id!: string;
}

export class DocumentCommentIdParamsDto {
  commentId!: string;
}

export class DocumentAttachmentIdParamsDto {
  attachmentId!: string;
}

export class DocumentCollaborationProviderParamsDto extends DocumentIdParamsDto {
  provider!: string;
}

export class DocumentLinkIdParamsDto {
  linkId!: string;
}

export class DocumentVersionParamsDto extends DocumentIdParamsDto {
  version!: string;
}

export class DocumentVersionIdParamsDto extends DocumentIdParamsDto {
  versionId!: string;
}

export class DocumentVersionDiffQueryDto {
  fromVersion!: string;
  toVersion!: string;
}

export class DocumentCommentListQueryDto {
  resolved?: string;
}

export class DocumentCreateBodyDto {
  projectId?: string;
  title!: string;
  type?: PublicDocumentType;
  bodyMd?: string;
  frontmatter?: Record<string, unknown>;
}

export class DocumentPatchBodyDto {
  title?: string;
  type?: PublicDocumentType;
  bodyMd?: string;
  frontmatter?: Record<string, unknown>;
}

export class DocumentCommentCreateBodyDto {
  authorId!: string;
  bodyMd!: string;
  parentCommentId?: string;
  selection?: Record<string, unknown> | null;
  traceId?: string;
}

export class DocumentCommentPatchBodyDto {
  bodyMd?: string;
  selection?: Record<string, unknown> | null;
  status?: string;
}

export class DocumentCommentResolveBodyDto {
  resolved?: boolean | string;
}

export class DocumentAttachmentCreateBodyDto {
  fileName!: string;
  mimeType!: string;
  sizeBytes!: number;
  storagePath!: string;
  checksumSha256?: string;
  traceId?: string;
}

export class DocumentCollaborationStatePatchBodyDto {
  stateVector?: string | null;
  documentState?: string | null;
  activeClientIds?: string[];
  traceId?: string;
}

export class DocumentLinkCreateBodyDto {
  sourceDocId!: string;
  targetDocId!: string;
  linkType?: string;
  traceId?: string;
}
