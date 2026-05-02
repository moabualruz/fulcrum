/**
 * RepoCommit entity — repos domain (Pillar 9).
 *
 * One row per commit per repo (de-duplicated by repo_id + sha).
 *
 * C2: (org_id, repo_id) + (repo_id, committed_at DESC) indexes; UNIQUE (repo_id, sha).
 * C7: MikroORM v7 ES Stage-3 decorator pattern.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Index,
} from "@mikro-orm/decorators/es";
import { Org } from "../auth/Org.ts";
import { Repo } from "./Repo.ts";

@Entity({ tableName: "repo_commits" })
@Index({
  name: "repo_commits_repo_sha_unique",
  expression: 'CREATE UNIQUE INDEX "repo_commits_repo_sha_unique" ON "repo_commits" ("repo_id", "sha")',
})
@Index({
  name: "repo_commits_repo_committed_at",
  expression: 'CREATE INDEX "repo_commits_repo_committed_at" ON "repo_commits" ("repo_id", "committed_at" DESC)',
})
@Index({
  name: "repo_commits_org_repo",
  expression: 'CREATE INDEX "repo_commits_org_repo" ON "repo_commits" ("org_id", "repo_id")',
})
export class RepoCommit {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false })
  org!: Org;

  @ManyToOne(() => Repo, { fieldName: "repo_id", nullable: false, deleteRule: "cascade" })
  repo!: Repo;

  @Property({ type: "string" })
  sha!: string;

  @Property({ type: "text", nullable: true })
  message?: string | null;

  @Property({ type: "string", nullable: true })
  author?: string | null;

  @Property({ type: "datetime", fieldName: "committed_at", nullable: true })
  committedAt?: Date | null;
}
