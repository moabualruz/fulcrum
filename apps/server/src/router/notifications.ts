import { z } from "zod";
import { createDomainQuery } from "./domain-adapter.ts";

export const NotificationListInputSchema = z.object({
  unreadOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

export const NotificationListOutputSchema = z.object({
  items: z.array(z.object({
    id: z.string(),
    title: z.string(),
    readAt: z.string().nullable(),
  })),
});

export function createNotificationsRouter(application: {
  list(input: z.infer<typeof NotificationListInputSchema>, context: { orgId: string; userId?: string | null }): Promise<z.infer<typeof NotificationListOutputSchema>>;
}) {
  return {
    list: createDomainQuery({
      input: NotificationListInputSchema,
      output: NotificationListOutputSchema,
      application: { execute: application.list },
    }),
  };
}
