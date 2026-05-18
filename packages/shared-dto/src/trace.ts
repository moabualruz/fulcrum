import { z } from "zod";

export const TraceIdSchema = z.string().trim().min(1);
export type TraceId = z.infer<typeof TraceIdSchema>;
