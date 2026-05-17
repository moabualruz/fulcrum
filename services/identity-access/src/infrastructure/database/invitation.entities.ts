import { EntitySchema } from "typeorm";

import type { OrganizationRole } from "@identity-access/infrastructure/database/organization.entities.ts";

export type InvitationStatus = "pending" | "accepted" | "revoked";

export interface FulcrumInvitation {
  id: string;
  orgId: string;
  email: string;
  role: OrganizationRole;
  tokenHash: string;
  invitedBy: string;
  status: InvitationStatus;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export const FulcrumInvitationEntity = new EntitySchema<FulcrumInvitation>({
  name: "FulcrumInvitation",
  tableName: "fulcrum_invitations",
  columns: {
    id: { type: "varchar", length: 128, primary: true },
    orgId: { name: "org_id", type: "varchar", length: 128 },
    email: { type: "varchar", length: 255 },
    role: { type: "varchar", length: 80 },
    tokenHash: { name: "token_hash", type: "varchar", length: 128 },
    invitedBy: { name: "invited_by", type: "varchar", length: 128 },
    status: { type: "varchar", length: 80, default: "pending" },
    expiresAt: { name: "expires_at", type: "timestamptz" },
    acceptedAt: { name: "accepted_at", type: "timestamptz", nullable: true },
    revokedAt: { name: "revoked_at", type: "timestamptz", nullable: true },
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
  uniques: [{ name: "fulcrum_invitations_token_hash_key", columns: ["tokenHash"] }],
  indices: [
    { name: "fulcrum_invitations_org_email_idx", columns: ["orgId", "email"] },
    { name: "fulcrum_invitations_org_status_idx", columns: ["orgId", "status"] },
  ],
});

export const FULCRUM_INVITATION_ENTITIES = [FulcrumInvitationEntity];
