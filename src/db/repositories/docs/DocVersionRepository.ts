import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { DocVersion } from "../../entities/docs/DocVersion.ts";

@injectable()
export class DocVersionRepository extends EntityRepository<DocVersion> {}
