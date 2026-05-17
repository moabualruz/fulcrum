export class TemplateListQueryDto {
  orgId!: string;
  userId!: string;
  projectId?: string;
}

export class TemplateIdParamsDto {
  id!: string;
}

export class TemplateCreateDto {
  orgId!: string;
  userId!: string;
  projectId?: string | null;
  name!: string;
  description?: string | null;
  templateData!: Record<string, unknown>;
}

export class TemplateApplyDto {
  orgId!: string;
  userId!: string;
  overrides?: Record<string, unknown>;
}

export class TemplateDefaultDto {
  orgId!: string;
  userId!: string;
  projectId!: string;
}
