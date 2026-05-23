export class RepositoryListQueryDto {
  orgId!: string;
  includeArchived?: boolean | string;
}

export class RepositoryRequestContextDto {
  orgId!: string;
}

export class RepositoryReadModelListQueryDto extends RepositoryRequestContextDto {
  repoId?: string;
  branch?: string;
  limit?: string | number;
}

export class RepositoryTreeQueryDto extends RepositoryRequestContextDto {
  branch?: string;
  dir?: string;
}

export class RepositoryFileQueryDto extends RepositoryRequestContextDto {
  branch?: string;
  path!: string;
}

export class RepositoryIdParamsDto {
  id!: string;
}

export class RepositoryReadModelIdParamsDto {
  id!: string;
}

export class RepositoryCreateBodyDto {
  orgId!: string;
  projectId?: string | null;
  name!: string;
  slug?: string;
  kind?: "local" | "remote";
  localPath?: string | null;
  remoteUrl?: string | null;
  defaultBranch?: string | null;
}
