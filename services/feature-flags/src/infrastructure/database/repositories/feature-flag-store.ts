import { randomUUID } from "node:crypto";
import { IsNull, type FindOptionsWhere, type Repository } from "typeorm";
import { DataSource } from "typeorm";

import {
  evaluateFeatureFlag,
  normalizeRolloutPercent,
} from "@feature-flags/application/evaluation.ts";
import {
  FEATURE_FLAGS,
  FLAG_DESCRIPTIONS,
  type FeatureFlagName,
  isRegisteredFeatureFlag,
} from "@feature-flags/application/registry.ts";
import {
  PlatformFeatureFlagEntity,
  type PlatformFeatureFlag,
} from "@feature-flags/infrastructure/database/entities/feature-flag.entities.ts";
import { isFeatureEnabled } from "@feature-flags/application/env-features.ts";

export interface FeatureFlagPublicRow {
  flag: FeatureFlagName;
  description: string;
  enabled: boolean;
  rolloutPercent: number;
  source: "user" | "org" | "env" | "default";
}

export class FeatureFlagStore {
  constructor(private readonly dataSource: DataSource) {}

  async list(input: {
    orgId?: string;
    userId?: string;
    featuresEnv?: string;
  } = {}): Promise<FeatureFlagPublicRow[]> {
    const rows: FeatureFlagPublicRow[] = [];
    for (const flag of FEATURE_FLAGS) {
      const resolved = await this.resolve(flag, input);
      rows.push({
        flag,
        description: FLAG_DESCRIPTIONS[flag],
        enabled: resolved.enabled,
        rolloutPercent: resolved.rolloutPercent,
        source: resolved.source,
      });
    }
    return rows;
  }

  async evaluate(input: {
    flag: string;
    orgId: string;
    userId: string;
    featuresEnv?: string;
  }): Promise<{ flag: FeatureFlagName; enabled: boolean; rolloutPercent: number; source: FeatureFlagPublicRow["source"] }> {
    const flag = requireRegisteredFlag(input.flag);
    const resolved = await this.resolve(flag, input);
    return {
      flag,
      enabled: evaluateFeatureFlag({
        flag,
        orgId: input.orgId,
        userId: input.userId,
        config: {
          enabled: resolved.enabled,
          rolloutPercent: resolved.rolloutPercent,
        },
      }),
      rolloutPercent: resolved.rolloutPercent,
      source: resolved.source,
    };
  }

  async set(input: {
    flag: string;
    orgId: string;
    userId?: string | null;
    enabled: boolean;
  }): Promise<FeatureFlagPublicRow> {
    const flag = requireRegisteredFlag(input.flag);
    await this.upsert({
      orgId: input.orgId,
      userId: input.userId ?? null,
      flag,
      enabled: input.enabled,
      rolloutPercent: input.enabled ? 100 : 0,
    });
    const resolved = await this.resolve(flag, { orgId: input.orgId, userId: input.userId ?? undefined });
    return {
      flag,
      description: FLAG_DESCRIPTIONS[flag],
      enabled: resolved.enabled,
      rolloutPercent: resolved.rolloutPercent,
      source: resolved.source,
    };
  }

  async setOverride(input: {
    flag: string;
    orgId: string;
    enabled: boolean;
  }): Promise<FeatureFlagPublicRow> {
    return await this.set({
      flag: input.flag,
      orgId: input.orgId,
      userId: null,
      enabled: input.enabled,
    });
  }

  async setRollout(input: {
    flag: string;
    orgId: string;
    rolloutPercent: number;
  }): Promise<FeatureFlagPublicRow> {
    const flag = requireRegisteredFlag(input.flag);
    await this.upsert({
      orgId: input.orgId,
      userId: null,
      flag,
      enabled: normalizeRolloutPercent(input.rolloutPercent) > 0,
      rolloutPercent: normalizeRolloutPercent(input.rolloutPercent),
    });
    const resolved = await this.resolve(flag, { orgId: input.orgId });
    return {
      flag,
      description: FLAG_DESCRIPTIONS[flag],
      enabled: resolved.enabled,
      rolloutPercent: resolved.rolloutPercent,
      source: resolved.source,
    };
  }

  private async resolve(
    flag: FeatureFlagName,
    input: { orgId?: string; userId?: string; featuresEnv?: string },
  ): Promise<{ enabled: boolean; rolloutPercent: number; source: FeatureFlagPublicRow["source"] }> {
    if (input.orgId && input.userId) {
      const userRow = await this.findScoped({ orgId: input.orgId, userId: input.userId, flag });
      if (userRow) return rowResolution(userRow, "user");
    }
    if (input.orgId) {
      const orgRow = await this.findScoped({ orgId: input.orgId, userId: null, flag });
      if (orgRow) return rowResolution(orgRow, "org");
    }
    if (isFeatureEnabled(flag, input.featuresEnv)) {
      return { enabled: true, rolloutPercent: 100, source: "env" };
    }
    return { enabled: false, rolloutPercent: 0, source: "default" };
  }

  private async upsert(input: {
    orgId: string | null;
    userId: string | null;
    flag: FeatureFlagName;
    enabled: boolean;
    rolloutPercent: number;
  }): Promise<PlatformFeatureFlag> {
    const existing = await this.findScoped(input);
    const row = this.repository().create({
      id: existing?.id ?? randomUUID(),
      orgId: input.orgId,
      userId: input.userId,
      flag: input.flag,
      enabled: input.enabled,
      rolloutPercent: normalizeRolloutPercent(input.rolloutPercent),
    });
    return await this.repository().save(row);
  }

  private async findScoped(input: {
    orgId?: string | null;
    userId?: string | null;
    flag: FeatureFlagName;
  }): Promise<PlatformFeatureFlag | null> {
    const where: FindOptionsWhere<PlatformFeatureFlag> = {
      flag: input.flag,
      orgId: input.orgId ?? IsNull(),
      userId: input.userId ?? IsNull(),
    };
    return await this.repository().findOne({ where, order: { updatedAt: "DESC", id: "ASC" } });
  }

  private repository(): Repository<PlatformFeatureFlag> {
    return this.dataSource.getRepository(PlatformFeatureFlagEntity);
  }
}

function rowResolution(
  row: PlatformFeatureFlag,
  source: FeatureFlagPublicRow["source"],
): { enabled: boolean; rolloutPercent: number; source: FeatureFlagPublicRow["source"] } {
  return {
    enabled: row.enabled,
    rolloutPercent: normalizeRolloutPercent(row.rolloutPercent),
    source,
  };
}

function requireRegisteredFlag(flag: string): FeatureFlagName {
  if (isRegisteredFeatureFlag(flag)) return flag;
  throw new Error(`Unknown feature flag: ${flag}`);
}
