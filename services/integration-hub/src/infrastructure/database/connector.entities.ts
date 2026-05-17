import { EntitySchema } from "typeorm";

export type IntegrationConnectorRunStatus = "queued" | "running" | "completed" | "failed";

export interface IntegrationConnectorState {
  id: string;
  orgId: string;
  connectorId: string;
  enabled: boolean;
  configJson: Record<string, unknown> | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface IntegrationConnectorRun {
  id: string;
  orgId: string;
  connectorId: string;
  status: IntegrationConnectorRunStatus;
  trigger: string;
  summaryJson: Record<string, unknown> | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const timestampColumns = {
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
} as const;

export const IntegrationConnectorStateEntity = new EntitySchema<IntegrationConnectorState>({
  name: "IntegrationConnectorState",
  tableName: "fulcrum_connector_states",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    orgId: { name: "org_id", type: "varchar", length: 128 },
    connectorId: { name: "connector_id", type: "varchar", length: 128 },
    enabled: { type: "boolean", default: false },
    configJson: { name: "config_json", type: "jsonb", nullable: true },
    ...timestampColumns,
  },
  uniques: [
    { name: "fulcrum_connector_states_org_connector_key", columns: ["orgId", "connectorId"] },
  ],
  indices: [
    { name: "fulcrum_connector_states_org_enabled_idx", columns: ["orgId", "enabled"] },
  ],
});

export const IntegrationConnectorRunEntity = new EntitySchema<IntegrationConnectorRun>({
  name: "IntegrationConnectorRun",
  tableName: "fulcrum_connector_runs",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    orgId: { name: "org_id", type: "varchar", length: 128 },
    connectorId: { name: "connector_id", type: "varchar", length: 128 },
    status: { type: "varchar", length: 40 },
    trigger: { type: "varchar", length: 80 },
    summaryJson: { name: "summary_json", type: "jsonb", nullable: true },
    startedAt: { name: "started_at", type: "timestamptz", nullable: true },
    completedAt: { name: "completed_at", type: "timestamptz", nullable: true },
    ...timestampColumns,
  },
  indices: [
    { name: "fulcrum_connector_runs_org_connector_idx", columns: ["orgId", "connectorId"] },
    { name: "fulcrum_connector_runs_org_status_idx", columns: ["orgId", "status"] },
    { name: "fulcrum_connector_runs_created_idx", columns: ["createdAt"] },
  ],
});

export const INTEGRATION_HUB_CONNECTOR_ENTITIES = [
  IntegrationConnectorStateEntity,
  IntegrationConnectorRunEntity,
];
