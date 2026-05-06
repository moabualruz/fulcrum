import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";

import { Org } from "../auth/Org.ts";

@Entity({ tableName: "gitlab_issues" })
@Index({
  name: "gitlab_issues_org_project",
  properties: ["org", "projectId"],
})
@Index({
  name: "gitlab_issues_repo_external_unique",
  expression: 'CREATE UNIQUE INDEX "gitlab_issues_repo_external_unique" ON "gitlab_issues" ("repo_path", "issue_iid")',
})
export class GitlabIssue {
  [OptionalProps]?: "payload" | "createdAt" | "updatedAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false, deleteRule: "cascade" })
  org!: Org;

  @Property({ type: "string", fieldName: "project_id" })
  projectId!: string;

  @Property({ type: "string", fieldName: "repo_path" })
  repoPath!: string;

  @Property({ type: "string", fieldName: "issue_iid" })
  issueIid!: string;

  @Property({ type: "string" })
  title!: string;

  @Property({ type: "string" })
  state!: string;

  @Property({ type: "string", nullable: true })
  url?: string | null;

  @Property({ type: "json" })
  payload: Record<string, unknown> = {};

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;
}
