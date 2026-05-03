import * as v from "valibot";

const IdField = v.pipe(v.string(), v.minLength(1, "id is required"));

/** `?/addTask` — assign task to sprint. */
export const SprintAddTaskSchema = v.object({
  sprintId: IdField,
  taskId: IdField,
});

/** `?/removeTask` — unassign task from sprint. */
export const SprintRemoveTaskSchema = v.object({
  sprintId: IdField,
  taskId: IdField,
});

export type SprintAddTaskValues = v.InferOutput<typeof SprintAddTaskSchema>;
export type SprintRemoveTaskValues = v.InferOutput<typeof SprintRemoveTaskSchema>;
