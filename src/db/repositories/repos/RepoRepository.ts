/**
 * RepoRepository — repos domain (Pillar 9).
 *
 * Stub repository — Pillar 9 fills in domain methods.
 *
 * C6/C7: No raw SQL; all queries via EntityManager + repository methods.
 * C8: needle-di @injectable(); extends EntityRepository<Repo>.
 */

import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { Repo } from "../../entities/repos/Repo.ts";

@injectable()
export class RepoRepository extends EntityRepository<Repo> {}
