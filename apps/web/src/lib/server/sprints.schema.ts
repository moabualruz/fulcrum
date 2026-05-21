import * as v from "valibot";

const IdField = v.pipe(v.string(), v.minLength(1, "id is required"));

/** `?/createSprint`: create a new sprint. */
export const CreateSprintSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1, "name is required"), v.maxLength(120)),
  goal: v.optional(v.string()),
  capacity: v.optional(v.number()),
});

/** `?/startSprint`: transition sprint to active. */
export const StartSprintSchema = v.object({
  id: IdField,
});

/** `?/completeSprint`: close/complete a sprint. */
export const CompleteSprintSchema = v.object({
  id: IdField,
});

export type CreateSprintValues = v.InferOutput<typeof CreateSprintSchema>;
export type StartSprintValues = v.InferOutput<typeof StartSprintSchema>;
export type CompleteSprintValues = v.InferOutput<typeof CompleteSprintSchema>;

/** `?/addTask`: assign task to sprint. */
export const SprintAddTaskSchema = v.object({
  sprintId: IdField,
  taskId: IdField,
});

/** `?/removeTask`: unassign task from sprint. */
export const SprintRemoveTaskSchema = v.object({
  sprintId: IdField,
  taskId: IdField,
});

export type SprintAddTaskValues = v.InferOutput<typeof SprintAddTaskSchema>;
export type SprintRemoveTaskValues = v.InferOutput<typeof SprintRemoveTaskSchema>;
