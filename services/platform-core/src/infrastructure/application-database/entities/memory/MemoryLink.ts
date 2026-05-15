/**
 * MemoryLink entity — provenance/link rows from memory to task/doc/run/artifact.
 */

import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  Unique,
  JoinColumn,
} from "typeorm";
import { Org } from "../auth/Org.ts";
import { Memory } from "./Memory.ts";
import type { MemoryLinkTargetKind } from "./enums.ts";

@Entity("memory_links")
@Index("memory_links_memory", ["org", "memory"])
@Index("memory_links_target", ["org", "targetKind", "targetId"])
@Unique("memory_links_memory_target_dedup", ["memory", "targetKind", "targetId"])
export class MemoryLink {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @ManyToOne(() => Memory, { onDelete: "CASCADE" })
  @JoinColumn({ name: "memory_id" })
  memory!: Memory;

  @Column({ name: "target_kind" })
  targetKind!: MemoryLinkTargetKind;

  @Column({ name: "target_id" })
  targetId!: string;
}
