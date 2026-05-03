import * as v from "valibot";

const SprintStatusEnum = v.picklist(["planned", "active", "completed"]);
const IdField = v.pipe(v.string(), v.minLength(1, "id is required"));
const NameField = v.pipe(
  v.string(),
  v.trim(),
  v.minLength(1, "Name is required"),
  v.maxLength(120, "Name is too long"),
);

/** `?/createSprint` */
export const CreateSprintSchema = v.object({
  name: NameField,
  goal: v.optional(v.union([v.string(), v.null_()])),
  capacity: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  startDate: v.optional(v.union([v.string(), v.null_()])),
  endDate: v.optional(v.union([v.string(), v.null_()])),
});

/** `?/updateSprint` */
export const UpdateSprintSchema = v.object({
  id: IdField,
  name: v.optional(NameField),
  goal: v.optional(v.union([v.string(), v.null_()])),
  status: v.optional(SprintStatusEnum),
  capacity: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
});

/** `?/startSprint` */
export const StartSprintSchema = v.object({ id: IdField });

/** `?/completeSprint` */
export const CompleteSprintSchema = v.object({ id: IdField });

/** `?/assignTask` — assign task to sprint */
export const AssignTaskSchema = v.object({
  taskId: IdField,
  sprintId: v.union([v.pipe(v.string(), v.minLength(1)), v.null_()]),
});

export type CreateSprintValues = v.InferOutput<typeof CreateSprintSchema>;
export type UpdateSprintValues = v.InferOutput<typeof UpdateSprintSchema>;
