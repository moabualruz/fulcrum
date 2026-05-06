import { z } from "zod";
import { createDomainQuery } from "./domain-adapter.ts";

export const ConnectorsListInputSchema = z.object({
  provider: z.string().optional(),
});

export const ConnectorsListOutputSchema = z.object({
  connectors: z.array(z.object({
    id: z.string(),
    provider: z.string(),
    status: z.string(),
  })),
});

export function createConnectorsRouter(application: {
  list(input: z.infer<typeof ConnectorsListInputSchema>, context: { orgId: string; userId?: string | null }): Promise<z.infer<typeof ConnectorsListOutputSchema>>;
}) {
  return {
    list: createDomainQuery({
      input: ConnectorsListInputSchema,
      output: ConnectorsListOutputSchema,
      application: { execute: application.list },
    }),
  };
}
