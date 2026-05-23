export class SubscriptionStreamQueryDto {
  orgId!: string;
  userId!: string;
  once?: boolean;
  lastEventId?: string;
}

export class RunUpdateStreamQueryDto extends SubscriptionStreamQueryDto {
  runId!: string;
}
