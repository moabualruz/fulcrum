import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
} from "typeorm";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";

@Entity("audit_exports")
@Index("audit_exports_org_project", ["org", "projectId"])
export class AuditExport {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "varchar", name: "project_id" })
  projectId!: string;

  @Column({ type: "varchar", name: "requested_by_user_id" })
  requestedByUserId!: string;

  @Column({ type: "varchar" })
  status!: string;

  @Column({ type: "varchar" })
  format!: string;

  @Column({ type: "jsonb" })
  filters: Record<string, unknown> = {};

  @Column({ type: "varchar", name: "download_url", nullable: true })
  downloadUrl?: string | null;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", name: "updated_at", default: () => "now()" })
  updatedAt!: Date;
}
