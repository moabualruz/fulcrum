import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Verification } from "../../entities/auth/Verification.ts";

@Injectable()
export class VerificationRepository {
  constructor(
    @InjectRepository(Verification)
    private readonly verifications: Repository<Verification>,
  ) {}
}
