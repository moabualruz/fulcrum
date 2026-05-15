import { EntitySchema } from "typeorm";

export interface FulcrumTenantSetting {
  id: string;
  orgId: string;
  key: string;
  value: unknown;
  createdAt?: Date;
  updatedAt?: Date;
}

export const FulcrumTenantSettingEntity = new EntitySchema<FulcrumTenantSetting>({
  name: "FulcrumTenantSetting",
  tableName: "tenant_settings",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    orgId: { name: "org_id", type: "varchar", length: 128 },
    key: { type: "varchar", length: 256 },
    value: { type: "jsonb" },
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
  uniques: [
    {
      name: "uq_tenant_settings_org_key",
      columns: ["orgId", "key"],
    },
  ],
  indices: [
    {
      name: "tenant_settings_org_key_idx",
      columns: ["orgId", "key"],
    },
  ],
});

export const FULCRUM_TENANT_SETTING_ENTITIES = [FulcrumTenantSettingEntity];
