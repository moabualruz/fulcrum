/**
 * EdgeRepository — sandbox relationship graph domain.
 *
 * C6/C7: no raw SQL; all queries via EntityManager + repository methods.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { Edge } from "../../entities/sandbox/Edge.ts";

@injectable()
export class EdgeRepository extends EntityRepository<Edge> {}
