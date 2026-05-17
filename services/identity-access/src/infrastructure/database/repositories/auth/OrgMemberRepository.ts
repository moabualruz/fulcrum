import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { OrgMember } from "@identity-access/infrastructure/database/entities/auth/OrgMember.ts";

@Injectable()
export class OrgMemberRepository {
  constructor(
    @InjectRepository(OrgMember)
    private readonly orgMembers: Repository<OrgMember>,
  ) {}
}
