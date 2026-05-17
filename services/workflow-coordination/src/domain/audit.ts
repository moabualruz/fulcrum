export interface AppContext {
  orgId: string;
  userId: string | null;
  projectId?: string | null;
}

export interface AuditFilter {
  orgId?: string;
  projectId?: string;
  userId?: string;
  subjectKind?: string;
  verb?: string;
  dateRange?: {
    from?: Date;
    to?: Date;
  };
}

export interface AuditQueryInput extends AuditFilter {
  limit?: number;
  offset?: number;
}

export interface AuditEventDto {
  id: string;
  orgId: string;
  userId: string | null;
  verb: string;
  subjectKind: string;
  subjectId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: Date;
}

export interface AuditQueryResult {
  items: AuditEventDto[];
  total: number;
  limit: number;
  offset: number;
}

export type AuditExportResult =
  | { format: "json"; rows: AuditEventDto[] }
  | { format: "csv"; csv: string }
  | { jobId: string };

export interface RetentionPolicyDto {
  id: string;
  orgId: string;
  projectId: string | null;
  retainDays: number;
}

export interface RecordAuditEventInput {
  action: string;
  subjectKind: string;
  subjectId: string;
  payload?: Record<string, unknown>;
}
