/**
 * Memory entity — durable project/global memory for context retrieval.
 */

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  Index,
  JoinColumn,
} from "typeorm";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import type { MemoryImportance, MemoryKind, MemorySource } from "./enums.ts";

const vectorTransformer = {
  to(value: number[] | null | undefined): string | null {
    if (value == null) return null;
    return JSON.stringify(value);
  },
  from(value: string | number[] | null | undefined): number[] | null {
    if (value == null) return null;
    if (Array.isArray(value)) return value.map(Number);
    return JSON.parse(value as string) as number[];
  },
};

@Entity("memories")
@Index("idx_memories_org_kind", ["org", "kind"])
@Index("memories_org_project_importance", ["org", "projectId", "importance"])
@Index("memories_org_kind", ["org", "kind"])
@Index("memories_org_archived", ["org", "archived"])
@Index("memories_org_global", ["org", "global"])
@Index() // expression: CREATE INDEX "memories_body_tsv" ON "memories" USING GIN (to_tsvector('english', body))
export class Memory {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org)
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "varchar", name: "project_id", nullable: true })
  projectId: string | null = null;

  @Column({ type: "boolean", name: "global", default: false })
  global: boolean = false;

  @Column({ type: "varchar", default: "note" })
  kind: MemoryKind = "note";

  @Column({ type: "text", default: "" })
  body: string = "";

  @Column({ type: "simple-array", default: "" })
  tags: string[] = [];

  @Column({ type: "varchar", default: "medium" })
  importance: MemoryImportance = "medium";

  @Column({ type: "varchar" })
  source!: MemorySource;

  @Column({ type: "jsonb", name: "source_ref", default: () => "'{}'" })
  sourceRef: Record<string, unknown> = {};

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", name: "updated_at", default: () => "now()" })
  updatedAt!: Date;

  @Column({ type: "boolean", name: "archived", default: false })
  archived: boolean = false;

  @Column({ type: "text", nullable: true, transformer: vectorTransformer })
  embedding?: number[];
}
