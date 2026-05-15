import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DocLink } from "../../entities/docs/DocLink.ts";

@Injectable()
export class DocLinkRepository {
  constructor(
    @InjectRepository(DocLink)
    private readonly docLinks: Repository<DocLink>,
  ) {}
}
