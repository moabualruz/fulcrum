export class ErrorLogListQueryDto {
  orgId!: string;
  userId!: string;
  limit?: number;
  offset?: number;
  since?: string;
  includeTotal?: boolean | string;
}

export class ErrorLogScopeQueryDto {
  orgId!: string;
  userId!: string;
}

export class ErrorLogClearQueryDto extends ErrorLogScopeQueryDto {
  before?: string;
}

export class ErrorLogParamsDto {
  id!: string;
}
