import type { EntityManager } from "@mikro-orm/postgresql";
import { FeatureFlag } from "../../db/entities/auth/FeatureFlag.ts";
import { Org } from "../../db/entities/auth/Org.ts";
import { ConnectorCredential } from "../../db/entities/settings/ConnectorCredential.ts";
import { AppValidationError } from "../errors.ts";
import { serializeCredential, serializeTenantSetting } from "./queries.ts";
import type { AppContext, CreateCredentialInput, CredentialDto, SetTenantSettingInput, TenantSettingDto } from "./types.ts";

export async function setTenantSetting(em: EntityManager, ctx: AppContext, input: SetTenantSettingInput): Promise<TenantSettingDto> {
  if (!input.key) throw new AppValidationError("Tenant setting key is required.");
  return await em.transactional(async (txEm) => {
    let row = await txEm.findOne(FeatureFlag, { orgId: ctx.orgId, flag: input.key, userId: null });
    row ??= txEm.create(FeatureFlag, { orgId: ctx.orgId, userId: null, flag: input.key, enabled: false, createdAt: new Date() });
    row.enabled = Boolean((input.value as { enabled?: unknown })?.enabled ?? input.value);
    txEm.persist(row);
    await txEm.flush();
    return serializeTenantSetting(row);
  });
}

export async function createCredential(em: EntityManager, ctx: AppContext, input: CreateCredentialInput): Promise<CredentialDto> {
  if (!input.provider || !input.accountId || !input.label || !input.encryptedSecret) throw new AppValidationError("Credential provider, accountId, label, and encryptedSecret are required.");
  return await em.transactional(async (txEm) => {
    const row = txEm.create(ConnectorCredential, { org: txEm.getReference(Org, ctx.orgId), projectId: ctx.projectId ?? "00000000-0000-4000-8000-000000000000", provider: input.provider, accountId: input.accountId, label: input.label, encryptedSecret: input.encryptedSecret });
    txEm.persist(row);
    await txEm.flush();
    return serializeCredential(row);
  });
}
