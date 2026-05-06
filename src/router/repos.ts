import { z } from "zod";
import { createDomainQuery } from "./domain-adapter.ts";

export const ReposListInputSchema = z.object({
  projectId: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const ReposListOutputSchema = z.object({
  repos: z.array(z.object({
    id: z.string(),
    name: z.string(),
    defaultBranch: z.string().nullable(),
  })),
});

export function createReposRouter(application: {
  list(input: z.infer<typeof ReposListInputSchema>, context: { orgId: string; userId?: string | null }): Promise<z.infer<typeof ReposListOutputSchema>>;
}) {
  return {
    list: createDomainQuery({
      input: ReposListInputSchema,
      output: ReposListOutputSchema,
      application: { execute: application.list },
    }),
  };
}
