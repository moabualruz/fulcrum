/**
 * SkillVersion entity — version/hash history for a FulcrumSkill.
 */

import {
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
} from "typeorm";
import { FulcrumSkill } from "./FulcrumSkill.ts";

@Entity("skill_versions")
export class SkillVersion {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => FulcrumSkill, (skill) => skill.versions, { onDelete: "CASCADE" })
  @JoinColumn({ name: "skill_id" })
  skill!: FulcrumSkill;

  @Column({ type: "varchar" })
  version!: string;

  @Column({ type: "varchar", name: "hash_verified", nullable: true })
  hashVerified: string | null = null;
}
