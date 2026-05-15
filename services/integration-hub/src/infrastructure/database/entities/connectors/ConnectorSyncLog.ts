import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
} from "typeorm";

import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";

@Entity("connector_sync_log")
@Index("connector_sync_log_org_connector", ["org", "connector"])
export class ConnectorSyncLog {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org, { onDelete: "CASCADE", eager: true })
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "varchar" })
  connector!: string;

  @Column({ type: "varchar" })
  status!: string;

  @Column({ type: "timestamptz", name: "last_run_at", default: () => "now()" })
  lastRunAt!: Date;

  @Column({ type: "text", nullable: true })
  error: string | null = null;
}
