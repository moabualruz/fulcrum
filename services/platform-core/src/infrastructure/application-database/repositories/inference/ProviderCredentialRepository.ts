import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ProviderCredential } from "../../entities/inference/ProviderCredential.ts";

@Injectable()
export class ProviderCredentialRepository {
  constructor(
    @InjectRepository(ProviderCredential)
    private readonly providerCredentials: Repository<ProviderCredential>,
  ) {}
}
