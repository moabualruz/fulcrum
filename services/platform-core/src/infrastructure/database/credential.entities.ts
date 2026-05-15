import { EntitySchema } from "typeorm";

export interface FulcrumCredential {
  id: string;
  orgId: string;
  userId: string;
  name: string;
  encryptedValue: string;
  algo: string;
  kdf: string;
  provider: string;
  archived: boolean;
  lastUsedAt: Date | null;
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

export const FulcrumCredentialEntity = new EntitySchema<FulcrumCredential>({
  name: "FulcrumCredential",
  tableName: "fulcrum_credentials",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    orgId: { name: "org_id", type: "varchar", length: 128 },
    userId: { name: "user_id", type: "varchar", length: 128 },
    name: { type: "varchar", length: 255 },
    encryptedValue: { name: "encrypted_value", type: "text" },
    algo: { type: "varchar", length: 80 },
    kdf: { type: "varchar", length: 80 },
    provider: { type: "varchar", length: 80, default: "local" },
    archived: { type: "boolean", default: false },
    lastUsedAt: { name: "last_used_at", type: "timestamptz", nullable: true },
    ...timestampColumns,
  },
  uniques: [{ name: "fulcrum_credentials_org_user_name_key", columns: ["orgId", "userId", "name"] }],
  indices: [
    { name: "fulcrum_credentials_org_user_archived_idx", columns: ["orgId", "userId", "archived"] },
    { name: "fulcrum_credentials_org_archived_idx", columns: ["orgId", "archived"] },
  ],
});

export const FULCRUM_CREDENTIAL_ENTITIES = [
  FulcrumCredentialEntity,
];
