import type { EntityManager } from "typeorm";
import { z } from "zod";

import { ErrorLog } from "@platform-core/infrastructure/application-database/entities/platform/ErrorLog.ts";
import { evaluateFeatureFlag } from "@feature-flags/application/evaluation.ts";
import {
  FEATURE_FLAGS,
  FLAG_DESCRIPTIONS,
  FlagRegistry,
  type FeatureFlagName,
} from "@feature-flags/application/registry.ts";
import type { InferenceModel } from "@platform-core/application/inference/protocol.ts";
import { AppForbiddenError, AppInvariantError, AppValidationError } from "@platform-core/domain/errors.ts";

export interface AdminAppContext {
  orgId: string;
  userId: string;
  em: EntityManager | null;
  container: { get<T>(token: new (...args: unknown[]) => T): T; has?: (token: unknown) => boolean } | null;
}

export const BACKUP_FORMAT = "fulcrum.db-dump.v1" as const;
export const BACKUP_SCHEMA_VERSION = 1 as const;

export const DumpTableSchema = z.object({
  columns: z.array(z.string()),
  columnTypes: z.record(z.string(), z.string()),
  rows: z.array(z.record(z.string(), z.unknown())),
});

export const DumpSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  schemaVersion: z.literal(BACKUP_SCHEMA_VERSION),
  createdAt: z.string(),
  tables: z.record(z.string(), DumpTableSchema),
});

export type BackupDump = z.infer<typeof DumpSchema>;

function requireEm(ctx: AdminAppContext): EntityManager {
  if (ctx.em) return ctx.em;
  throw new AppInvariantError("EntityManager could not be resolved.");
}

function quoteIdent(identifier: string): string {
  return `"${identifier.replaceAll("\"", "\"\"")}"`;
}

async function execute<T extends Record<string, unknown>>(
  em: EntityManager,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return await em.query(sql, params) as T[];
}

async function tableNames(em: EntityManager): Promise<string[]> {
  const rows = await execute<{ table_name: string }>(
    em,
    `
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
      order by table_name
    `,
  );
  return rows.map((row) => row.table_name);
}

async function columnsForTable(em: EntityManager, table: string): Promise<{
  columns: string[];
  columnTypes: Record<string, string>;
}> {
  const rows = await execute<{ column_name: string; data_type: string }>(
    em,
    `
      select column_name, data_type
      from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
      order by ordinal_position
    `,
    [table],
  );
  return {
    columns: rows.map((row) => row.column_name),
    columnTypes: Object.fromEntries(rows.map((row) => [row.column_name, row.data_type])),
  };
}

function sqlValue(value: unknown, dataType: string | undefined): unknown {
  if (dataType === "ARRAY" && Array.isArray(value)) return toPostgresArrayLiteral(value);
  return value ?? null;
}

