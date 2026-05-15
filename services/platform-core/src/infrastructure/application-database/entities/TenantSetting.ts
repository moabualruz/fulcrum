import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column,
  Unique,
  UpdateDateColumn,
} from "typeorm";

@Entity("tenant_settings")
@Unique("uq_tenant_settings_org_key", ["orgId", "key"])
@Index("tenant_settings_org_key_idx", ["orgId", "key"])
export class TenantSetting {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", name: "org_id" })
  orgId!: string;

  @Column({ type: "varchar" })
  key!: string;

  @Column({ type: "jsonb", default: () => "'{}'" })
  value!: unknown;

  @Column({ type: "timestamptz", name: "created_at", default: () => "now()" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz", name: "updated_at" })
  updatedAt!: Date;
}
