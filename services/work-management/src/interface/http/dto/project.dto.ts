import { z } from "zod";

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
  description?: string | null;
  status?: string;
  ownerId?: string | null;
  traceId?: string;
  repoPath?: string;
  template?: string;
}

export class ProjectPatchBodyDto {
  orgId!: string;
  name?: string;
  description?: string | null;
  status?: string;
  ownerId?: string | null;
  memory_config?: Record<string, unknown>;
}

const nonEmptyString = z.string().min(1);

export const ProjectListQuerySchema = z.object({
  orgId: nonEmptyString,
});

export const ProjectRequestContextSchema = z.object({
  orgId: nonEmptyString,
});

export const ProjectIdParamsSchema = z.object({
  id: nonEmptyString,
});

export const ProjectCreateBodySchema = z.object({
  orgId: nonEmptyString,
  kind: z.enum(["workspace", "project", "subproject"]).optional(),
  name: nonEmptyString,
  slug: nonEmptyString.optional(),
  description: z.string().nullable().optional(),
  status: nonEmptyString.optional(),
  ownerId: z.string().nullable().optional(),
  traceId: nonEmptyString.optional(),
  repoPath: nonEmptyString.optional(),
  template: nonEmptyString.optional(),
});

export const ProjectPatchBodySchema = z.object({
  orgId: nonEmptyString,
  name: nonEmptyString.optional(),
  description: z.string().nullable().optional(),
  status: nonEmptyString.optional(),
  ownerId: z.string().nullable().optional(),
  memory_config: z.record(z.string(), z.unknown()).optional(),
});

// `createProjectFromSetup` carries hierarchy (`parentId`), repo wiring
// (`repoPath`), and template selection — the plain `createProject` body cannot.
export class ProjectSetupBodyDto {
  orgId!: string;
  name!: string;
  slug?: string;
  description?: string | null;
  kind?: ProjectPublicKind;
  parentId?: string | null;
  repoPath?: string | null;
  template?: string | null;
}

export const ProjectSetupBodySchema = z.object({
  orgId: nonEmptyString,
  name: nonEmptyString,
  slug: nonEmptyString.optional(),
  description: z.string().nullable().optional(),
  kind: z.enum(["workspace", "project", "subproject"]).optional(),
  parentId: z.string().nullable().optional(),
  repoPath: z.string().nullable().optional(),
  template: z.string().nullable().optional(),
});

// Sprint↔task assignment within the project backlog mutates `tasks.sprint_id`.
export class ProjectBacklogSprintTaskBodyDto {
  orgId!: string;
  sprintId!: string;
  taskId!: string;
}

export const ProjectBacklogSprintTaskBodySchema = z.object({
  orgId: nonEmptyString,
  sprintId: nonEmptyString,
  taskId: nonEmptyString,
});

export class ProjectBacklogSprintTaskParamsDto {
  id!: string;
  sprintId!: string;
  taskId!: string;
}

export const ProjectBacklogSprintTaskParamsSchema = z.object({
  id: nonEmptyString,
  sprintId: nonEmptyString,
  taskId: nonEmptyString,
});
