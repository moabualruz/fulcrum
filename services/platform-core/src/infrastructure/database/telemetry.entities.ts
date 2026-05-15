import { EntitySchema } from "typeorm";

export interface FulcrumTelemetrySetting {
  id: string;
  orgId: string;
  optedIn: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FulcrumTelemetryEvent {
  id: string;
  orgId: string;
  userId: string | null;
  kind: string;
  payload: Record<string, unknown>;
  occurredAt?: Date;
}

export const FulcrumTelemetrySettingEntity = new EntitySchema<FulcrumTelemetrySetting>({
  name: "FulcrumTelemetrySetting",
  tableName: "fulcrum_telemetry_settings",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    orgId: { name: "org_id", type: "varchar", length: 128 },
    optedIn: { name: "opted_in", type: "boolean", default: false },
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
  uniques: [{ name: "fulcrum_telemetry_settings_org_key", columns: ["orgId"] }],
});

export const FulcrumTelemetryEventEntity = new EntitySchema<FulcrumTelemetryEvent>({
  name: "FulcrumTelemetryEvent",
  tableName: "fulcrum_telemetry_events",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    orgId: { name: "org_id", type: "varchar", length: 128 },
    userId: { name: "user_id", type: "varchar", length: 128, nullable: true },
    kind: { type: "varchar", length: 160 },
    payload: { type: "jsonb", default: {} },
    occurredAt: {
      name: "occurred_at",
      type: "timestamptz",
      createDate: true,
    },
  },
  indices: [
    { name: "fulcrum_telemetry_events_org_occurred_idx", columns: ["orgId", "occurredAt"] },
    { name: "fulcrum_telemetry_events_org_user_kind_idx", columns: ["orgId", "userId", "kind"] },
  ],
});

export const FULCRUM_TELEMETRY_ENTITIES = [
  FulcrumTelemetrySettingEntity,
  FulcrumTelemetryEventEntity,
];
