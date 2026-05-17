export class SubscriptionStreamQueryDto {
  orgId!: string;
  userId!: string;
  once?: boolean;
}

export class RunUpdateStreamQueryDto extends SubscriptionStreamQueryDto {
  runId!: string;
}
