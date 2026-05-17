import { EntitySchema } from "typeorm";

export type OrganizationRole = "owner" | "admin" | "member" | "guest";

export interface OrganizationMember {
  id: string;
  orgId: string;
  userId: string;
  role: OrganizationRole;
  joinedAt?: Date;
}

export const OrganizationMemberEntity = new EntitySchema<OrganizationMember>({
  name: "OrganizationMember",
  tableName: "fulcrum_organization_members",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    orgId: { name: "org_id", type: "varchar", length: 128 },
    userId: { name: "user_id", type: "varchar", length: 128 },
    role: { type: "varchar", length: 80 },
    joinedAt: {
      name: "joined_at",
      type: "timestamptz",
      createDate: true,
    },
  },
  uniques: [{ name: "fulcrum_organization_members_org_user_key", columns: ["orgId", "userId"] }],
  indices: [
    { name: "fulcrum_organization_members_org_role_idx", columns: ["orgId", "role"] },
    { name: "fulcrum_organization_members_user_idx", columns: ["userId"] },
  ],
});

export const FULCRUM_IDENTITY_ACCESS_ENTITIES = [
  OrganizationMemberEntity,
];
