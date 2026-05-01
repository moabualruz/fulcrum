/**
 * User entity — auth domain.
 *
 * C2: Composite (org_id, email) index + unique constraint for tenant-scoped queries.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 *     Stage-3 decorators do NOT emit reflect-metadata type info — explicit `type`
 *     is required on every @Property/@PrimaryKey decorator.
 * C8: Class IS the type; @Entity({ repository }) wires UserRepository so
 *     em.getRepository(User) returns the typed subclass.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  Enum,
  Index,
  Unique,
} from "@mikro-orm/decorators/es";
import { UserRepository } from "../../repositories/auth/UserRepository.ts";

@Entity({ tableName: "users", repository: () => UserRepository })
@Index({ name: "idx_users_org_email", properties: ["orgId", "email"] })
@Unique({ name: "uq_users_org_email", properties: ["orgId", "email"] })
export class User {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "uuid", fieldName: "org_id" })
  orgId!: string;

  @Property({ type: "string" })
  email!: string;

  @Property({ type: "string", nullable: true })
  name?: string;

  @Property({ type: "string", fieldName: "avatar_url", nullable: true })
  avatarUrl?: string;

  @Enum({ items: () => ["owner", "admin", "member", "guest"] as const })
  role: "owner" | "admin" | "member" | "guest" = "member";

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;
}
