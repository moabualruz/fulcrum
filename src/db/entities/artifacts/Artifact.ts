/**
 * Artifact entity — artifacts domain (Pillar 10 stub).
 *
 * Stub: only the columns required for the FK + composite index land here.
 * Pillar 10 (Artifacts) will ADD additional columns (mimeType, size, hash,
 * blobRef, …) via its own migration class.
 *
 * C2: Composite (org_id, path) index from day 1 — path-prefix lookups.
 * C6: No plaintext SQL — schema via @Entity decorator class.
 * C7: MikroORM v7 ES Stage-3 decorator pattern (@mikro-orm/decorators/es).
 * C8: @Entity({ repository }) wires ArtifactRepository.
 */

import {
  Entity,
  PrimaryKey,
  Property,
  ManyToOne,
  Index,
} from "@mikro-orm/decorators/es";
import { Org } from "../auth/Org.ts";
import { ArtifactRepository } from "../../repositories/artifacts/ArtifactRepository.ts";

@Entity({ tableName: "artifacts", repository: () => ArtifactRepository })
@Index({
  name: "idx_artifacts_org_path",
  properties: ["org", "path"],
})
export class Artifact {
  @PrimaryKey({ type: "uuid", defaultRaw: "gen_random_uuid()" })
  id!: string;

  @ManyToOne(() => Org, { fieldName: "org_id", nullable: false })
  org!: Org;

  /** Logical artifact path (relative to org root, e.g. "reports/2026-04.pdf"). */
  @Property({ type: "string" })
  path!: string;
}
