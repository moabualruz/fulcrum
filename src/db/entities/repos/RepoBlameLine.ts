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

@Entity({ tableName: "repo_blame_lines" })
@Index({
  name: "repo_blame_lines_org_project",
  properties: ["org", "projectId"],
})
@Index({
  name: "repo_blame_lines_repo_path_line_unique",
  expression: 'CREATE UNIQUE INDEX "repo_blame_lines_repo_path_line_unique" ON "repo_blame_lines" ("repo_id", "path", "line_number")',
})
export class RepoBlameLine {
  [OptionalProps]?: "createdAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false, deleteRule: "cascade" })
  org!: Org;

  @Property({ type: "string", fieldName: "project_id" })
  projectId!: string;

  @ManyToOne(() => Repo, { fieldName: "repo_id", nullable: false, deleteRule: "cascade" })
  repo!: Repo;

  @Property({ type: "text" })
  path!: string;

  @Property({ type: "integer", fieldName: "line_number" })
  lineNumber!: number;

  @Property({ type: "string", fieldName: "commit_sha" })
  commitSha!: string;

  @Property({ type: "string", fieldName: "author_name" })
  authorName!: string;

  @Property({ type: "string", fieldName: "author_email", nullable: true })
  authorEmail?: string | null;

  @Property({ type: "datetime", fieldName: "committed_at" })
  committedAt!: Date;

  @Property({ type: "datetime", fieldName: "created_at", defaultRaw: "now()" })
  createdAt!: Date;
}
