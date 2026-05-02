import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { DocComment } from "../../entities/docs/DocComment.ts";

@injectable()
export class DocCommentRepository extends EntityRepository<DocComment> {}
