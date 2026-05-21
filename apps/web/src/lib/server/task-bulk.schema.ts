import * as v from "valibot";
import { TASK_STATUSES } from "./tasks";

const StatusEnum = v.picklist([...TASK_STATUSES]);
const IdField = v.pipe(v.string(), v.minLength(1, "id is required"));

/** `?/bulkStatus`: `{ids: string (comma-separated), status}`. */
export const BulkStatusSchema = v.object({
  ids: v.pipe(v.string(), v.minLength(1, "ids required")),
  status: StatusEnum,
});

/** `?/bulkDelete`: `{ids: string (comma-separated)}`. */
export const BulkDeleteSchema = v.object({
  ids: v.pipe(v.string(), v.minLength(1, "ids required")),
});

export type BulkStatusValues = v.InferOutput<typeof BulkStatusSchema>;
export type BulkDeleteValues = v.InferOutput<typeof BulkDeleteSchema>;