function toPostgresArrayLiteral(values: unknown[]): string {
  return `{${values.map((value) => {
    const text = String(value ?? "");
    return `"${text.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
  }).join(",")}}`;
}

export async function createBackupDump(ctx: AdminAppContext): Promise<BackupDump> {
  const em = requireEm(ctx);
  const tables: BackupDump["tables"] = {};

  for (const table of await tableNames(em)) {
    const { columns, columnTypes } = await columnsForTable(em, table);
    const rows = await execute<Record<string, unknown>>(
      em,
      `select * from ${quoteIdent(table)} order by ${columns.includes("id") ? quoteIdent("id") : "1"}`,
    );
    tables[table] = { columns, columnTypes, rows };
  }

  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    tables,
  };
}

export function encodeBackupDump(dump: BackupDump): string {
  return Buffer.from(JSON.stringify(dump), "utf8").toString("base64");
}

export function decodeBackupDump(encoded: string): BackupDump {
  try {
    const json = Buffer.from(encoded, "base64").toString("utf8");
    return DumpSchema.parse(JSON.parse(json));
  } catch (cause) {
    throw new AppValidationError("Backup dump is invalid.", { cause });
  }
}

export function backupEntityCounts(dump: BackupDump): Record<string, number> {
  return Object.fromEntries(Object.entries(dump.tables).map(([table, data]) => [table, data.rows.length]));
}

export async function restoreBackupDump(ctx: AdminAppContext, dump: BackupDump): Promise<void> {
  const em = requireEm(ctx);
  for (const [table, data] of Object.entries(dump.tables)) {
    if (!data.columns.includes("id")) continue;
    if (data.rows.length === 0) continue;

    const columns = data.columns.map(quoteIdent).join(", ");
    const placeholders = data.columns.map(() => "?").join(", ");
    const updates = data.columns
      .filter((column) => column !== "id")
      .map((column) => `${quoteIdent(column)} = excluded.${quoteIdent(column)}`)
      .join(", ");

    for (const row of data.rows) {
      await execute(
        em,
        `
          insert into ${quoteIdent(table)} (${columns})
          values (${placeholders})
          on conflict (${quoteIdent("id")}) do update set ${updates}
        `,
        data.columns.map((column) => sqlValue(row[column], data.columnTypes[column])),
      );
    }
  }
}

export interface ErrorLogRecord {
  id: string;
  orgId: string;
  userId: string | null;
  occurredAt: Date;
  os?: string | null;
  arch?: string | null;
  bunVersion?: string | null;
  fulcrumVersion?: string | null;
  recentCliCommand?: string | null;
  recentTrpcProcedure?: string | null;
  errorMessage: string;
  stackTrace?: string | null;
  context: Record<string, unknown>;
}

export abstract class ErrorLogStore {
  abstract list(orgId: string, input: { limit: number; since?: Date }): Promise<ErrorLogRecord[]>;
  abstract get(orgId: string, id: string): Promise<ErrorLogRecord | null>;
  abstract clear(orgId: string, input: { before?: Date }): Promise<number>;
}

function errorEntityToRecord(entity: ErrorLog): ErrorLogRecord {
  const org = entity.org as unknown as { id?: string } | string;
  const user = entity.user as unknown as { id?: string } | string | undefined;

  return {
    id: entity.id,
    orgId: typeof org === "string" ? org : org.id ?? "",
    userId: user ? (typeof user === "string" ? user : user.id ?? null) : null,
    occurredAt: entity.occurredAt,
    os: entity.os ?? null,
    arch: entity.arch ?? null,
    bunVersion: entity.bunVersion ?? null,
    fulcrumVersion: entity.fulcrumVersion ?? null,
    recentCliCommand: entity.recentCliCommand ?? null,
    recentTrpcProcedure: entity.recentTrpcProcedure ?? null,
    errorMessage: entity.errorMessage,
    stackTrace: entity.stackTrace ?? null,
    context: entity.context ?? {},
  };
}

class MikroErrorLogStore extends ErrorLogStore {
  constructor(private readonly ctx: AdminAppContext) {
    super();
  }

  private repo() {
    return requireEm(this.ctx).getRepository(ErrorLog);
  }

  async list(orgId: string, input: { limit: number; since?: Date }) {
    const { MoreThanOrEqual } = await import("typeorm");
    const where = input.since ? { org: { id: orgId }, occurredAt: MoreThanOrEqual(input.since) } : { org: { id: orgId } };
    const rows = await this.repo().find({ where: where as never, order: { occurredAt: "DESC" }, take: input.limit });
    return rows.map(errorEntityToRecord);
  }

  async get(orgId: string, id: string) {
    const row = await this.repo().findOne({ where: { id, org: { id: orgId } } as never });
    return row ? errorEntityToRecord(row) : null;
  }

  async clear(orgId: string, input: { before?: Date }) {
    const em = requireEm(this.ctx);
    const { LessThan } = await import("typeorm");
    const where = input.before ? { org: { id: orgId }, occurredAt: LessThan(input.before) } : { org: { id: orgId } };
    const rows = await this.repo().find({ where: where as never });
    await em.remove(rows);
    return rows.length;
  }
}

function errorStoreFromContext(ctx: AdminAppContext): ErrorLogStore {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (ctx.container?.has?.(ErrorLogStore)) return ctx.container.get(ErrorLogStore as any);
  return new MikroErrorLogStore(ctx);
}

export function listErrorLogs(ctx: AdminAppContext, input: { limit: number; since?: Date }) {
  return errorStoreFromContext(ctx).list(ctx.orgId, input);
}

export function getErrorLog(ctx: AdminAppContext, id: string) {
  return errorStoreFromContext(ctx).get(ctx.orgId, id);
}

export function clearErrorLogs(ctx: AdminAppContext, input: { before?: Date }) {
  return errorStoreFromContext(ctx).clear(ctx.orgId, input);
}

export const THEME_DEFAULTS = {
  "theme.accent": "#6D28D9",
  "theme.radius": "8px",
  "theme.font-family": "Inter, system-ui, sans-serif",
  "theme.spacing-unit": "4px",
  "theme.animation-duration": "150ms",
  "theme.dark-mode": "auto",
} as const;

export type ThemeKey = keyof typeof THEME_DEFAULTS;

export type ThemeSetting = {
  key: ThemeKey;
  value: string;
  defaultValue: string;
};

export type RawThemeSetting = {
  key: string;
  value: string;
};

export abstract class ThemeSettingsRepository {
  abstract listThemeSettings(orgId: string, userId: string): Promise<RawThemeSetting[]>;
  abstract upsertThemeSetting(orgId: string, userId: string, key: string, value: string): Promise<void>;
}

export const LEGACY_THEME_DEFAULTS = {
  accentHue: 262,
  accentSaturation: 83,
  accentLightness: 58,
  radius: 0.5,
  fontFamily: "inter",
  colorScheme: "auto",
  compactMode: false,
  animationSpeed: "normal",
  preset: "default",
} as const;

export type LegacyThemeSettings = {
  accentHue: number;
  accentSaturation: number;
  accentLightness: number;
  radius: number;
  fontFamily: "inter" | "system" | "mono";
  colorScheme: "light" | "dark" | "auto";
  compactMode: boolean;
  animationSpeed: "normal" | "reduced" | "off";
  preset: "default" | "ocean" | "forest" | "sunset" | "monochrome";
};

export function normalizeThemeKey(key: string): ThemeKey {
  const normalized = key.startsWith("theme.") ? key : `theme.${key}`;
  if (normalized in THEME_DEFAULTS) return normalized as ThemeKey;
  throw new AppValidationError(`Unknown theme key '${key}'.`);
}

export function validateThemeValue(key: ThemeKey, value: string): string {
  const trimmed = value.trim();
  if (key === "theme.accent" && !/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    throw new AppValidationError("theme.accent must be a 6-digit HEX color.");
  }
  if (key === "theme.dark-mode" && !["light", "dark", "auto"].includes(trimmed)) {
    throw new AppValidationError("theme.dark-mode must be light, dark, or auto.");
  }
  return trimmed;
}

function themeRepo(ctx: AdminAppContext): ThemeSettingsRepository {
  if (!ctx.container?.has?.(ThemeSettingsRepository)) {
    throw new AppInvariantError("Theme settings repository is not configured.");
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ctx.container.get(ThemeSettingsRepository as any);
}

function legacyKey(key: keyof LegacyThemeSettings): string {
  return `theme.web.${key}`;
}

function legacyThemeSettings(overrides: Map<string, string>): LegacyThemeSettings {
  return {
    accentHue: Number(overrides.get(legacyKey("accentHue")) ?? LEGACY_THEME_DEFAULTS.accentHue),
    accentSaturation: Number(overrides.get(legacyKey("accentSaturation")) ?? LEGACY_THEME_DEFAULTS.accentSaturation),
    accentLightness: Number(overrides.get(legacyKey("accentLightness")) ?? LEGACY_THEME_DEFAULTS.accentLightness),
    radius: Number(overrides.get(legacyKey("radius")) ?? LEGACY_THEME_DEFAULTS.radius),
    fontFamily: (overrides.get(legacyKey("fontFamily")) ?? LEGACY_THEME_DEFAULTS.fontFamily) as LegacyThemeSettings["fontFamily"],
    colorScheme: (overrides.get(legacyKey("colorScheme")) ?? LEGACY_THEME_DEFAULTS.colorScheme) as LegacyThemeSettings["colorScheme"],
    compactMode: (overrides.get(legacyKey("compactMode")) ?? String(LEGACY_THEME_DEFAULTS.compactMode)) === "true",
    animationSpeed: (overrides.get(legacyKey("animationSpeed")) ?? LEGACY_THEME_DEFAULTS.animationSpeed) as LegacyThemeSettings["animationSpeed"],
    preset: (overrides.get(legacyKey("preset")) ?? LEGACY_THEME_DEFAULTS.preset) as LegacyThemeSettings["preset"],
  };
}

function themeSetting(key: ThemeKey, overrides: Map<ThemeKey, string>): ThemeSetting {
  const defaultValue = THEME_DEFAULTS[key];
  return { key, value: overrides.get(key) ?? defaultValue, defaultValue };
}

export async function getLegacyThemeSettings(ctx: AdminAppContext): Promise<LegacyThemeSettings> {
  const overrides = await themeRepo(ctx).listThemeSettings(ctx.orgId, ctx.userId);
  return legacyThemeSettings(new Map(overrides.map((item) => [item.key, item.value])));
}

export async function updateLegacyThemeSettings(ctx: AdminAppContext, input: LegacyThemeSettings): Promise<LegacyThemeSettings> {
  const repo = themeRepo(ctx);
  for (const [key, value] of Object.entries(input) as Array<[keyof LegacyThemeSettings, LegacyThemeSettings[keyof LegacyThemeSettings]]>) {
    await repo.upsertThemeSetting(ctx.orgId, ctx.userId, legacyKey(key), String(value));
  }
  return input;
}

async function readThemeMap(ctx: AdminAppContext): Promise<Map<ThemeKey, string>> {
  const overrides = await themeRepo(ctx).listThemeSettings(ctx.orgId, ctx.userId);
  const values = new Map<ThemeKey, string>();
  for (const item of overrides) {
    if (!(item.key in THEME_DEFAULTS)) continue;
    values.set(item.key as ThemeKey, item.value);
  }
  return values;
}

export async function listThemeSettings(ctx: AdminAppContext): Promise<ThemeSetting[]> {
  const overrides = await readThemeMap(ctx);
  return (Object.keys(THEME_DEFAULTS) as ThemeKey[]).map((key) => themeSetting(key, overrides));
}

export async function getThemeSetting(ctx: AdminAppContext, keyInput: string): Promise<ThemeSetting> {
  const key = normalizeThemeKey(keyInput);
  const overrides = await readThemeMap(ctx);
  return themeSetting(key, overrides);
}

export async function setThemeSetting(ctx: AdminAppContext, input: { key: string; value: string }): Promise<ThemeSetting> {
  const key = normalizeThemeKey(input.key);
  const value = validateThemeValue(key, input.value);
  await themeRepo(ctx).upsertThemeSetting(ctx.orgId, ctx.userId, key, value);
  return { key, value, defaultValue: THEME_DEFAULTS[key] };
}

async function getFeatureFlagClass() {
  const { FeatureFlag } = await import("@identity-access/infrastructure/database/entities/auth/FeatureFlag.ts");
  return FeatureFlag;
}

async function getFeatureFlagRepository() {
  const { FeatureFlagRepository } = await import("@identity-access/infrastructure/database/repositories/auth/FeatureFlagRepository.ts");
  return FeatureFlagRepository;
}

async function getOrgMemberRepository() {
  const { OrgMemberRepository } = await import("@identity-access/infrastructure/database/repositories/auth/OrgMemberRepository.ts");
  return OrgMemberRepository;
}

async function getOrgClass() {
  const { Org } = await import("@identity-access/infrastructure/database/entities/auth/Org.ts");
  return Org;
}

async function getFeatureFlagRolloutClass() {
  const { FeatureFlagRollout } = await import("@platform-core/infrastructure/application-database/entities/platform/FeatureFlagRollout.ts");
  return FeatureFlagRollout;
}

async function resolveFlagRegistry(ctx: AdminAppContext): Promise<FlagRegistry> {
  if (ctx.container) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ctx.container.get(FlagRegistry as any);
    } catch {}
  }
  if (ctx.em) {
    const FeatureFlagRepository = await getFeatureFlagRepository();
    const FeatureFlag = await getFeatureFlagClass();
    const repo = ctx.em.getRepository(FeatureFlag) as never;
    return new FlagRegistry(repo as InstanceType<typeof FeatureFlagRepository>);
  }
  throw new AppInvariantError("FlagRegistry could not be resolved: neither container nor em available.");
}

async function resolveOrgMemberRepo(ctx: AdminAppContext): Promise<unknown | null> {
  if (ctx.container) {
    const OrgMemberRepository = await getOrgMemberRepository();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ctx.container.get(OrgMemberRepository as any);
    } catch {
      return null;
    }
  }
  return null;
}

async function findOrgMembership(ctx: AdminAppContext, orgId: string, userId: string): Promise<{ role: string } | null> {
  const orgMemberRepo = await resolveOrgMemberRepo(ctx);
  if (orgMemberRepo) {
    return (orgMemberRepo as { findOne(input: unknown): Promise<{ role: string } | null> }).findOne({ orgId, userId });
  }
  const em = requireEm(ctx);
  const { OrgMember } = await import("@identity-access/infrastructure/database/entities/auth/OrgMember.ts");
  return em.findOne(OrgMember, { where: { orgId, userId } as never }) as Promise<{ role: string } | null>;
}

async function requireOwnerOrAdmin(ctx: AdminAppContext): Promise<void> {
  const membership = await findOrgMembership(ctx, ctx.orgId, ctx.userId);
  if (!membership || (membership.role !== "owner" && membership.role !== "admin")) {
    throw new AppForbiddenError("Only org owners and admins can modify feature flags.");
  }
}

async function requireWritableFlagScope(ctx: AdminAppContext, input: { orgId?: string; userId?: string }): Promise<string> {
  if (input.orgId && input.orgId !== ctx.orgId) {
    throw new AppForbiddenError("Cannot modify feature flags outside the active org.");
  }
  if (input.userId) {
    const targetMembership = await findOrgMembership(ctx, ctx.orgId, input.userId);
    if (!targetMembership) {
      throw new AppForbiddenError("Cannot modify feature flags for users outside the active org.");
    }
  }
  return ctx.orgId;
}

const rolloutCohortRulesSchema = z.object({
  orgOverrides: z.record(z.string().uuid(), z.boolean()).optional(),
}).passthrough();

function readOrgOverrides(cohortRules: Record<string, unknown> | null | undefined): Record<string, boolean> {
  const parsed = rolloutCohortRulesSchema.safeParse(cohortRules ?? {});
  if (!parsed.success) return {};
  return parsed.data.orgOverrides ?? {};
}

async function findScopedFeatureFlag(em: EntityManager, flag: FeatureFlagName, orgId: string) {
  const FeatureFlag = await getFeatureFlagClass();
  return em.findOne(FeatureFlag, { where: { flag, orgId, userId: null } as never });
}

async function ensureScopedFeatureFlag(em: EntityManager, flag: FeatureFlagName, orgId: string) {
  const existing = await findScopedFeatureFlag(em, flag, orgId);
  if (existing) return existing;
  const FeatureFlag = await getFeatureFlagClass();
  const row = em.create(FeatureFlag, { flag, enabled: true, orgId, userId: null, createdAt: new Date() } as never);
  await em.save(row);
  return row;
}

async function findRollout(em: EntityManager, flag: FeatureFlagName, orgId: string) {
  const FeatureFlagRollout = await getFeatureFlagRolloutClass();
  const flagRow = await findScopedFeatureFlag(em, flag, orgId);
  if (!flagRow) return null;
  return em.findOne(FeatureFlagRollout, { where: { org: { id: orgId }, flag: (flagRow as { id: string }).id } as never });
}

async function upsertRollout(
  em: EntityManager,
  input: { flag: FeatureFlagName; orgId: string; rolloutPercent?: number; orgOverride?: boolean; updatedBy?: string | null },
) {
  const FeatureFlagRollout = await getFeatureFlagRolloutClass();
  const Org = await getOrgClass();
  const { User } = await import("@identity-access/infrastructure/database/entities/auth/User.ts");
  const flagRow = await ensureScopedFeatureFlag(em, input.flag, input.orgId);
  let rollout = await findRollout(em, input.flag, input.orgId);

  if (!rollout) {
    rollout = em.create(FeatureFlagRollout, {
      org: { id: input.orgId } as InstanceType<typeof Org>,
      flag: flagRow,
      rolloutPercent: input.rolloutPercent ?? 100,
      cohortRules: {},
      updatedBy: input.updatedBy ? { id: input.updatedBy } as InstanceType<typeof User> : undefined,
      updatedAt: new Date(),
    } as never);
    await em.save(rollout);
  }

  if (typeof input.rolloutPercent === "number") (rollout as { rolloutPercent: number }).rolloutPercent = input.rolloutPercent;
  if (typeof input.orgOverride === "boolean") {
    const current = (rollout as { cohortRules: Record<string, unknown> }).cohortRules ?? {};
    (rollout as { cohortRules: Record<string, unknown> }).cohortRules = {
      ...current,
      orgOverrides: { ...readOrgOverrides(current), [input.orgId]: input.orgOverride },
    };
  }
  (rollout as { updatedAt: Date }).updatedAt = new Date();
  await em.save(rollout);
}

export async function listFeatureFlags(ctx: AdminAppContext) {
  const registry = await resolveFlagRegistry(ctx);
  return Promise.all(
    FEATURE_FLAGS.map(async (flag) => ({
      name: flag,
      enabled: await registry.isEnabled(flag, { orgId: ctx.orgId, userId: ctx.userId }),
      description: FLAG_DESCRIPTIONS[flag],
    })),
  );
}

export async function setFeatureFlag(
  ctx: AdminAppContext,
  input: { flag: FeatureFlagName; enabled: boolean; orgId?: string; userId?: string },
): Promise<{ ok: boolean }> {
  await requireOwnerOrAdmin(ctx);
  const targetOrgId = await requireWritableFlagScope(ctx, input);
  const em = requireEm(ctx);
  const FeatureFlag = await getFeatureFlagClass();
  const scopedUserId = input.userId ?? null;
  const existing = await em.findOne(FeatureFlag, { where: { flag: input.flag, orgId: targetOrgId, userId: scopedUserId } as never });
  if (existing) {
    (existing as { enabled: boolean }).enabled = input.enabled;
    await em.save(existing);
  } else {
    const row = em.create(FeatureFlag, {
      flag: input.flag,
      enabled: input.enabled,
      orgId: targetOrgId,
      userId: scopedUserId ?? undefined,
      createdAt: new Date(),
    } as never);
    await em.save(row);
  }
  (await resolveFlagRegistry(ctx)).bustFlag(input.flag);
  return { ok: true };
}

export async function evaluateFlag(ctx: AdminAppContext, input: { flag: FeatureFlagName; orgId: string; userId: string }) {
  if (input.orgId !== ctx.orgId) {
    throw new AppForbiddenError("Cannot evaluate feature flags outside the active org.");
  }
  const registry = await resolveFlagRegistry(ctx);
  const baseEnabled = await registry.isEnabled(input.flag, { orgId: input.orgId, userId: input.userId });
  if (!ctx.em) {
    return { enabled: evaluateFeatureFlag({ flag: input.flag, orgId: input.orgId, userId: input.userId, config: { enabled: baseEnabled, rolloutPercent: 100 } }) };
  }
  const rollout = await findRollout(ctx.em, input.flag, input.orgId);
  return {
    enabled: evaluateFeatureFlag({
      flag: input.flag,
      orgId: input.orgId,
      userId: input.userId,
      config: {
        enabled: baseEnabled,
        rolloutPercent: (rollout as { rolloutPercent?: number } | null)?.rolloutPercent ?? 100,
        orgOverrides: readOrgOverrides((rollout as { cohortRules?: Record<string, unknown> } | null)?.cohortRules),
      },
    }),
  };
}

export async function setFlagOverride(ctx: AdminAppContext, input: { flag: FeatureFlagName; orgId: string; enabled: boolean }) {
  await requireOwnerOrAdmin(ctx);
  const targetOrgId = await requireWritableFlagScope(ctx, { orgId: input.orgId });
  await upsertRollout(requireEm(ctx), { flag: input.flag, orgId: targetOrgId, orgOverride: input.enabled, updatedBy: ctx.userId });
  return { ok: true as const };
}

export async function setFlagRollout(ctx: AdminAppContext, input: { flag: FeatureFlagName; rolloutPercent: number; orgId?: string }) {
  await requireOwnerOrAdmin(ctx);
  const targetOrgId = await requireWritableFlagScope(ctx, input);
  await upsertRollout(requireEm(ctx), { flag: input.flag, orgId: targetOrgId, rolloutPercent: input.rolloutPercent, updatedBy: ctx.userId });
  return { ok: true as const };
}

export async function markInferenceModelDownloaded(
  ctx: AdminAppContext,
  modelId: string,
  model: InferenceModel | undefined,
): Promise<void> {
  if (!ctx.em || !model) return;
  const Org = await getOrgClass();
  const org = await ctx.em.findOne(Org, { where: { id: ctx.orgId } as never });
  if (!org) return;
  const { ModelCache } = await import("@platform-core/infrastructure/application-database/entities/inference/ModelCache.ts");
  const repo = ctx.em.getRepository(ModelCache) as unknown as {
    markDownloaded(input: { org: typeof org; modelId: string; kind: string; sizeBytes?: number }): Promise<unknown>;
  };
  await repo.markDownloaded({
    org,
    modelId,
    kind: model.kind,
    sizeBytes: model.sizeBytesActual ?? model.sizeBytes,
  });
}

export async function markInferenceModelMissing(ctx: AdminAppContext, modelId: string): Promise<void> {
  if (!ctx.em) return;
  const Org = await getOrgClass();
  const org = await ctx.em.findOne(Org, { where: { id: ctx.orgId } as never });
  if (!org) return;
  const { ModelCache } = await import("@platform-core/infrastructure/application-database/entities/inference/ModelCache.ts");
  const repo = ctx.em.getRepository(ModelCache) as unknown as {
    markMissing(input: { org: typeof org; modelId: string }): Promise<unknown>;
  };
  await repo.markMissing({ org, modelId });
}
