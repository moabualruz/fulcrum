import { EntitySchema } from "typeorm";

export type FulcrumJobStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export interface FulcrumJob {
  id: string;
  orgId: string;
  projectId: string | null;
  traceId: string | null;
  queue: string;
  kind: string;
  payload: Record<string, unknown>;
  status: FulcrumJobStatus;
  attempts: number;
  maxAttempts: number;
  availableAt: Date;
  lockedBy: string | null;
  lockedAt: Date | null;
  lastError: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export const FulcrumJobEntity = new EntitySchema<FulcrumJob>({
  name: "FulcrumJob",
  tableName: "fulcrum_jobs",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    orgId: { name: "org_id", type: "varchar", length: 128 },
    projectId: { name: "project_id", type: "varchar", length: 128, nullable: true },
    traceId: { name: "trace_id", type: "varchar", length: 160, nullable: true },
    queue: { type: "varchar", length: 120 },
    kind: { type: "varchar", length: 120 },
    payload: {
      type: "jsonb",
      default: () => "'{}'::jsonb",
    },
    status: { type: "varchar", length: 40 },
    attempts: { type: "integer", default: 0 },
    maxAttempts: { name: "max_attempts", type: "integer", default: 3 },
    availableAt: { name: "available_at", type: "timestamptz" },
    lockedBy: { name: "locked_by", type: "varchar", length: 160, nullable: true },
    lockedAt: { name: "locked_at", type: "timestamptz", nullable: true },
    lastError: { name: "last_error", type: "text", nullable: true },
    createdAt: { name: "created_at", type: "timestamptz", createDate: true },
    updatedAt: { name: "updated_at", type: "timestamptz", updateDate: true },
  },
  indices: [
    { name: "fulcrum_jobs_claim_idx", columns: ["queue", "status", "availableAt", "createdAt"] },
    { name: "fulcrum_jobs_scope_idx", columns: ["orgId", "projectId", "status"] },
    { name: "fulcrum_jobs_kind_idx", columns: ["queue", "kind"] },
    { name: "fulcrum_jobs_trace_idx", columns: ["traceId"] },
  ],
});

export const FULCRUM_JOB_QUEUE_ENTITIES = [
  FulcrumJobEntity,
];
