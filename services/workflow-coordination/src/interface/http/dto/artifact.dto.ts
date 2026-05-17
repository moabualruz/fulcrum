export class ArtifactListQueryDto {
  projectId?: string;
  traceId?: string;
  kind?: string;
  runId?: string;
  taskId?: string;
  docId?: string;
  mime?: string;
  lifecycleState?: string;
  archived?: boolean | string;
  limit?: number | string;
}

export class ArtifactParamsDto {
  id!: string;
}

export class ArtifactDeleteQueryDto {
  hard?: boolean | string;
}

export class ArtifactUploadRequestDto {
  id?: string;
  projectId!: string;
  traceId!: string;
  runId?: string | null;
  taskId?: string | null;
  docId?: string | null;
  kind?: string;
  title?: string;
  filename!: string;
  bodyPath?: string | null;
  checksumSha256?: string | null;
  mime?: string | null;
  sizeBytes?: string | number | bigint | null;
  lifecycleState?: string;
  metadataJson?: Record<string, unknown> | null;
}

export class ArtifactPublicResponseDto {
  id!: string;
  projectId!: string;
  traceId!: string;
  runId!: string | null;
  taskId!: string | null;
  docId!: string | null;
  kind!: string;
  title!: string;
  filename!: string | null;
  bodyPath!: string | null;
  checksumSha256!: string | null;
  mime!: string | null;
  sizeBytes!: string;
  lifecycleState!: string;
  metadataJson!: Record<string, unknown>;
  archived!: boolean;
  archivedAt!: string | null;
  deletedAt!: string | null;
  createdAt!: string;
  updatedAt!: string;
}

export class ArtifactDownloadResponseDto {
  artifact!: ArtifactPublicResponseDto;
  bodyPath!: string | null;
  checksumSha256!: string | null;
}

export class ArtifactDeleteResponseDto {
  ok!: boolean;
  id!: string;
  hard!: boolean;
}
