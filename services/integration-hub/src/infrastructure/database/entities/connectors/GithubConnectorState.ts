import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
} from "typeorm";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";

@Entity("github_connector_state")
@Index("github_connector_state_org_project", ["org", "projectId"])
@Index() // expression: CREATE UNIQUE INDEX "github_connector_state_installation_repo_unique" ON "github_connector_state" ("installation_id", "repo_full_name")
export class GithubConnectorState {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE", eager: true })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "varchar", name: "project_id" })
  projectId!: string;

  @Column({ type: "varchar", name: "installation_id" })
  installationId!: string;

  @Column({ type: "varchar", name: "repo_full_name" })
  repoFullName!: string;

  @Column({ type: "varchar", nullable: true })
  cursor?: string | null;

  @Column({ type: "jsonb" })
  payload: Record<string, unknown> = {};

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", name: "updated_at", default: () => "now()" })
  updatedAt!: Date;
}
