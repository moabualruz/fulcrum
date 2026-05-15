import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DocVersion } from "@knowledge-workspace/infrastructure/database/entities/docs/DocVersion.ts";

@Injectable()
export class DocVersionRepository {
  constructor(
    @InjectRepository(DocVersion)
    private readonly docVersions: Repository<DocVersion>,
  ) {}
}
