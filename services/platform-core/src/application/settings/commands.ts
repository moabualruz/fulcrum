import { LessThan, type EntityManager } from "typeorm";
import { FeatureFlag } from "@identity-access/infrastructure/database/entities/auth/FeatureFlag.ts";
import { Org } from "@identity-access/infrastructure/database/entities/auth/Org.ts";
import { User } from "@identity-access/infrastructure/database/entities/auth/User.ts";
import { TenantSetting } from "@platform-core/infrastructure/application-database/entities/TenantSetting.ts";
import { Credential } from "@platform-core/infrastructure/application-database/entities/platform/Credential.ts";
import { ErrorLog } from "@platform-core/infrastructure/application-database/entities/platform/ErrorLog.ts";
import { FeatureFlagRollout } from "@platform-core/infrastructure/application-database/entities/platform/FeatureFlagRollout.ts";
import { TelemetryEvent } from "@platform-core/infrastructure/application-database/entities/platform/TelemetryEvent.ts";
import { ConnectorCredential } from "@integration-hub/infrastructure/database/entities/settings/ConnectorCredential.ts";
import { AppNotFoundError, AppUnauthorizedError, AppValidationError } from "@platform-core/domain/errors.ts";
import { createExportManifest, type ImportManifest, runImportManifest } from "@integration-hub/application/import-export/commands.ts";
import { TELEMETRY_OPT_IN_KEY } from "@platform-core/application/telemetry/commands.ts";
import {
  BACKUP_HISTORY_KEY,
  serializeCredential,
  serializeTenantSetting,
  summarizeImportManifest,
  type BackupSummaryDto,
} from "@platform-core/application/settings/queries.ts";
import type { AppContext, CreateCredentialInput, CredentialDto, SetTenantSettingInput, TenantSettingDto } from "@platform-core/domain/settings.ts";

export async function setTenantSetting(em: EntityManager, ctx: AppContext, input: SetTenantSettingInput): Promise<TenantSettingDto> {
  if (!input.key) throw new AppValidationError("Tenant setting key is required.");
  return await em.transaction(async (txEm: EntityManager) => {
    let row = await txEm.findOne(FeatureFlag, { where: { orgId: ctx.orgId, flag: input.key, userId: null } as never });
    row ??= txEm.create(FeatureFlag, { orgId: ctx.orgId, userId: null, flag: input.key, enabled: false, createdAt: new Date() });
    row.enabled = Boolean((input.value as { enabled?: unknown })?.enabled ?? input.value);
    await txEm.save(row);
    return serializeTenantSetting(row);
  });
}

export async function createCredential(em: EntityManager, ctx: AppContext, input: CreateCredentialInput): Promise<CredentialDto> {
  if (!input.provider || !input.accountId || !input.label || !input.encryptedSecret) throw new AppValidationError("Credential provider, accountId, label, and encryptedSecret are required.");
  return await em.transaction(async (txEm: EntityManager) => {
    const row = txEm.create(ConnectorCredential, { org: { id: ctx.orgId } as Org, projectId: ctx.projectId ?? "00000000-0000-4000-8000-000000000000", provider: input.provider, accountId: input.accountId, label: input.label, encryptedSecret: input.encryptedSecret });
    await txEm.save(row);
    return serializeCredential(row);
  });
}

function requireUserId(ctx: AppContext): string {
  if (!ctx.userId) throw new AppUnauthorizedError("A signed-in user is required.");
  return ctx.userId;
}

function encodedSecret(value: string): Uint8Array {
  return Buffer.from(`b64:${Buffer.from(value).toString("base64")}`, "utf8");
}

function backupHistory(value: unknown): BackupSummaryDto[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is BackupSummaryDto => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Partial<BackupSummaryDto>;
    return typeof candidate.id === "string" && (candidate.status === "pending" || candidate.status === "complete");
  });
}

async function upsertTenantJsonSetting(em: EntityManager, orgId: string, key: string, value: unknown): Promise<TenantSetting> {
  let setting = await em.findOne(TenantSetting, { where: { orgId, key } as never });
  if (setting) {
    setting.value = value;
    setting.updatedAt = new Date();
    await em.save(setting);
  } else {
    setting = em.create(TenantSetting, { orgId, key, value });
    await em.save(setting);
  }
  return setting;
}

