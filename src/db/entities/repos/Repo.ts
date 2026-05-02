/**
 * Repo entity — repos domain (Pillar 9).
 *
 * P9#01: Extended with all Pillar 9 supervision columns.
 * C2: Composite (org_id, slug) unique index + org-scoped sort indexes.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 * C8: @Entity({ repository }) wires RepoRepository.
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
import { RepoRepository } from "../../repositories/repos/RepoRepository.ts";

@Entity({ tableName: "repos", repository: () => RepoRepository })
@Index({ name: "idx_repos_org_slug", properties: ["org", "slug"] })
@Index({
  name: "repos_org_slug",
  expression: 'CREATE UNIQUE INDEX "repos_org_slug" ON "repos" ("org_id", "slug")',
})
@Index({
  name: "repos_org_touched",
  expression: 'CREATE INDEX "repos_org_touched" ON "repos" ("org_id", "last_touched_at" DESC)',
})
@Index({
  name: "repos_kind_status",
  expression: 'CREATE INDEX "repos_kind_status" ON "repos" ("kind", "sync_status")',
})
export class Repo {
  [OptionalProps]?: "archived" | "syncStatus" | "lastTouchedAt";

  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false })
  org!: Org;

  /** Human-readable name (e.g. "Monorepo"). */
  @Property({ type: "string" })
  name!: string;

  /** Org-scoped slug (e.g. "monorepo", "infra"). */
  @Property({ type: "string" })
  slug!: string;

  /** Whether the repo is local or remote. */
  @Property({ type: "string" })
  kind!: "local" | "remote";

  @Property({ type: "string", fieldName: "local_path", nullable: true })
  localPath?: string | null;

  @Property({ type: "string", fieldName: "remote_url", nullable: true })
  remoteUrl?: string | null;

  @Property({ type: "string", fieldName: "default_branch", nullable: true })
  defaultBranch?: string | null;

  @Property({ type: "string", fieldName: "current_branch", nullable: true })
  currentBranch?: string | null;

  @Property({ type: "datetime", fieldName: "last_sync_at", nullable: true })
  lastSyncAt?: Date | null;

  /** idle | syncing | error */
  @Property({ type: "string", fieldName: "sync_status", default: "idle" })
  syncStatus: string = "idle";

  @Property({ type: "datetime", fieldName: "last_touched_at", nullable: true })
  lastTouchedAt?: Date | null;

  @Property({ type: "boolean", default: false })
  archived: boolean = false;
}
