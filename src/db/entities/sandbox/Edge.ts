/**
 * Edge entity — cross-domain relationship graph (P4#03/Q32).
 *
 * C2/Q22: org-scoped indexes cover directional graph lookups.
 * C6/C7: schema via MikroORM v7 decorator class, not app-code SQL.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Index,
  Unique,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";
import { Org } from "../auth/Org.ts";
import { EdgeRepository } from "../../repositories/sandbox/EdgeRepository.ts";

@Entity({ tableName: "edges", repository: () => EdgeRepository })
@Unique({
  name: "edges_from_to_kind",
  properties: ["org", "fromKind", "fromId", "toKind", "toId", "kind"],
})
@Index({
  name: "edges_to_lookup",
  properties: ["org", "toKind", "toId", "kind"],
})
export class Edge {
  [OptionalProps]?: "createdAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false })
  org!: Org;

  @Property({ type: "string", fieldName: "from_kind" })
  fromKind!: string;

  @Property({ type: "uuid", fieldName: "from_id" })
  fromId!: string;

  @Property({ type: "string", fieldName: "to_kind" })
  toKind!: string;

  @Property({ type: "uuid", fieldName: "to_id" })
  toId!: string;

  @Property({ type: "string" })
  kind!: string;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