export async function createSettingsBackup(em: EntityManager, ctx: AppContext): Promise<{ success: true; id: string }> {
  return await em.transaction(async (tx: EntityManager) => {
    const dump = await createExportManifest(tx as EntityManager, { orgId: ctx.orgId, userId: ctx.userId ?? "" });
    const json = JSON.stringify(dump);
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const setting = await tx.findOne(TenantSetting, { where: { orgId: ctx.orgId, key: BACKUP_HISTORY_KEY } as never });
    const history = backupHistory(setting?.value);
    history.unshift({
      id,
      status: "complete",
      size_bytes: Buffer.byteLength(json, "utf8"),
      path: `/backups/${id}.json`,
      created_at: now,
      completed_at: now,
    });
    await upsertTenantJsonSetting(tx as EntityManager, ctx.orgId, BACKUP_HISTORY_KEY, history.slice(0, 50));
    return { success: true as const, id };
  });
}

export function preflightSettingsBackup(input: unknown): { preflight: true; entityCounts: Record<string, number> } {
  return { preflight: true as const, entityCounts: summarizeImportManifest(input).summary };
}

export async function restoreSettingsBackup(
  em: EntityManager,
  ctx: AppContext,
  input: { manifest: ImportManifest | null },
): Promise<{ restored: true; message: string }> {
  if (input.manifest) {
    await runImportManifest(em, { orgId: ctx.orgId, userId: ctx.userId ?? "" }, input.manifest, "update");
  }
  return { restored: true as const, message: "Restore complete" };
}

export function preflightSettingsDataImport(input: unknown): { preflightSummary: Record<string, number> } {
  return { preflightSummary: summarizeImportManifest(input).summary };
}

export async function importSettingsData(
  em: EntityManager,
  ctx: AppContext,
  input: unknown,
): Promise<{ imported: true; totalRows: number }> {
  const { manifest, summary } = summarizeImportManifest(input);
  if (manifest) await runImportManifest(em, { orgId: ctx.orgId, userId: ctx.userId ?? "" }, manifest, "update");
  return { imported: true as const, totalRows: Object.values(summary).reduce((total, count) => total + count, 0) };
}

export async function clearSettingsErrors(
  em: EntityManager,
  ctx: AppContext,
  input: { before: string },
): Promise<{ success: true }> {
  if (!input.before) throw new AppValidationError("before date required");
  const before = new Date(input.before);
  if (Number.isNaN(before.getTime())) throw new AppValidationError("before date is invalid");
  const rows = await em.find(ErrorLog, { where: { org: { id: ctx.orgId }, occurredAt: LessThan(before) } as never });
  if (rows.length > 0) await em.remove(rows);
  return { success: true as const };
}

export async function toggleSettingsFeatureFlag(
  em: EntityManager,
  ctx: AppContext,
  input: { id: string },
): Promise<{ success: true }> {
  if (!input.id) throw new AppValidationError("id required");
  const row = await em.findOne(FeatureFlag, { where: { id: input.id, orgId: ctx.orgId, userId: null } as never });
  if (!row) throw new AppNotFoundError(`Feature flag not found: ${input.id}`);
  row.enabled = !row.enabled;
  await em.save(row);
  return { success: true as const };
}

export async function addSettingsFeatureFlag(
  em: EntityManager,
  ctx: AppContext,
  input: { flag: string; enabled?: boolean },
): Promise<{ success: true; id: string }> {
  if (!input.flag) throw new AppValidationError("flag required");
  return await em.transaction(async (txEm: EntityManager) => {
    let row = await txEm.findOne(FeatureFlag, { where: { orgId: ctx.orgId, flag: input.flag, userId: null } as never });
    if (!row) {
      row = txEm.create(FeatureFlag, {
        orgId: ctx.orgId,
        userId: null,
        flag: input.flag,
        enabled: Boolean(input.enabled),
        createdAt: new Date(),
      });
      await txEm.save(row);
    } else if (input.enabled !== undefined) {
      row.enabled = Boolean(input.enabled);
      await txEm.save(row);
    }
    return { success: true as const, id: row.id };
  });
}

async function rolloutForFlag(em: EntityManager, ctx: AppContext, id: string): Promise<FeatureFlagRollout> {
  const flag = await em.findOne(FeatureFlag, { where: { id, orgId: ctx.orgId, userId: null } as never });
  if (!flag) throw new AppNotFoundError(`Feature flag not found: ${id}`);
  let rollout = await em.findOne(FeatureFlagRollout, { where: { org: { id: ctx.orgId }, flag: id } as never });
  if (!rollout) {
    rollout = em.create(FeatureFlagRollout, {
      org: { id: ctx.orgId } as Org,
      flag,
      rolloutPercent: flag.enabled ? 100 : 0,
      cohortRules: {},
      updatedBy: ctx.userId ? { id: ctx.userId } as User : undefined,
      updatedAt: new Date(),
    } as never);
    await em.save(rollout);
  }
  return rollout;
}

