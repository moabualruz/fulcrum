/**
 * RepoFilesIndex entity — repos domain (Pillar 9).
 *
 * Flat file tree index for a repo snapshot — one row per path.
 *
 * C2: UNIQUE (repo_id, path); (org_id, repo_id, kind) composite index.
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

@Entity({ tableName: "repo_files_index" })
@Index({
  name: "repo_files_repo_path_unique",
  expression: 'CREATE UNIQUE INDEX "repo_files_repo_path_unique" ON "repo_files_index" ("repo_id", "path")',
})
@Index({
  name: "repo_files_org_repo_kind",
  expression: 'CREATE INDEX "repo_files_org_repo_kind" ON "repo_files_index" ("org_id", "repo_id", "kind")',
})
export class RepoFilesIndex {
  [OptionalProps]?: "size";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false })
  org!: Org;

  @ManyToOne(() => Repo, { fieldName: "repo_id", nullable: false, deleteRule: "cascade" })
  repo!: Repo;

  /** Relative path from repo root (e.g. "src/index.ts"). */
  @Property({ type: "text" })
  path!: string;

  /** file | dir | symlink */
  @Property({ type: "string" })
  kind!: string;

  @Property({ type: "bigint", nullable: true })
  size?: number | null;
}
