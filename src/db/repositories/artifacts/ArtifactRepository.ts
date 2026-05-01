/**
 * ArtifactRepository — artifacts domain (Pillar 10).
 *
 * Stub repository — Pillar 10 fills in domain methods.
 *
 * C6/C7: No raw SQL; all queries via EntityManager + repository methods.
 * C8: needle-di @injectable(); extends EntityRepository<Artifact>.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { Artifact } from "../../entities/artifacts/Artifact.ts";

@injectable()
export class ArtifactRepository extends EntityRepository<Artifact> {}
