import { randomUUID } from "node:crypto";
import type { DataSource, Repository } from "typeorm";

import {
  FulcrumTenantSettingEntity,
  type FulcrumTenantSetting,
} from "@platform-core/infrastructure/database/tenant-setting.entities.ts";

export interface TenantSettingScope {
  orgId: string;
}

export interface TenantSettingValueInput extends TenantSettingScope {
  key: string;
  value: unknown;
}

export class TenantSettingStore {
  constructor(private readonly dataSource: DataSource) {}

  async list(scope: TenantSettingScope): Promise<FulcrumTenantSetting[]> {
    return await this.repository().find({
      where: { orgId: scope.orgId },
      order: { key: "ASC" },
    });
  }

  async get(scope: TenantSettingScope, key: string): Promise<FulcrumTenantSetting | null> {
    return await this.repository().findOneBy({ orgId: scope.orgId, key });
  }

  async set(input: TenantSettingValueInput): Promise<FulcrumTenantSetting> {
    const repository = this.repository();
    const existing = await repository.findOneBy({ orgId: input.orgId, key: input.key });
    const row = existing ?? repository.create({
      id: randomUUID(),
      orgId: input.orgId,
      key: input.key,
      value: input.value,
    });
    row.value = input.value;
    return await repository.save(row);
  }

  private repository(): Repository<FulcrumTenantSetting> {
    return this.dataSource.getRepository(FulcrumTenantSettingEntity);
  }
}
