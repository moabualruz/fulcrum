/**
 * Zod schemas for the skills domain.
 * Pillar 6 (skills + tool registry) fills these out fully.
 *
 * C6: No raw SQL.
 * C4: Shared across web, CLI, and TUI surfaces.
 */

import { z } from "zod";

/** Skill category — matches the agent skill taxonomy. */
export const SkillCategorySchema = z.enum([
  "search",
  "data",
  "http",
  "version-control",
  "editor",
  "shell",
  "language",
  "infra",
  "agent",
  "other",
]);

/** Input for registering or updating a skill. */
export const SkillInput = z.object({
  orgId: z.string().uuid().describe("Organisation that owns the skill."),
  name: z.string().min(1).describe("Unique skill identifier (kebab-case)."),
  category: SkillCategorySchema.describe("Functional category for grouping and discovery."),
  description: z.string().describe("What the skill does — used for CLI help text and OpenAPI descriptions."),
  triggerKeywords: z.array(z.string()).describe("Keywords that trigger skill activation in agent context."),
});

/** Minimal Skill output schema. */
export const SkillOutput = z.object({
  id: z.string().uuid().describe("Unique skill record identifier."),
  orgId: z.string().uuid().describe("Organisation that owns the skill."),
  name: z.string().describe("Unique skill identifier (kebab-case)."),
  category: SkillCategorySchema.describe("Functional category for grouping and discovery."),
  description: z.string().describe("What the skill does."),
  createdAt: z.date().describe("Timestamp when the skill was registered."),
});

/** Input for listing skills. */
export const ListSkillsInput = z.object({
  orgId: z.string().uuid().optional().describe("Filter by organisation."),
  category: SkillCategorySchema.optional().describe("Filter by skill category."),
});

export type SkillInputType = z.infer<typeof SkillInput>;
export type SkillOutputType = z.infer<typeof SkillOutput>;
export type SkillCategory = z.infer<typeof SkillCategorySchema>;
export type ListSkillsInputType = z.infer<typeof ListSkillsInput>;
