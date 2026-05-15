import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";

@Injectable()
export class OrgRepository {
  constructor(
    @InjectRepository(Org)
    private readonly orgs: Repository<Org>,
  ) {}
}
