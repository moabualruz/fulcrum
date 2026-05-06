import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";

import { Org } from "../auth/Org.ts";

@Entity({ tableName: "github_connector_state" })
@Index({
  name: "github_connector_state_org_project",
  properties: ["org", "projectId"],
})
@Index({
  name: "github_connector_state_installation_repo_unique",
  expression: 'CREATE UNIQUE INDEX "github_connector_state_installation_repo_unique" ON "github_connector_state" ("installation_id", "repo_full_name")',
})
export class GithubConnectorState {
  [OptionalProps]?: "payload" | "createdAt" | "updatedAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false, deleteRule: "cascade" })
  org!: Org;

  @Property({ type: "string", fieldName: "project_id" })
  projectId!: string;

  @Property({ type: "string", fieldName: "installation_id" })
  installationId!: string;

  @Property({ type: "string", fieldName: "repo_full_name" })
  repoFullName!: string;

  @Property({ type: "string", nullable: true })
  cursor?: string | null;

  @Property({ type: "json" })
  payload: Record<string, unknown> = {};

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;
}
