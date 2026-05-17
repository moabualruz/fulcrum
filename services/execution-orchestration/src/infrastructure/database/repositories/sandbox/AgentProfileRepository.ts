/**
 * AgentProfileRepository — persisted agent CLI profile registry.
 */

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AgentProfile } from "@execution-orchestration/infrastructure/database/entities/sandbox/AgentProfile.ts";

@Injectable()
export class AgentProfileRepository {
  constructor(
    @InjectRepository(AgentProfile)
    private readonly agentProfiles: Repository<AgentProfile>,
  ) {}
}
