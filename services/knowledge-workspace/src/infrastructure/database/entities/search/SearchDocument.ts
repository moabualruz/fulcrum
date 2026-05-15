/**
 * SearchDocument entity — search domain (Pillar 11 stub).
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

@Entity("search_documents")
@Index("idx_search_documents_org_subject", ["org", "entityKind", "entityId"])
@Index() // expression: CREATE INDEX IF NOT EXISTS "search_documents_fts" ON "search_documents" USING GIN (to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'')))
export class SearchDocument {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org)
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "varchar", name: "entity_kind" })
  entityKind!: string;

  @Column({ type: "varchar", name: "entity_id" })
  entityId!: string;

  @Column({ type: "text", nullable: true, transformer: vectorTransformer })
  embedding?: number[];

  @Column({ type: "varchar", nullable: true })
  title?: string;

  @Column({ type: "text", nullable: true })
  body?: string;

  @Column({ type: "simple-array", nullable: true })
  labels?: string[];

  @Column({ type: "jsonb", nullable: true })
  metadata?: Record<string, unknown>;

  @Column({ type: "timestamptz", nullable: true, name: "updated_at" })
  updatedAt?: Date;

  @Column({ type: "varchar", name: "project_id", nullable: true })
  projectId?: string | null;

  @Column({ type: "varchar", nullable: true })
  status?: string | null;
}
