/**
 * ProviderCredential entity — gated external/local inference backend config.
 */

import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";
import { Org } from "../auth/Org.ts";
import { ProviderCredentialRepository } from "../../repositories/inference/ProviderCredentialRepository.ts";

export type InferenceProvider = "ollama" | "lm-studio" | "openai-compatible";

@Entity({
  tableName: "provider_credentials",
  repository: () => ProviderCredentialRepository,
})
@Index({
  name: "provider_credentials_org_provider_active",
  properties: ["org", "provider", "active"],
})
export class ProviderCredential {
  [OptionalProps]?: "secretRef" | "active";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false })
  org!: Org;

  @Property({ type: "string" })
  provider!: InferenceProvider;

  @Property({ type: "string", fieldName: "base_url" })
  baseUrl!: string;

  @Property({ type: "string", fieldName: "secret_ref", nullable: true })
  secretRef?: string;

  @Property({ type: "boolean", default: false })
  active = false;
}
