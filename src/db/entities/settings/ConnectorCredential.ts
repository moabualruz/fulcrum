import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";

import { Org } from "../auth/Org.ts";

@Entity({ tableName: "connector_credentials" })
@Index({
  name: "connector_credentials_org_project",
  properties: ["org", "projectId"],
})
@Index({
  name: "connector_credentials_provider_account_unique",
  expression: 'CREATE UNIQUE INDEX "connector_credentials_provider_account_unique" ON "connector_credentials" ("org_id", "provider", "account_id")',
})
export class ConnectorCredential {
  [OptionalProps]?: "metadata" | "createdAt" | "updatedAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false, deleteRule: "cascade" })
  org!: Org;

  @Property({ type: "string", fieldName: "project_id" })
  projectId!: string;

  @Property({ type: "string" })
  provider!: string;

  @Property({ type: "string", fieldName: "account_id" })
  accountId!: string;

  @Property({ type: "string" })
  label!: string;

  @Property({ type: "text", fieldName: "encrypted_secret" })
  encryptedSecret!: string;

  @Property({ type: "json" })
  metadata: Record<string, unknown> = {};

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;
}
