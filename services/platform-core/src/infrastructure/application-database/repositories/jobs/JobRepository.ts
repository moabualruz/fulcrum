/**
 * JobRepository — jobs domain (Pillar 12).
 *
 * Stub repository — Pillar 12 fills in domain methods (queue dispatch, etc.).
 */

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Job } from "../../entities/jobs/Job.ts";

@Injectable()
export class JobRepository {
  constructor(
    @InjectRepository(Job)
    private readonly jobs: Repository<Job>,
  ) {}
}
