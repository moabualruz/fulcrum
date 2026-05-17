import { EntitySchema } from "typeorm";

export interface FulcrumErrorLog {
  id: string;
  orgId: string;
  userId: string | null;
  occurredAt?: Date;
  os: string | null;
  arch: string | null;
  bunVersion: string | null;
  fulcrumVersion: string | null;
  recentCliCommand: string | null;
  recentProcedure: string | null;
  errorMessage: string;
  stackTrace: string | null;
  context: Record<string, unknown>;
}

export const FulcrumErrorLogEntity = new EntitySchema<FulcrumErrorLog>({
  name: "FulcrumErrorLog",
  tableName: "fulcrum_error_logs",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    orgId: { name: "org_id", type: "varchar", length: 128 },
    userId: { name: "user_id", type: "varchar", length: 128, nullable: true },
    occurredAt: {
      name: "occurred_at",
      type: "timestamptz",
      createDate: true,
    },
    os: { type: "varchar", length: 80, nullable: true },
    arch: { type: "varchar", length: 80, nullable: true },
    bunVersion: { name: "bun_version", type: "varchar", length: 80, nullable: true },
    fulcrumVersion: { name: "fulcrum_version", type: "varchar", length: 80, nullable: true },
    recentCliCommand: { name: "recent_cli_command", type: "text", nullable: true },
    recentProcedure: { name: "recent_procedure", type: "varchar", length: 255, nullable: true },
    errorMessage: { name: "error_message", type: "text" },
    stackTrace: { name: "stack_trace", type: "text", nullable: true },
    context: { type: "jsonb", default: {} },
  },
  indices: [
    { name: "fulcrum_error_logs_org_occurred_idx", columns: ["orgId", "occurredAt"] },
  ],
});

export const FULCRUM_ERROR_LOG_ENTITIES = [FulcrumErrorLogEntity];
