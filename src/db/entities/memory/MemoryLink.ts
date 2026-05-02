/**
 * MemoryLink entity — provenance/link rows from memory to task/doc/run/artifact.
 */

import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/decorators/es";
import { Org } from "../auth/Org.ts";
import { Memory } from "./Memory.ts";
import type { MemoryLinkTargetKind } from "./enums.ts";

@Entity({ tableName: "memory_links" })
@Index({ name: "memory_links_memory", properties: ["org", "memory"] })
@Index({ name: "memory_links_target", properties: ["org", "targetKind", "targetId"] })
export class MemoryLink {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  @ManyToOne(() => Memory, {
    fieldName: "memory_id",
    nullable: false,
    deleteRule: "cascade",
  })
  memory!: Memory;

  @Property({
    type: "string",
    fieldName: "target_kind",
    check: "target_kind in ('task','doc','agent_run','artifact')",
  })
  targetKind!: MemoryLinkTargetKind;

  @Property({ type: "uuid", fieldName: "target_id" })
  targetId!: string;
}
