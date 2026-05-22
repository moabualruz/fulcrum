import { z } from "zod";

/** Path param for every project-timeline endpoint: the project whose timeline is read or mutated. */
export class ProjectTimelineIdParamsDto {
  id!: string;
}

/** Workspace scoping carried on every timeline request — mirrors `ProjectRequestContextDto`. */
export class ProjectTimelineContextDto {
  orgId!: string;
}

/** Reschedule body: which task moves, and the new boundary date(s). */
export class ProjectTimelineRescheduleBodyDto {
  orgId!: string;
  taskId!: string;
  startDate?: string | null;
  dueDate?: string | null;
}

const nonEmptyString = z.string().min(1);

export const ProjectTimelineIdParamsSchema = z.object({
  id: nonEmptyString,
});

export const ProjectTimelineContextSchema = z.object({
  orgId: nonEmptyString,
});

export const ProjectTimelineRescheduleBodySchema = z.object({
  orgId: nonEmptyString,
  taskId: nonEmptyString,
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});
