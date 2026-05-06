import { z } from "zod";
import { createDomainQuery } from "./domain-adapter.ts";

export const SearchInputSchema = z.object({
  term: z.string().default(""),
  limit: z.number().int().min(1).max(100).default(20),
});

export const SearchOutputSchema = z.object({
  results: z.array(z.object({
    id: z.string(),
    title: z.string().nullable(),
    snippet: z.string(),
  })),
  total: z.number().int().nonnegative(),
});

export function createSearchRouter(application: {
  query(input: z.infer<typeof SearchInputSchema>, context: { orgId: string; userId?: string | null }): Promise<z.infer<typeof SearchOutputSchema>>;
}) {
  return {
    query: createDomainQuery({
      input: SearchInputSchema,
      output: SearchOutputSchema,
      application: { execute: application.query },
    }),
  };
}
