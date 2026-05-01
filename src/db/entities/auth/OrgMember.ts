/**
 * OrgMember entity — auth domain.
 *
 * C2: Composite (org_id, user_id) index + unique constraint.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 *     Stage-3 decorators do NOT emit reflect-metadata type info — explicit `type`
 *     is required on every @Property/@PrimaryKey decorator.
 * C8: Class IS the type; @Entity({ repository }) wires OrgMemberRepository.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  Index,
  Unique,
} from "@mikro-orm/decorators/es";
import { OrgMemberRepository } from "../../repositories/auth/OrgMemberRepository.ts";

@Entity({ tableName: "org_members", repository: () => OrgMemberRepository })
@Index({ name: "idx_org_members_org_user", properties: ["orgId", "userId"] })
@Index({ name: "idx_org_members_user", properties: ["userId"] })
@Unique({ name: "uq_org_members_org_user", properties: ["orgId", "userId"] })
export class OrgMember {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "uuid", fieldName: "org_id" })
  orgId!: string;

  @Property({ type: "uuid", fieldName: "user_id" })
  userId!: string;

  @Property({ type: "string" })
  role: string = "member";

  @Property({ type: "datetime", fieldName: "joined_at", defaultRaw: "now()" })
  joinedAt!: Date;
}
