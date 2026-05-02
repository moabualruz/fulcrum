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

/** Input for creating or updating a project. */
export const ProjectInput = z.object({
  orgId: z.string().uuid().describe("Organisation the project belongs to."),
  name: z.string().min(1).describe("Human-readable project name."),
  slug: z.string().min(1).describe("URL-safe identifier for the project."),
  description: z.string().optional().describe("Optional longer description of the project."),
  visibility: ProjectVisibilitySchema.describe("Who can see this project."),
});

/** Minimal Project output schema — Pillar 2 extends with full field set. */
export const ProjectOutput = z.object({
  id: z.string().uuid().describe("Unique project identifier."),
  orgId: z.string().uuid().describe("Organisation the project belongs to."),
  name: z.string().describe("Human-readable project name."),
  slug: z.string().describe("URL-safe identifier for the project."),
  status: ProjectStatusSchema.describe("Current lifecycle status of the project."),
  visibility: ProjectVisibilitySchema.describe("Who can see this project."),
  createdAt: z.date().describe("Timestamp when the project was created."),
});

/** Input for listing projects. */
export const ListProjectsInput = z.object({
  orgId: z.string().uuid().optional().describe("Filter by organisation. Omit for all accessible projects."),
  status: ProjectStatusSchema.optional().describe("Filter by project status."),
});

export type ProjectInputType = z.infer<typeof ProjectInput>;
export type ProjectOutputType = z.infer<typeof ProjectOutput>;
export type ProjectVisibility = z.infer<typeof ProjectVisibilitySchema>;
export type ProjectStatus = z.infer<typeof ProjectStatusSchema>;
export type ListProjectsInputType = z.infer<typeof ListProjectsInput>;
