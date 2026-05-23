import { z } from "zod";

export const StatusBadgeValues = [
	"queued",
	"running",
	"waiting-input",
	"passing",
	"failing",
	"completed",
	"cancelled",
	"blocked",
] as const;

export const StatusBadgeSchema = z.enum(StatusBadgeValues);
export type StatusBadge = z.infer<typeof StatusBadgeSchema>;
