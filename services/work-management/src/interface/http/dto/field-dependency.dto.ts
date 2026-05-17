import type { FieldDependencyAction } from "@work-management/infrastructure/database/field-dependency-store.ts";

export class FieldDependencyListQueryDto {
  orgId!: string;
  userId!: string;
  projectId!: string;
}

export class FieldDependencyIdParamsDto {
  id!: string;
}

export class FieldDependencyCreateDto {
  orgId!: string;
  userId!: string;
  projectId!: string;
  sourceFieldId!: string;
  sourceValue!: string;
  targetFieldId!: string;
  action!: FieldDependencyAction;
}

export class FieldDependencyDeleteQueryDto {
  orgId!: string;
  userId!: string;
}
