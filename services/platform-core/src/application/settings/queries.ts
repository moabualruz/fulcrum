import type { EntityManager } from "typeorm";
import { FeatureFlag } from "@identity-access/infrastructure/database/entities/auth/FeatureFlag.ts";
import { FeatureFlagRollout } from "@platform-core/infrastructure/application-database/entities/platform/FeatureFlagRollout.ts";
import { Credential } from "@platform-core/infrastructure/application-database/entities/platform/Credential.ts";
import { ErrorLog } from "@platform-core/infrastructure/application-database/entities/platform/ErrorLog.ts";
import { TelemetryEvent } from "@platform-core/infrastructure/application-database/entities/platform/TelemetryEvent.ts";
import { ConnectorCredential } from "@integration-hub/infrastructure/database/entities/settings/ConnectorCredential.ts";
import { createExportManifest, type ImportManifest } from "@integration-hub/application/import-export/commands.ts";
import { TELEMETRY_OPT_IN_KEY } from "@platform-core/application/telemetry/commands.ts";
import { TenantSetting } from "@platform-core/infrastructure/application-database/entities/TenantSetting.ts";
import { AppForbiddenError, AppNotFoundError } from "@platform-core/domain/errors.ts";
import type { AppContext, CredentialDto, TenantSettingDto } from "@platform-core/domain/settings.ts";

export const SETTINGS_ENTITY_KINDS = ["projects", "tasks", "credentials", "feature_flags", "tenant_settings"] as const;
export type SettingsEntityKind = (typeof SETTINGS_ENTITY_KINDS)[number];

export interface BackupSummaryDto {
  id: string;
  status: "pending" | "complete";
  size_bytes: number | null;
  path: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface SettingsFeatureFlagDto {
  id: string;
  name: string;
  enabled: boolean;
  rollout_percent: number;
  cohort_rules: Record<string, unknown>;
  docs_url: string | null;
  updated_at: string;
}

export interface SettingsSecretDto {
  id: string;
  name: string;
  provider: string;
  last_used_at: string | null;
  archived: boolean;
  created_at: string;
}

export interface SettingsErrorDto {
  id: string;
  message: string;
  stack_trace: string | null;
  context: Record<string, unknown>;
  os: string | null;
  version: string | null;
  occurred_at: string;
}

export interface SettingsTelemetryDto {
  optIn: boolean;
  rowCount: number;
}

const BACKUP_HISTORY_KEY = "settings.backups.history";

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function backupHistory(value: unknown): BackupSummaryDto[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is BackupSummaryDto => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Partial<BackupSummaryDto>;
    return typeof candidate.id === "string" && (candidate.status === "pending" || candidate.status === "complete");
  });
}

async function tenantSetting(em: EntityManager, orgId: string, key: string): Promise<TenantSetting | null> {
  return em.findOne(TenantSetting, { where: { orgId, key } as never });
}

export async function getTenantSetting(em: EntityManager, ctx: AppContext, key: string): Promise<TenantSettingDto> {
  const row = await em.findOne(FeatureFlag, { where: { org: { id: ctx.orgId }, flag: key, userId: null  } as never });
  if (!row) throw new AppNotFoundError(`Tenant setting not found: ${key}`);
  return serializeTenantSetting(row);
}

