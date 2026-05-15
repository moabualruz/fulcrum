/**
 * EdgeRepository — sandbox relationship graph domain.
 */

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Edge } from "../../entities/sandbox/Edge.ts";

@Injectable()
export class EdgeRepository {
  constructor(
    @InjectRepository(Edge)
    private readonly edges: Repository<Edge>,
  ) {}
}
