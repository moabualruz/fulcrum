import { injectable } from "@needle-di/core";
import { EntityRepository } from "@mikro-orm/postgresql";
import { TenantSetting } from "../entities/TenantSetting.ts";

@injectable()
export class TenantSettingRepository extends EntityRepository<TenantSetting> {
  async get(orgId: string, key: string): Promise<TenantSetting | null> {
    await this.getEntityManager().flush();
    return this.findOne({ orgId, key });
  }

  async set(orgId: string, key: string, value: unknown): Promise<TenantSetting> {
    const existing = await this.findOne({ orgId, key });
    if (existing) {
      existing.value = value;
      existing.updatedAt = new Date();
      await this.getEntityManager().flush();
      return existing;
    }

    const setting = this.create({ orgId, key, value });
    await this.getEntityManager().persistAndFlush(setting);
    return setting;
  }

  async delete(orgId: string, key: string): Promise<boolean> {
    const result = await this.nativeDelete({ orgId, key });
    return result > 0;
  }

  async list(orgId: string): Promise<TenantSetting[]> {
    await this.getEntityManager().flush();
    return this.find({ orgId }, { orderBy: { key: "ASC" } });
  }
}
