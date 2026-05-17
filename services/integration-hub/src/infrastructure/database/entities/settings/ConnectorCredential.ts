import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
} from "typeorm";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";

@Entity("connector_credentials")
@Index("connector_credentials_org_project", ["org", "projectId"])
@Index() // expression: CREATE UNIQUE INDEX "connector_credentials_provider_account_unique" ON "connector_credentials" ("org_id", "provider", "account_id")
export class ConnectorCredential {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE" })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "varchar", name: "project_id" })
  projectId!: string;

  @Column({ type: "varchar" })
  provider!: string;

  @Column({ type: "varchar", name: "account_id" })
  accountId!: string;

  @Column({ type: "varchar" })
  label!: string;

  @Column({ type: "text", name: "encrypted_secret" })
  encryptedSecret!: string;

  @Column({ type: "jsonb" })
  metadata: Record<string, unknown> = {};

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @Column({ type: "timestamptz", name: "updated_at", default: () => "now()" })
  updatedAt!: Date;
}
