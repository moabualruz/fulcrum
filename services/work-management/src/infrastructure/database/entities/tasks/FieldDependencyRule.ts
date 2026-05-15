import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
} from "typeorm";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";

@Entity("field_dependency_rules")
@Index("field_dependency_rules_project", ["projectId"])
export class FieldDependencyRule {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "varchar", name: "project_id" })
  projectId!: string;

  @Column({ type: "varchar", name: "source_field_id" })
  sourceFieldId!: string;

  @Column({ type: "varchar", name: "source_value" })
  sourceValue!: string;

  @Column({ type: "varchar", name: "target_field_id" })
  targetFieldId!: string;

  @Column({ type: "varchar" })
  action!: string;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;
}
