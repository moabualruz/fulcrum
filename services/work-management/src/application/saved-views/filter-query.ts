/**
 * Filter query AST for saved views and search.
 *
 * The `kind` facet discriminates task/doc/memory/artifact search scope.
 * compileSavedViewQuery returns a MikroORM FilterQuery expression; the ORM
 * generates SQL.
 */

import { z } from "zod";
import type { FindOptionsWhere as FilterQuery } from "typeorm";
import type { Task } from "@work-management/infrastructure/database/entities/tasks/Task.ts";

// ─── Operator vocabulary ────────────────────────────────────────────────────

export const FILTER_OPS = [
  "eq",
  "neq",
  "in",
  "nin",
  "gt",
  "lt",
  "contains",
  "is_empty",
  "is_not_empty",
] as const;

export type FilterOp = (typeof FILTER_OPS)[number];

// ─── Schemas ────────────────────────────────────────────────────────────────

export const FilterClauseSchema = z.object({
  field: z.string().min(1),
  op: z.enum(FILTER_OPS),
  value: z.unknown().optional(),
});
export type FilterClause = z.infer<typeof FilterClauseSchema>;

export const OrderByClauseSchema = z.object({
  field: z.string().min(1),
  dir: z.enum(["asc", "desc"]),
});
export type OrderByClause = z.infer<typeof OrderByClauseSchema>;

export const FacetsSchema = z
  .object({
    /** Discriminates task/doc/memory/artifact in unified search. */
    kind: z.array(z.string()).optional(),
    status: z.array(z.string()).optional(),
    priority: z.array(z.string()).optional(),
    assignee: z.array(z.string()).optional(),
    sprint: z.array(z.string()).optional(),
    label: z.array(z.string()).optional(),
    repo: z.array(z.string()).optional(),
  })
  .partial();
export type Facets = z.infer<typeof FacetsSchema>;

export const SavedViewQuerySchema = z.object({
  filters: z.array(FilterClauseSchema).default([]),
  /** Full-text fragment; currently compiled through title LIKE fallback. */
  text: z.string().default(""),
  facets: FacetsSchema.default({}),
});
export type SavedViewQuery = z.infer<typeof SavedViewQuerySchema>;

// ─── Compiler ───────────────────────────────────────────────────────────────

/**
 * Compiles a SavedViewQuery to a MikroORM FilterQuery<Task>.
 *
 * Empty query → `{}` (no filter = all tasks).
 * Multiple conditions → wrapped in `$and`.
 *
 * FTS `text` fallback: `{ title: { $like: '%…%' } }`.
 * `custom_fields.<slug>` uses jsonb `$contains` (`@>` operator).
 * Native `->>'slug'` path ops need a dedicated MikroORM jsonb extension or $raw.
 */
export function compileSavedViewQuery(q: SavedViewQuery): FilterQuery<Task> {
  const conditions: Record<string, unknown>[] = [];

  // Text fallback uses title LIKE until the search index handles saved-view text.
  if (q.text) {
    conditions.push({ title: { $like: `%${q.text}%` } });
  }

  // Facets
  if (q.facets.status?.length) {
    conditions.push({ status: { $in: q.facets.status } });
  }
  if (q.facets.priority?.length) {
    conditions.push({ priority: { $in: q.facets.priority } });
  }
  if (q.facets.assignee?.length) {
    conditions.push({ assigneeId: { $in: q.facets.assignee } });
  }
  if (q.facets.sprint?.length) {
    conditions.push({ sprint: { $in: q.facets.sprint } });
  }
  if (q.facets.label?.length) {
    conditions.push({ labels: { $contains: q.facets.label } });
  }
  if (q.facets.repo?.length) {
    conditions.push({ repoId: { $in: q.facets.repo } });
  }

  // Filters
  for (const clause of q.filters) {
    const condition = compileClause(clause);
    if (condition !== null) conditions.push(condition);
  }

  if (conditions.length === 0) return {} as FilterQuery<Task>;
  if (conditions.length === 1) return conditions[0] as FilterQuery<Task>;
  return { $and: conditions } as unknown as FilterQuery<Task>;
}

const CUSTOM_FIELDS_PREFIX = "custom_fields.";

function compileClause(clause: FilterClause): Record<string, unknown> | null {
  const { field, op, value } = clause;

  // custom_fields.<slug> → jsonb containment ($contains = @> operator).
  // Native custom_fields->>'slug' path needs a jsonb extension or $raw.
  if (field.startsWith(CUSTOM_FIELDS_PREFIX)) {
    const slug = field.slice(CUSTOM_FIELDS_PREFIX.length);
    return { customFields: compileCustomFieldOp(slug, op, value) };
  }

  return { [field]: compileSingleOp(op, value) };
}

function compileSingleOp(op: FilterOp, value: unknown): unknown {
  switch (op) {
    case "eq":
      return value;
    case "neq":
      return { $ne: value };
    case "in":
      return { $in: value as unknown[] };
    case "nin":
      return { $nin: value as unknown[] };
    case "gt":
      return { $gt: value };
    case "lt":
      return { $lt: value };
    case "contains":
      return { $like: `%${value}%` };
    case "is_empty":
      return { $eq: null };
    case "is_not_empty":
      return { $ne: null };
  }
}

function compileCustomFieldOp(
  slug: string,
  op: FilterOp,
  value: unknown,
): Record<string, unknown> {
  switch (op) {
    case "eq":
      return { $contains: { [slug]: value } };
    case "neq":
      return { $not: { $contains: { [slug]: value } } };
    case "in":
      // jsonb @> checks for containment; no native $in on jsonb key — best effort
      return {
        $or: (value as unknown[]).map((v) => ({ $contains: { [slug]: v } })),
      };
    case "is_empty":
      return { $not: { $contains: { [slug]: null } } };
    case "is_not_empty":
      return { $contains: { [slug]: null } };
    default:
      // gt/lt/nin/contains on jsonb path need native operators.
      return { $contains: { [slug]: value } };
  }
}
