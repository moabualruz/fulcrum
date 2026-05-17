import type { AutomationCondition } from "@work-management/infrastructure/database/automation-store.ts";

export class AutomationListQueryDto {
  orgId!: string;
  userId!: string;
  projectId!: string;
}

export class AutomationContextQueryDto {
  orgId!: string;
  userId!: string;
}

export class AutomationIdParamsDto {
  id!: string;
}

export class AutomationConditionDto {
  field!: string;
  operator!: AutomationCondition["operator"];
  value?: unknown;
}

export class AutomationCreateDto {
  orgId!: string;
  userId!: string;
  projectId!: string;
  name!: string;
  triggerType!: string;
  triggerConfig?: Record<string, unknown> | null;
  condition?: AutomationConditionDto | null;
  actionType!: string;
  actionConfig?: Record<string, unknown> | null;
}

export class AutomationUpdateDto {
  orgId!: string;
  userId!: string;
  name?: string;
  triggerType?: string;
  triggerConfig?: Record<string, unknown> | null;
  condition?: AutomationConditionDto | null;
  actionType?: string;
  actionConfig?: Record<string, unknown> | null;
  enabled?: boolean;
}
