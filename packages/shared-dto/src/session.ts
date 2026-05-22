import { z } from "zod";

export const AbortReasonValues = [
	"user-cancel",
	"dangerous-output",
	"wrong-context",
	"cost-cap",
] as const;
export const AbortReasonSchema = z.enum(AbortReasonValues);
export type AbortReason = z.infer<typeof AbortReasonSchema>;
