import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
} from "typeorm";

import { Org } from "../auth/Org.ts";

@Entity("field_dependency_rules")
@Index("field_dependency_rules_project", ["projectId"])
export class FieldDependencyRule {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ name: "project_id" })
  projectId!: string;

  @Column({ name: "source_field_id" })
  sourceFieldId!: string;

  @Column({ name: "source_value" })
  sourceValue!: string;

  @Column({ name: "target_field_id" })
  targetFieldId!: string;

  @Column()
  action!: string;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;
}
