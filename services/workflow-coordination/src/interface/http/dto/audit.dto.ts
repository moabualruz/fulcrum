export class AuditListQueryDto {
  orgId!: string;
  projectId?: string;
  userId?: string;
  kind?: string;
  subjectId?: string;
  verb?: string;
  traceId?: string;
  since?: string;
  until?: string;
  limit?: number | string;
  offset?: number | string;
}

export class AuditExportQueryDto extends AuditListQueryDto {
  format?: "json" | "csv";
}

export class AuditExportStatusParamDto {
  jobId!: string;
}

export class AuditExportStatusQueryDto {
  orgId!: string;
}

export class AuditExportStatusResponseDto {
  status!: "queued" | "running" | "completed" | "failed";
  format?: "json" | "csv";
  content?: string;
  error?: string;
}

export class AuditListResponseDto {
  data!: unknown[];
  total!: number;
}

export class AuditRetentionPolicyQueryDto {
  orgId!: string;
  projectId?: string;
}

export class AuditRetentionPolicySetBodyDto {
  retainDays!: number | string;
}

export class AuditRetentionPolicyResponseDto {
  id!: string;
  orgId!: string;
  projectId!: string | null;
  retainDays!: number;
  createdAt!: string;
  updatedAt!: string;
}
