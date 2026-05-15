import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DocTemplate } from "@knowledge-workspace/infrastructure/database/entities/docs/DocTemplate.ts";

@Injectable()
export class DocTemplateRepository {
  constructor(
    @InjectRepository(DocTemplate)
    private readonly docTemplates: Repository<DocTemplate>,
  ) {}
}
