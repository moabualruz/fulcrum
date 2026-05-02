import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";

import type { Artifact } from "../../entities/sandbox/Artifact.ts";

@injectable()
export class ArtifactRepository extends EntityRepository<Artifact> {}
