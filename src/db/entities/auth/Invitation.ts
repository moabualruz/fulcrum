/**
 * Invitation entity — auth domain.
 *
 * C2: Composite (org_id, email) index for tenant-scoped queries.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 *     Stage-3 decorators do NOT emit reflect-metadata type info — explicit `type`
 *     is required on every @Property/@PrimaryKey decorator.
 * C8: Class IS the type; @Entity({ repository }) wires InvitationRepository.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  Index,
  Unique,
} from "@mikro-orm/decorators/es";
import { InvitationRepository } from "../../repositories/auth/InvitationRepository.ts";

@Entity({ tableName: "invitations", repository: () => InvitationRepository })
@Index({ name: "idx_invitations_org_email", properties: ["orgId", "email"] })
@Unique({ name: "uq_invitations_token", properties: ["token"] })
export class Invitation {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "uuid", fieldName: "org_id" })
  orgId!: string;

  @Property({ type: "string" })
  email!: string;

  @Property({ type: "string" })
  role: string = "member";

  @Property({ type: "string" })
  token!: string;

  // Who sent the invite (nullable — system-generated invites have no user)
  @Property({ type: "uuid", fieldName: "invited_by", nullable: true })
  invitedById?: string;

  @Property({ type: "datetime", fieldName: "accepted_at", nullable: true })
  acceptedAt?: Date;

  @Property({ type: "datetime", fieldName: "expires_at" })
  expiresAt!: Date;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
