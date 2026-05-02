import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { DocTemplate } from "../../entities/docs/DocTemplate.ts";

@injectable()
export class DocTemplateRepository extends EntityRepository<DocTemplate> {}
