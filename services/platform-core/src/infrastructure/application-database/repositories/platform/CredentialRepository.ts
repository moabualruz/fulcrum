/**
 * CredentialRepository — platform domain (Pillar 17 cross-cutting).
 */

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Credential } from "../../entities/platform/Credential.ts";

@Injectable()
export class CredentialRepository {
  constructor(
    @InjectRepository(Credential)
    private readonly credentials: Repository<Credential>,
  ) {}
}
