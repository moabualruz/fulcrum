import { z } from "zod";

export const SortDirectionValues = ["asc", "desc"] as const;
export const SortDirectionSchema = z.enum(SortDirectionValues);
export type SortDirection = z.infer<typeof SortDirectionSchema>;
