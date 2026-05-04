/**
 * SkillVersion entity — version/hash history for a FulcrumSkill.
 *
 * Stores version strings and the last verified SKILL.md hash for install,
 * upgrade, rollback, and upstream conflict handling.
 */

import {
  Entity,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/decorators/es";
import { FulcrumSkill } from "./FulcrumSkill.ts";

@Entity({ tableName: "skill_versions" })
export class SkillVersion {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => FulcrumSkill, {
    fieldName: "skill_id",
    nullable: false,
    deleteRule: "cascade",
  })
  skill!: FulcrumSkill;

  @Property({ type: "string" })
  version!: string;

  @Property({ type: "string", fieldName: "hash_verified", nullable: true })
  hashVerified: string | null = null;
}