export async function listCredentials(em: EntityManager, ctx: AppContext, input: { provider?: string } = {}): Promise<CredentialDto[]> {
  return (await em.find(ConnectorCredential, { where: { org: ctx.orgId, ...(input.provider ? { provider: input.provider } : {}) } as never, order: { provider: "ASC", id: "ASC" } })).map(serializeCredential);
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

export async function listBackupSummaries(em: EntityManager, ctx: AppContext): Promise<{ backups: BackupSummaryDto[] }> {
  const setting = await tenantSetting(em, ctx.orgId, BACKUP_HISTORY_KEY);
  return { backups: backupHistory(setting?.value).slice(0, 50) };
}

export async function createSettingsDataExport(
  em: EntityManager,
  ctx: AppContext,
  input: { kinds?: readonly SettingsEntityKind[] } = {},
): Promise<Record<string, unknown[]>> {
  const selected = new Set(input.kinds?.length ? input.kinds : SETTINGS_ENTITY_KINDS);
  const manifest = await createExportManifest(em, { orgId: ctx.orgId, userId: ctx.userId ?? "" });
  const output: Record<string, unknown[]> = {};
  for (const kind of SETTINGS_ENTITY_KINDS) {
    if (!selected.has(kind)) continue;
    const rows = manifest[kind];
    output[kind] = Array.isArray(rows) ? rows as unknown[] : [];
  }
  return output;
}

export function summarizeJsonEntityCounts(input: unknown): Record<string, number> {
  const obj = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const summary: Record<string, number> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (Array.isArray(value)) summary[key] = value.length;
  }
  return summary;
}

export function summarizeImportManifest(input: unknown): { manifest: ImportManifest | null; summary: Record<string, number> } {
  const summary = summarizeJsonEntityCounts(input);
  const maybeManifest = input && typeof input === "object" ? input as ImportManifest : null;
  return { manifest: maybeManifest?.format === "fulcrum.json-export.v1" ? maybeManifest : null, summary };
}

export async function listSettingsErrors(
  em: EntityManager,
  ctx: AppContext,
  input: { page: number; pageSize: number },
): Promise<{ errors: SettingsErrorDto[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, input.page);
  const pageSize = Math.max(1, input.pageSize);
  const where = { org: ctx.orgId } as never;
  const [rows, total] = await em.findAndCount(ErrorLog, {
    where,
    order: { occurredAt: "DESC" },
    take: pageSize,
    skip: (page - 1) * pageSize,
  });
  return {
    errors: rows.map((row) => ({
      id: row.id,
      message: row.errorMessage,
      stack_trace: row.stackTrace ?? null,
      context: row.context ?? {},
      os: row.os ?? null,
      version: row.fulcrumVersion ?? row.bunVersion ?? null,
      occurred_at: row.occurredAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}

export async function listSettingsFeatureFlags(em: EntityManager, ctx: AppContext): Promise<{ flags: SettingsFeatureFlagDto[] }> {
  const rows = await em.find(FeatureFlag, { where: { orgId: ctx.orgId, userId: null } as never, order: { flag: "ASC" } });
  const rollouts = await em.find(FeatureFlagRollout, { where: { org: ctx.orgId } as never, relations: ["flag"] });
  const byFlagId = new Map(rollouts.map((rollout) => [(rollout.flag as unknown as { id: string }).id, rollout]));
  return {
    flags: rows.map((row) => {
      const rollout = byFlagId.get(row.id);
      return {
        id: row.id,
        name: row.flag,
        enabled: row.enabled,
        rollout_percent: rollout?.rolloutPercent ?? (row.enabled ? 100 : 0),
        cohort_rules: rollout?.cohortRules ?? {},
        docs_url: null,
        updated_at: (rollout?.updatedAt ?? row.createdAt).toISOString(),
      };
    }),
  };
}

export async function listSettingsSecrets(em: EntityManager, ctx: AppContext): Promise<{ credentials: SettingsSecretDto[] }> {
  const rows = await em.find(Credential, { where: { org: ctx.orgId } as never, order: { createdAt: "DESC" } });
  return {
    credentials: rows.map((row) => ({
      id: row.id,
      name: row.name,
      provider: row.provider,
      last_used_at: iso(row.lastUsedAt) ?? null,
      archived: row.archived,
      created_at: row.createdAt.toISOString(),
    })),
  };
}

export async function getSettingsTelemetry(em: EntityManager, ctx: AppContext): Promise<SettingsTelemetryDto> {
  const setting = await tenantSetting(em, ctx.orgId, TELEMETRY_OPT_IN_KEY);
  return {
    optIn: setting?.value === true,
    rowCount: await em.count(TelemetryEvent, { org: ctx.orgId } as never),
  };
}

export { BACKUP_HISTORY_KEY };
