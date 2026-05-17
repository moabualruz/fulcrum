import { EntitySchema } from "typeorm";

export interface FulcrumThemeSetting {
  id: string;
  orgId: string;
  userId: string;
  key: string;
  value: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export const FulcrumThemeSettingEntity = new EntitySchema<FulcrumThemeSetting>({
  name: "FulcrumThemeSetting",
  tableName: "fulcrum_theme_settings",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    orgId: { name: "org_id", type: "varchar", length: 128 },
    userId: { name: "user_id", type: "varchar", length: 128 },
    key: { name: "setting_key", type: "varchar", length: 160 },
    value: { name: "setting_value", type: "text" },
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
      name: "fulcrum_theme_settings_scope_key",
      columns: ["orgId", "userId", "key"],
    },
  ],
  indices: [
    {
      name: "fulcrum_theme_settings_scope_idx",
      columns: ["orgId", "userId"],
    },
  ],
});

export const FULCRUM_THEME_SETTING_ENTITIES = [FulcrumThemeSettingEntity];
