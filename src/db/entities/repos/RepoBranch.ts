/**
 * RepoBranch entity — repos domain (Pillar 9).
 *
 * One row per branch per repo. Tracks the tip SHA and whether
 * this is the default branch for the repo.
 *
 * C2: (org_id, repo_id) composite index; UNIQUE (repo_id, name).
 * C7: MikroORM v7 ES Stage-3 decorator pattern.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Index,
} from "@mikro-orm/decorators/es";
import { OptionalProps } from "@mikro-orm/core";
import { Org } from "../auth/Org.ts";
import { Repo } from "./Repo.ts";

@Entity({ tableName: "repo_branches" })
@Index({
  name: "repo_branches_repo_name_unique",
  expression: 'CREATE UNIQUE INDEX "repo_branches_repo_name_unique" ON "repo_branches" ("repo_id", "name")',
})
@Index({
  name: "repo_branches_org_repo",
  expression: 'CREATE INDEX "repo_branches_org_repo" ON "repo_branches" ("org_id", "repo_id")',
})
export class RepoBranch {
  [OptionalProps]?: "isDefault";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false })
  org!: Org;

  @ManyToOne(() => Repo, { fieldName: "repo_id", nullable: false, deleteRule: "cascade" })
  repo!: Repo;

  @Property({ type: "string" })
  name!: string;

  @Property({ type: "string", nullable: true })
  sha?: string | null;

  @Property({ type: "boolean", fieldName: "is_default", default: false })
  isDefault: boolean = false;
}
