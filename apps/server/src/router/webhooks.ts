import { z } from "zod";
import { createDomainQuery } from "./domain-adapter.ts";

export const WebhookDeliveryInputSchema = z.object({
  webhookId: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

export const WebhookDeliveryOutputSchema = z.object({
  accepted: z.boolean(),
  deliveryId: z.string().nullable(),
});

export function createWebhooksRouter(application: {
  deliver(input: z.infer<typeof WebhookDeliveryInputSchema>, context: { orgId: string; userId?: string | null }): Promise<z.infer<typeof WebhookDeliveryOutputSchema>>;
}) {
  return {
    deliver: createDomainQuery({
      input: WebhookDeliveryInputSchema,
      output: WebhookDeliveryOutputSchema,
      application: { execute: application.deliver },
    }),
  };
}
