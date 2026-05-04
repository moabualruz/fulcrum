import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { DocLink } from "../../entities/docs/DocLink.ts";

@injectable()
export class DocLinkRepository extends EntityRepository<DocLink> {}
