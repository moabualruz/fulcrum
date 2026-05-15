import type { WebhookEventType } from "@integration-hub/domain/webhook.ts";

export class WebhookListQueryDto {
  orgId!: string;
  includeDisabled?: boolean | string;
}

export class WebhookParamsDto {
  id!: string;
}

export class WebhookDeliveryParamsDto {
  deliveryId!: string;
}

export class WebhookDeliveryListQueryDto {
  orgId!: string;
  limit?: number | string;
}

export class WebhookCreateBodyDto {
  name!: string;
  url!: string;
  secret?: string;
  eventsFilter?: WebhookEventType[];
  enabled?: boolean;
}

export class WebhookUpdateBodyDto {
  name?: string;
  url?: string;
  secret?: string;
  eventsFilter?: WebhookEventType[];
  enabled?: boolean;
}
