/**
 * Org entity — auth domain.
 *
 * Represents an organization (tenant). The well-known local org UUID
 * `00000000-0000-0000-0000-000000000001` (D4) is the synthetic default
 * org created by `fulcrum init` for local/single-user mode.
 *
 * C2: Schema includes org_id on every tenant-scoped table. Org IS the tenant root.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 * C8: @Entity({ repository }) wires OrgRepository so em.getRepository(Org) returns typed subclass.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  Unique,
} from "@mikro-orm/decorators/es";
import { OrgRepository } from "../../repositories/auth/OrgRepository.ts";

@Entity({ tableName: "orgs", repository: () => OrgRepository })
@Unique({ name: "uq_orgs_slug", properties: ["slug"] })
export class Org {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @Property({ type: "string" })
  name!: string;

  /** URL-safe org identifier (e.g. "local", "acme-corp"). */
  @Property({ type: "string" })
  slug!: string;

  @Property({ type: "string", nullable: true, fieldName: "avatar_url" })
  avatarUrl?: string;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;
}
