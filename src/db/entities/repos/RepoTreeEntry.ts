import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";

import { Org } from "../auth/Org.ts";
import { Repo } from "./Repo.ts";

@Entity({ tableName: "repo_tree_entries" })
@Index({
  name: "repo_tree_entries_org_project",
  properties: ["org", "projectId"],
})
@Index({
  name: "repo_tree_entries_repo_commit_path_unique",
  expression: 'CREATE UNIQUE INDEX "repo_tree_entries_repo_commit_path_unique" ON "repo_tree_entries" ("repo_id", "commit_sha", "path")',
})
export class RepoTreeEntry {
  [OptionalProps]?: "payload" | "createdAt" | "updatedAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false, deleteRule: "cascade" })
  org!: Org;

  @Property({ type: "string", fieldName: "project_id" })
  projectId!: string;

  @ManyToOne(() => Repo, { fieldName: "repo_id", nullable: false, deleteRule: "cascade" })
  repo!: Repo;

  @Property({ type: "string", fieldName: "commit_sha" })
  commitSha!: string;

  @Property({ type: "text" })
  path!: string;

  @Property({ type: "string" })
  kind!: string;

  @Property({ type: "bigint", nullable: true })
  size?: number | null;

  @Property({ type: "string", fieldName: "content_hash", nullable: true })
  contentHash?: string | null;

  @Property({ type: "json" })
  payload: Record<string, unknown> = {};

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;

  @Property({ type: "datetime", fieldName: "updated_at", defaultRaw: "now()" })
  updatedAt!: Date;
}
