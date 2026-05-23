import { EntitySchema } from "typeorm";

export interface WorkflowAuditEvent {
  id: string;
  orgId: string;
  projectId: string | null;
  userId: string | null;
  verb: string;
  subjectKind: string;
  subjectId: string | null;
  payload: Record<string, unknown>;
  traceId: string | null;
  createdAt?: Date;
}

export interface WorkflowAuditRetentionPolicy {
  id: string;
  orgId: string;
  projectId: string | null;
  retainDays: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface WorkflowAuditExportJob {
  id: string;
  orgId: string;
  status: "queued" | "running" | "completed" | "failed";
  format: "json" | "csv";
  content: string | null;
  error: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export const WorkflowAuditEventEntity = new EntitySchema<WorkflowAuditEvent>({
  name: "WorkflowAuditEvent",
  tableName: "fulcrum_audit_events",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    orgId: { name: "org_id", type: "varchar", length: 128 },
    projectId: { name: "project_id", type: "varchar", length: 128, nullable: true },
    userId: { name: "user_id", type: "varchar", length: 128, nullable: true },
    verb: { type: "varchar", length: 160 },
    subjectKind: { name: "subject_kind", type: "varchar", length: 80 },
    subjectId: { name: "subject_id", type: "varchar", length: 128, nullable: true },
    payload: {
      type: "jsonb",
      default: () => "'{}'::jsonb",
    },
    traceId: { name: "trace_id", type: "varchar", length: 160, nullable: true },
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
    },
  },
  indices: [
    { name: "fulcrum_audit_events_org_created_idx", columns: ["orgId", "createdAt"] },
    { name: "fulcrum_audit_events_org_project_idx", columns: ["orgId", "projectId"] },
    { name: "fulcrum_audit_events_org_subject_idx", columns: ["orgId", "subjectKind"] },
    { name: "fulcrum_audit_events_org_verb_idx", columns: ["orgId", "verb"] },
    { name: "fulcrum_audit_events_trace_idx", columns: ["traceId"] },
  ],
});

export const WorkflowAuditRetentionPolicyEntity = new EntitySchema<WorkflowAuditRetentionPolicy>({
  name: "WorkflowAuditRetentionPolicy",
  tableName: "event_retention_policy",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    orgId: { name: "org_id", type: "varchar", length: 128 },
    projectId: { name: "project_id", type: "varchar", length: 128, nullable: true },
    retainDays: { name: "retain_days", type: "integer", default: 0 },
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
    },
    updatedAt: {
      name: "updated_at",
      type: "timestamptz",
      updateDate: true,
    },
  },
  indices: [
    { name: "event_retention_policy_org_idx", columns: ["orgId"] },
  ],
  uniques: [
    { name: "uq_event_retention_policy_org_project", columns: ["orgId", "projectId"] },
  ],
});

export const WorkflowAuditExportJobEntity = new EntitySchema<WorkflowAuditExportJob>({
  name: "WorkflowAuditExportJob",
  tableName: "fulcrum_audit_export_jobs",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    orgId: { name: "org_id", type: "varchar", length: 128 },
    status: { type: "varchar", length: 80 },
    format: { type: "varchar", length: 20 },
    content: { type: "text", nullable: true },
    error: { type: "text", nullable: true },
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
    },
    updatedAt: {
      name: "updated_at",
      type: "timestamptz",
      updateDate: true,
    },
  },
  indices: [
    { name: "fulcrum_audit_export_jobs_org_created_idx", columns: ["orgId", "createdAt"] },
  ],
});

export const WORKFLOW_AUDIT_ENTITIES = [
  WorkflowAuditEventEntity,
  WorkflowAuditRetentionPolicyEntity,
  WorkflowAuditExportJobEntity,
];
