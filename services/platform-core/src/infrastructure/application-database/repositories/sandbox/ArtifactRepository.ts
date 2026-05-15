import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Artifact } from "../../entities/sandbox/Artifact.ts";

@Injectable()
export class ArtifactRepository {
  constructor(
    @InjectRepository(Artifact)
    private readonly artifacts: Repository<Artifact>,
  ) {}
}
