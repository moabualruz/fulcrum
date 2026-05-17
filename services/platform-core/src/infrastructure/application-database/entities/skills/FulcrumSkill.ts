/**
 * FulcrumSkill entity — skills registry domain (Pillar 5).
 */

import {
  Entity,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Column,
  Unique,
  JoinColumn,
} from "typeorm";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { SkillVersion } from "./SkillVersion.ts";

export enum SkillSource {
  Upstream = "upstream",
  Local = "local",
  Package = "package",
}

@Entity("fulcrum_skills")
@Unique("fulcrum_skills_org_slug", ["org", "slug"])
export class FulcrumSkill {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "varchar" })
  slug!: string;

  @Column({ type: "varchar" })
  source!: SkillSource;

  @Column({ type: "varchar", name: "upstream_repo", nullable: true })
  upstreamRepo?: string;

  @Column({ type: "varchar", name: "upstream_ref", nullable: true })
  upstreamRef?: string;

  @Column({ type: "jsonb", name: "enabled_agents" })
  enabledAgents: string[] = [];

  @OneToMany(() => SkillVersion, (version) => version.skill)
  versions!: SkillVersion[];
}
