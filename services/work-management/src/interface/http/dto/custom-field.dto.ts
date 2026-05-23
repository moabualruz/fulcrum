import type { CustomFieldType } from "@work-management/infrastructure/database/custom-field-store.ts";

export class CustomFieldListQueryDto {
  orgId!: string;
  userId!: string;
  projectId?: string;
  includeArchived?: boolean;
  entityType?: string;
}

export class CustomFieldIdParamsDto {
  id!: string;
}

export class CustomFieldCreateDto {
  orgId!: string;
  userId!: string;
  projectId!: string;
  name!: string;
  type!: CustomFieldType;
  configJson?: Record<string, unknown>;
  required?: boolean;
}

export class CustomFieldUpdateDto {
  orgId!: string;
  userId!: string;
  name?: string;
  type?: CustomFieldType;
  configJson?: Record<string, unknown>;
  required?: boolean;
  position?: number;
}

export class CustomFieldReorderDto {
  orgId!: string;
  userId!: string;
  projectId!: string;
  orderedIds!: string[];
}

export class TaskCustomFieldSetDto {
  orgId!: string;
  userId!: string;
  taskId!: string;
  fieldDefId!: string;
  value!: unknown;
}

export class TaskCustomFieldBulkSetDto {
  orgId!: string;
  userId!: string;
  changes!: Array<{
    taskId: string;
    fieldDefId: string;
    value: unknown;
  }>;
}

export class TaskCustomFieldClearDto {
  orgId!: string;
  userId!: string;
  taskId!: string;
  fieldDefId!: string;
}
