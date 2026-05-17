import type { ProjectPublicKind } from "@work-management/infrastructure/database/project-public-store.ts";

export class ProjectListQueryDto {
  orgId!: string;
}

export class ProjectRequestContextDto {
  orgId!: string;
}

export class ProjectIdParamsDto {
  id!: string;
}

export class ProjectCreateBodyDto {
  orgId!: string;
  kind?: ProjectPublicKind;
  name!: string;
  slug?: string;
  repoPath?: string;
  template?: string;
}

export class ProjectPatchBodyDto {
  orgId!: string;
  name?: string;
  memory_config?: Record<string, unknown>;
}
