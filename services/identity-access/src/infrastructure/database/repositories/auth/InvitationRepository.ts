import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Invitation } from "@identity-access/infrastructure/database/entities/auth/Invitation.ts";

@Injectable()
export class InvitationRepository {
  constructor(
    @InjectRepository(Invitation)
    private readonly invitations: Repository<Invitation>,
  ) {}
}
