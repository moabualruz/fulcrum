/**
 * FulcrumSkill entity — skills registry domain (Pillar 5).
 *
 * Canonical per-org registry row for a skill installed into per-agent skill
 * folders. `enabledAgents` mirrors `skills.lock.json[slug].enabled_agents`.
 *
 * C2/Q22: tenant-scoped by org with composite unique index (org_id, slug).
 * C7: MikroORM v7 ES Stage-3 decorator pattern.
 * C8: @Entity({ repository }) wires FulcrumSkillRepository.
 */

import { Collection } from "@mikro-orm/core";
import {
  Entity,
  Enum,
  ManyToOne,
  OneToMany,
  PrimaryKey,
  Property,
  Unique,
} from "@mikro-orm/decorators/es";
import { Org } from "../auth/Org.ts";
import { FulcrumSkillRepository } from "../../repositories/skills/FulcrumSkillRepository.ts";
import { SkillVersion } from "./SkillVersion.ts";

export enum SkillSource {
  Upstream = "upstream",
  Local = "local",
  Package = "package",
}

@Entity({ tableName: "fulcrum_skills", repository: () => FulcrumSkillRepository })
@Unique({ name: "fulcrum_skills_org_slug", properties: ["org", "slug"] })
export class FulcrumSkill {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, {
    fieldName: "org_id",
    nullable: false,
    deleteRule: "cascade",
  })
  org!: Org;

  @Property({ type: "string" })
  name!: string;

  @Property({ type: "string" })
  slug!: string;

  @Enum({ items: () => SkillSource })
  source!: SkillSource;

  @Property({ type: "string", fieldName: "upstream_repo", nullable: true })
  upstreamRepo?: string;

  @Property({ type: "string", fieldName: "upstream_ref", nullable: true })
  upstreamRef?: string;

  @Property({ type: "json", fieldName: "enabled_agents" })
  enabledAgents: string[] = [];

  @OneToMany(() => SkillVersion, (version) => version.skill)
  versions = new Collection<SkillVersion>(this);
}
