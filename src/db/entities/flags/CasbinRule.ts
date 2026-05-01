/**
 * CasbinRule entity — flags domain (Pillar 5: Permissions stub).
 *
 * Mirrors the `casbin_rule` schema expected by node-casbin's standard adapter
 * contract. The custom `FulcrumCasbinAdapter` (Pillar 5) implements the 5
 * adapter methods against `EntityRepository<CasbinRule>`. Rows are written
 * only when the `casbin-policies` feature flag is enabled.
 *
 * Schema columns required by node-casbin: id, ptype, v0..v5.
 *
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 * C8: @Entity({ repository }) wires CasbinRuleRepository.
 *
 * Note: NOT tenant-scoped here — CasbinRule's `v0` slot is conventionally the
 * subject (user/role) and Pillar 5 will use the `v0` namespace to encode
 * org_id (e.g., "org:<uuid>:role:owner"). Adding org FK + composite index
 * here would conflict with the node-casbin adapter contract.
 */

import { Entity, PrimaryKey, Property } from "@mikro-orm/decorators/es";
import { CasbinRuleRepository } from "../../repositories/flags/CasbinRuleRepository.ts";

@Entity({
  tableName: "casbin_rule",
  repository: () => CasbinRuleRepository,
})
export class CasbinRule {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  /** Policy type: "p" for permission, "g" for grouping (RBAC). */
  @Property({ type: "string" })
  ptype!: string;

  @Property({ type: "string", nullable: true })
  v0?: string;

  @Property({ type: "string", nullable: true })
  v1?: string;

  @Property({ type: "string", nullable: true })
  v2?: string;

  @Property({ type: "string", nullable: true })
  v3?: string;

  @Property({ type: "string", nullable: true })
  v4?: string;

  @Property({ type: "string", nullable: true })
  v5?: string;
}
