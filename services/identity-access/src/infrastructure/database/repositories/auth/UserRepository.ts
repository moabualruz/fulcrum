import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "@identity-access/infrastructure/database/entities/auth/User.ts";

@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}
}
