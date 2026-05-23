/**
 * Zod schemas for the projects domain.
 * Pillar 2 (projects + repos) fills these out fully.
 *
 * C6: No raw SQL.
 * C4: Shared across web, CLI, and TUI surfaces.
 */

import { z } from "zod";

/** Project visibility settings. */
export const ProjectVisibilitySchema = z.enum(["private", "internal", "public"]);

/** Project status. */
export const ProjectStatusSchema = z.enum(["active", "archived", "draft"]);

/** Project hierarchy kind. */
export const ProjectKindSchema = z.enum(["workspace", "project", "subproject"]);

/** Input for creating or updating a project. */
export const ProjectInput = z.object({
  orgId: z.string().uuid().describe("Org the project belongs to."),
  name: z.string().min(1).describe("Human-readable project name."),
  slug: z.string().min(1).describe("URL-safe identifier for the project."),
  description: z.string().nullable().optional().describe("Optional longer description of the project."),
  status: ProjectStatusSchema.optional().describe("Lifecycle status to assign."),
  ownerId: z.string().nullable().optional().describe("User responsible for the project."),
  traceId: z.string().min(1).optional().describe("Trace identifier propagated across surfaces."),
  kind: ProjectKindSchema.optional().describe("Hierarchy kind for the project."),
  visibility: ProjectVisibilitySchema.describe("Who can see this project."),
});

/** Project output schema shared by HTTP and tRPC surfaces. */
export const ProjectOutput = z.object({
  id: z.string().uuid().describe("Unique project identifier."),
  orgId: z.string().uuid().describe("Org the project belongs to."),
  workspaceId: z.string().uuid().describe("Workspace row backing the project scope."),
  name: z.string().describe("Human-readable project name."),
  slug: z.string().describe("URL-safe identifier for the project."),
  description: z.string().nullable().describe("Longer project description."),
  status: ProjectStatusSchema.describe("Current lifecycle status of the project."),
  ownerId: z.string().nullable().describe("User responsible for the project."),
  traceId: z.string().describe("Trace identifier propagated across surfaces."),
  kind: ProjectKindSchema.describe("Hierarchy kind for the project."),
  visibility: ProjectVisibilitySchema.describe("Who can see this project."),
  createdAt: z.string().nullable().describe("Timestamp when the project was created."),
  updatedAt: z.string().nullable().describe("Timestamp when the project was last updated."),
});

/** Project stats output shared by HTTP and tRPC surfaces. */
export const ProjectStatsOutput = z.object({
  orgId: z.string().uuid().describe("Org the stats belong to."),
  projectId: z.string().uuid().describe("Project the stats belong to."),
  taskCount: z.number().int().nonnegative().describe("Total non-deleted tasks in scope."),
  doneTaskCount: z.number().int().nonnegative().describe("Completed tasks in scope."),
  openTaskCount: z.number().int().nonnegative().describe("Tasks not yet complete in scope."),
  artifactCount: z.number().int().nonnegative().describe("Non-deleted artifacts in scope."),
  traceId: z.string().describe("Project trace identifier."),
});

/** Input for listing projects. */
export const ListProjectsInput = z.object({
  orgId: z.string().uuid().optional().describe("Filter by Org. Omit for all accessible projects."),
  status: ProjectStatusSchema.optional().describe("Filter by project status."),
});

export type ProjectInputType = z.infer<typeof ProjectInput>;
export type ProjectOutputType = z.infer<typeof ProjectOutput>;
export type ProjectVisibility = z.infer<typeof ProjectVisibilitySchema>;
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type ProjectKind = z.infer<typeof ProjectKindSchema>;
export type ListProjectsInputType = z.infer<typeof ListProjectsInput>;
