/**
 * ProviderCredential entity — gated external/local inference backend config.
 */

import {
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  JoinColumn,
} from "typeorm";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";

export type InferenceProvider = "ollama" | "lm-studio" | "openai-compatible";

@Entity("provider_credentials")
@Index("provider_credentials_org_provider_active", ["org", "provider", "active"])
export class ProviderCredential {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Org)
  @JoinColumn({ name: "org_id" })
  org!: Org;

  @Column({ type: "varchar" })
  provider!: InferenceProvider;

  @Column({ type: "varchar", name: "base_url" })
  baseUrl!: string;

  @Column({ type: "varchar", name: "secret_ref", nullable: true })
  secretRef?: string;

  @Column({ type: "boolean", default: false })
  active = false;
}
