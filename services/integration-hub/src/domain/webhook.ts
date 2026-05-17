export interface WebhookAppContext {
  orgId: string;
  userId: string | null;
  projectId?: string | null;
}

export type WebhookEventType =
  | "task.created"
  | "task.updated"
  | "task.completed"
  | "run.started"
  | "run.completed"
  | "run.failed"
  | "doc.created"
  | "doc.updated"
  | "sprint.started"
  | "sprint.completed";

export type WebhookDeliveryStatus = "pending" | "delivered" | "failed" | "retrying";

export interface WebhookDto {
  id: string;
  orgId: string;
  name: string;
  url: string;
  secret: "****";
  eventsFilter: WebhookEventType[] | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastDeliveryAt: Date | null;
}

export interface DeliveryDto {
  id: string;
  orgId: string;
  webhookId: string;
  eventId: string | null;
  status: WebhookDeliveryStatus;
  attempt: number;
  responseCode: number | null;
  error: string | null;
  nextRetryAt: Date | null;
  createdAt: Date;
}

export interface CreateWebhookInput {
  name: string;
  url: string;
  secret?: string;
  eventsFilter?: WebhookEventType[];
  enabled?: boolean;
}

export interface UpdateWebhookInput {
  id: string;
  name?: string;
  url?: string;
  secret?: string;
  eventsFilter?: WebhookEventType[];
  enabled?: boolean;
}

export interface ListWebhookDeliveriesInput {
  webhookId: string;
  limit?: number;
}
