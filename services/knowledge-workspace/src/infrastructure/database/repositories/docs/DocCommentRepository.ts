import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DocComment } from "@knowledge-workspace/infrastructure/database/entities/docs/DocComment.ts";

@Injectable()
export class DocCommentRepository {
  constructor(
    @InjectRepository(DocComment)
    private readonly docComments: Repository<DocComment>,
  ) {}
}