export async function setSettingsFeatureFlagRollout(
  em: EntityManager,
  ctx: AppContext,
  input: { id: string; rolloutPercent: number },
): Promise<{ success: true }> {
  if (!input.id || !Number.isInteger(input.rolloutPercent) || input.rolloutPercent < 0 || input.rolloutPercent > 100) {
    throw new AppValidationError("invalid");
  }
  const rollout = await rolloutForFlag(em, ctx, input.id);
  rollout.rolloutPercent = input.rolloutPercent;
  rollout.updatedAt = new Date();
  await em.save(rollout);
  return { success: true as const };
}

export async function setSettingsFeatureFlagCohortRules(
  em: EntityManager,
  ctx: AppContext,
  input: { id: string; rules: Record<string, unknown> },
): Promise<{ success: true }> {
  if (!input.id) throw new AppValidationError("id required");
  const rollout = await rolloutForFlag(em, ctx, input.id);
  rollout.cohortRules = input.rules;
  rollout.updatedAt = new Date();
  await em.save(rollout);
  return { success: true as const };
}

export async function addSettingsSecret(
  em: EntityManager,
  ctx: AppContext,
  input: { name: string; value: string; provider: string },
): Promise<{ success: true }> {
  const userId = requireUserId(ctx);
  if (!input.name || !input.value) throw new AppValidationError("name and value required");
  let credential = await em.findOne(Credential, { where: { org: { id: ctx.orgId }, user: { id: userId }, name: input.name } as never });
  if (!credential) {
    credential = em.create(Credential, {
      org: { id: ctx.orgId } as Org,
      user: { id: userId } as User,
      name: input.name,
      encryptedValue: encodedSecret(input.value),
      provider: input.provider || "local",
      createdAt: new Date(),
    } as never);
    await em.save(credential);
  } else {
    credential.provider = input.provider || "local";
    credential.encryptedValue = encodedSecret(input.value);
  }
  return { success: true as const };
}

export async function rotateSettingsSecret(
  em: EntityManager,
  ctx: AppContext,
  input: { id: string; value: string },
): Promise<{ success: true }> {
  if (!input.id || !input.value) throw new AppValidationError("id and value required");
  const credential = await em.findOne(Credential, { where: { id: input.id, org: { id: ctx.orgId } } as never });
  if (!credential) throw new AppNotFoundError(`Credential not found: ${input.id}`);
  credential.encryptedValue = encodedSecret(input.value);
  credential.lastUsedAt = new Date();
  await em.save(credential);
  return { success: true as const };
}

export async function toggleSettingsSecretArchive(em: EntityManager, ctx: AppContext, input: { id: string }): Promise<{ success: true }> {
  if (!input.id) throw new AppValidationError("id required");
  const credential = await em.findOne(Credential, { where: { id: input.id, org: { id: ctx.orgId } } as never });
  if (!credential) throw new AppNotFoundError(`Credential not found: ${input.id}`);
  credential.archived = !credential.archived;
  await em.save(credential);
  return { success: true as const };
}

export async function deleteSettingsSecret(em: EntityManager, ctx: AppContext, input: { id: string }): Promise<{ success: true }> {
  if (!input.id) throw new AppValidationError("id required");
  const credential = await em.findOne(Credential, { where: { id: input.id, org: { id: ctx.orgId } } as never });
  if (!credential) throw new AppNotFoundError(`Credential not found: ${input.id}`);
  await em.remove(credential);
  return { success: true as const };
}

export async function toggleSettingsTelemetryOptIn(em: EntityManager, ctx: AppContext): Promise<{ success: true }> {
  const setting = await em.findOne(TenantSetting, { where: { orgId: ctx.orgId, key: TELEMETRY_OPT_IN_KEY } as never });
  await upsertTenantJsonSetting(em, ctx.orgId, TELEMETRY_OPT_IN_KEY, setting?.value !== true);
  return { success: true as const };
}

export async function purgeSettingsTelemetry(em: EntityManager, ctx: AppContext): Promise<{ success: true; rowCount: 0 }> {
  const rows = await em.find(TelemetryEvent, { org: { id: ctx.orgId } } as never);
  await em.remove(rows);
  return { success: true as const, rowCount: 0 as const };
}
