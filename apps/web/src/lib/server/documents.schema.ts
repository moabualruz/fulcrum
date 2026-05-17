import * as v from "valibot";

/**
 * Form schema for create + edit on documents. `labels` is a comma-separated
 * string here; `parseLabels` from `$lib/markdown/labels` converts to the
 * `string[]` shape the document `frontmatter` requires before persisting.
 */
export const DocumentFormSchema = v.object({
  title: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "Title is required"),
    v.maxLength(120, "Title is too long"),
  ),
  kind: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "Kind is required"),
    v.maxLength(40, "Kind is too long"),
  ),
  labels: v.optional(v.string(), ""),
  body: v.string(),
  projectId: v.optional(v.nullable(v.string())),
});

export type DocumentFormValues = v.InferOutput<typeof DocumentFormSchema>;
