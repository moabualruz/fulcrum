import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { TenantSetting } from "../entities/TenantSetting.ts";

@Injectable()
export class TenantSettingRepository {
  constructor(
    @InjectRepository(TenantSetting)
    private readonly tenantSettings: Repository<TenantSetting>,
  ) {}

  async get(orgId: string, key: string): Promise<TenantSetting | null> {
    return this.tenantSettings.findOne({ where: { orgId, key } });
  }

  async set(orgId: string, key: string, value: unknown): Promise<TenantSetting> {
    const existing = await this.tenantSettings.findOne({ where: { orgId, key } });
    if (existing) {
      existing.value = value;
      existing.updatedAt = new Date();
      return this.tenantSettings.save(existing);
    }

    const setting = this.tenantSettings.create({ orgId, key, value });
    return this.tenantSettings.save(setting);
  }

  async delete(orgId: string, key: string): Promise<boolean> {
    const result = await this.tenantSettings.delete({ orgId, key });
    return (result.affected ?? 0) > 0;
  }

  async list(orgId: string): Promise<TenantSetting[]> {
    return this.tenantSettings.find({ where: { orgId }, order: { key: "ASC" } });
  }
}
