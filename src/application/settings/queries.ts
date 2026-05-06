import type { EntityManager } from "@mikro-orm/postgresql";
import { FeatureFlag } from "../../db/entities/auth/FeatureFlag.ts";
import { ConnectorCredential } from "../../db/entities/settings/ConnectorCredential.ts";
import { AppForbiddenError, AppNotFoundError } from "../errors.ts";
import type { AppContext, CredentialDto, TenantSettingDto } from "./types.ts";

export async function getTenantSetting(em: EntityManager, ctx: AppContext, key: string): Promise<TenantSettingDto> {
  const row = await em.findOne(FeatureFlag, { orgId: ctx.orgId, flag: key, userId: null });
  if (!row) throw new AppNotFoundError(`Tenant setting not found: ${key}`);
  return serializeTenantSetting(row);
}

export async function listCredentials(em: EntityManager, ctx: AppContext, input: { provider?: string } = {}): Promise<CredentialDto[]> {
  return (await em.find(ConnectorCredential, { org: ctx.orgId, ...(input.provider ? { provider: input.provider } : {}) } as never, { orderBy: { provider: "ASC", id: "ASC" } })).map(serializeCredential);
}

export async function getCredential(em: EntityManager, ctx: AppContext, id: string): Promise<CredentialDto> {
  const row = await em.findOne(ConnectorCredential, { id } as never);
  if (!row) throw new AppNotFoundError(`Credential not found: ${id}`);
  if (row.org.id !== ctx.orgId) throw new AppForbiddenError("Credential is outside org scope.");
  return serializeCredential(row);
}

export function serializeTenantSetting(row: FeatureFlag): TenantSettingDto {
  return { id: row.id, orgId: row.orgId ?? "", key: row.flag, value: { enabled: row.enabled } };
}

export function serializeCredential(row: ConnectorCredential): CredentialDto {
  return { id: row.id, orgId: row.org.id, projectId: row.projectId, provider: row.provider, accountId: row.accountId, label: row.label };
}
