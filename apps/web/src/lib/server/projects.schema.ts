import * as v from "valibot";

/**
 * Form schema for creating and editing projects. Mirrors the canonical slug
 * regex used by `apps/web/src/lib/state/active-project.ts` so a slug accepted
 * here is a valid active-project cookie value.
 */
export const ProjectFormSchema = v.object({
  name: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "Name is required"),
    v.maxLength(80, "Name is too long"),
  ),
  slug: v.pipe(
    v.string(),
    v.regex(
      /^[a-z0-9][a-z0-9-]{0,63}$/,
      "Slug must be lowercase letters, digits, hyphens",
    ),
  ),
  description: v.optional(
    v.pipe(v.string(), v.maxLength(280, "Description is too long")),
  ),
  repoPath: v.optional(
    v.pipe(v.string(), v.trim(), v.maxLength(500, "Repository path is too long")),
  ),
  template: v.optional(
    v.pipe(v.string(), v.trim(), v.maxLength(120, "Template id is too long")),
  ),
  parentId: v.optional(
    v.pipe(v.string(), v.trim(), v.maxLength(80, "Parent project id is too long")),
  ),
});

export type ProjectFormValues = v.InferOutput<typeof ProjectFormSchema>;
