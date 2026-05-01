/**
 * Session entity — auth domain.
 *
 * C2: Composite (user_id, expires_at) index; org index for tenant-scoped queries.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 *     Stage-3 decorators do NOT emit reflect-metadata type info — explicit `type`
 *     is required on every @Property/@PrimaryKey decorator.
 * C8: Class IS the type; @Entity({ repository }) wires SessionRepository.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  Index,
} from "@mikro-orm/decorators/es";
import { SessionRepository } from "../../repositories/auth/SessionRepository.ts";

@Entity({ tableName: "sessions", repository: () => SessionRepository })
@Index({ name: "idx_sessions_user_expires", properties: ["userId", "expiresAt"] })
@Index({ name: "idx_sessions_org", properties: ["orgId"] })
export class Session {
  // Sessions use text PK (opaque token) compatible with Better-Auth
  @PrimaryKey({ type: "string" })
  id!: string;

  @Property({ type: "uuid", fieldName: "user_id" })
  userId!: string;

  @Property({ type: "uuid", fieldName: "org_id" })
  orgId!: string;

  // Nullable: users may be in multiple orgs; active org tracks context
  @Property({ type: "uuid", fieldName: "active_organization_id", nullable: true })
  activeOrganizationId?: string;

  @Property({ type: "datetime", fieldName: "expires_at" })
  expiresAt!: Date;

  @Property({ type: "string", fieldName: "ip_address", nullable: true })
  ipAddress?: string;

  @Property({ type: "string", fieldName: "user_agent", nullable: true })
  userAgent?: string;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
