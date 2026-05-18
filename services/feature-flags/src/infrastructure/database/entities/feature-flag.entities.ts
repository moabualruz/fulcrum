import { EntitySchema } from "typeorm";

export interface PlatformFeatureFlag {
  id: string;
  orgId: string | null;
  userId: string | null;
  flag: string;
  enabled: boolean;
  rolloutPercent: number;
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

export const PlatformFeatureFlagEntity = new EntitySchema<PlatformFeatureFlag>({
  name: "PlatformFeatureFlag",
  tableName: "fulcrum_feature_flags",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    orgId: { name: "org_id", type: "varchar", length: 128, nullable: true },
    userId: { name: "user_id", type: "varchar", length: 128, nullable: true },
    flag: { type: "varchar", length: 160 },
    enabled: { type: "boolean", default: false },
    rolloutPercent: { name: "rollout_percent", type: "integer", default: 100 },
    ...timestampColumns,
  },
  indices: [
    { name: "fulcrum_feature_flags_scope_idx", columns: ["orgId", "userId", "flag"] },
    { name: "fulcrum_feature_flags_flag_idx", columns: ["flag"] },
  ],
});

export const PLATFORM_FEATURE_FLAG_ENTITIES = [PlatformFeatureFlagEntity];
