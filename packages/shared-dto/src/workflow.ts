import { z } from "zod";

export const WorkflowStageValues = ["capture", "plan", "build", "review", "ship", "operate"] as const;
export const WorkflowStageSchema = z.enum(WorkflowStageValues);
export type WorkflowStage = z.infer<typeof WorkflowStageSchema>;

export const WorkflowModeValues = ["manual", "play", "discuss", "assist"] as const;
export const WorkflowModeSchema = z.enum(WorkflowModeValues);
export type WorkflowMode = z.infer<typeof WorkflowModeSchema>;
