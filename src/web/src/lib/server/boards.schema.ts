import * as v from "valibot";
import { TASK_STATUSES } from "./tasks";

const StatusEnum = v.picklist([...TASK_STATUSES]);

const TitleField = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "Title is required"),
  v.maxLength(200, "Title is too long"),
);

const IdField = v.pipe(v.string(), v.minLength(1, "id is required"));

const NullableString = v.union([v.string(), v.null_()]);

/** `?/create` — `{title, status?, projectId?}`. */
export const BoardCreateSchema = v.object({
  title: TitleField,
  status: v.optional(StatusEnum),
  projectId: v.optional(NullableString),
});

/** `?/update` — partial edit; at least one of {title,description,status,priority}. */
export const BoardUpdateSchema = v.object({
  id: IdField,
  title: v.optional(TitleField),
  description: v.optional(NullableString),
  status: v.optional(StatusEnum),
  priority: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(20))),
});

/** `?/delete` — `{id}`. */
export const BoardDeleteSchema = v.object({ id: IdField });

/** `?/move` — `{id, from, to}` for the optimistic-status DnD. */
export const BoardMoveSchema = v.object({
  id: IdField,
  from: StatusEnum,
  to: StatusEnum,
});

export type BoardCreateValues = v.InferOutput<typeof BoardCreateSchema>;
export type BoardUpdateValues = v.InferOutput<typeof BoardUpdateSchema>;
export type BoardDeleteValues = v.InferOutput<typeof BoardDeleteSchema>;
export type BoardMoveValues = v.InferOutput<typeof BoardMoveSchema>;
