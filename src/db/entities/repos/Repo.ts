/**
 * Repo entity — repos domain (Pillar 9 stub).
 *
 * Stub: only the columns required for the FK + composite index land here.
 * Pillar 9 (Repos / source-control) will ADD additional columns (provider,
 * cloneUrl, defaultBranch, lastSyncedAt, …) via its own migration class.
 *
 * C2: Composite (org_id, slug) index from day 1 — uniqueness + lookup.
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
import { Org } from "../auth/Org.ts";
import { RepoRepository } from "../../repositories/repos/RepoRepository.ts";

@Entity({ tableName: "repos", repository: () => RepoRepository })
@Index({
  name: "idx_repos_org_slug",
  properties: ["org", "slug"],
})
export class Repo {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false })
  org!: Org;

  /** Org-scoped slug (e.g. "monorepo", "infra"). */
  @Property({ type: "string" })
  slug!: string;
}
