import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Account } from "../../entities/auth/Account.ts";

@Injectable()
export class AccountRepository {
  constructor(
    @InjectRepository(Account)
    private readonly accounts: Repository<Account>,
  ) {}
}
