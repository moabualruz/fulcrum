import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import type { ProviderCredential } from "../../entities/inference/ProviderCredential.ts";

@injectable()
export class ProviderCredentialRepository extends EntityRepository<ProviderCredential> {}
