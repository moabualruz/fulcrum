import { z } from "zod";
import { createDomainQuery } from "./domain-adapter.ts";

export const OrchestrationDispatchInputSchema = z.object({
  taskId: z.string().min(1),
  agent: z.string().min(1).optional(),
});

export const OrchestrationRunOutputSchema = z.object({
  runId: z.string(),
  status: z.string(),
});

export function createOrchestrationRouter(application: {
  dispatch(input: z.infer<typeof OrchestrationDispatchInputSchema>, context: { orgId: string; userId?: string | null }): Promise<z.infer<typeof OrchestrationRunOutputSchema>>;
}) {
  return {
    dispatch: createDomainQuery({
      input: OrchestrationDispatchInputSchema,
      output: OrchestrationRunOutputSchema,
      application: { execute: application.dispatch },
    }),
  };
}
