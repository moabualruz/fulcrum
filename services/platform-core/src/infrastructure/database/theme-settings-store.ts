import { DataSource } from "typeorm";

import {
  listThemeTokenSettings,
  normalizeThemeTokenKey,
  themeProfileEntries,
  themeProfileFromSettings,
  themeTokenSetting,
  validateThemeTokenValue,
  type RawThemeSetting,
  type ThemeProfileSettings,
  type ThemeScope,
  type ThemeTokenSetting,
} from "@platform-core/application/theme-settings.ts";
import {
  FulcrumThemeSettingEntity,
  type FulcrumThemeSetting,
} from "@platform-core/infrastructure/database/theme-settings.entities.ts";

export class ThemeSettingsStore {
  constructor(private readonly dataSource: DataSource) {}

  async getProfile(scope: ThemeScope): Promise<ThemeProfileSettings> {
    return themeProfileFromSettings(await this.listRawSettings(scope));
  }

  async updateProfile(
    scope: ThemeScope,
    input: Partial<ThemeProfileSettings>,
  ): Promise<ThemeProfileSettings> {
    for (const entry of themeProfileEntries(input)) {
      await this.upsertRawSetting(scope, entry.key, entry.value);
    }
    return this.getProfile(scope);
  }

  async listTokens(scope: ThemeScope): Promise<ThemeTokenSetting[]> {
    return listThemeTokenSettings(await this.listRawSettings(scope));
  }

  async getToken(scope: ThemeScope, keyInput: string): Promise<ThemeTokenSetting> {
    const key = normalizeThemeTokenKey(keyInput);
    const overrides = new Map((await this.listRawSettings(scope)).map((item) => [item.key, item.value]));
    return themeTokenSetting(key, overrides);
  }

  async setToken(scope: ThemeScope, keyInput: string, valueInput: string): Promise<ThemeTokenSetting> {
    const key = normalizeThemeTokenKey(keyInput);
    const value = validateThemeTokenValue(key, valueInput);
    await this.upsertRawSetting(scope, key, value);
    return this.getToken(scope, key);
  }

  private async listRawSettings(scope: ThemeScope): Promise<RawThemeSetting[]> {
    const rows = await this.repository().find({
      where: { orgId: scope.orgId, userId: scope.userId },
      order: { key: "ASC" },
    });
    return rows.map((row) => ({ key: row.key, value: row.value }));
  }

  private async upsertRawSetting(scope: ThemeScope, key: string, value: string): Promise<void> {
    const repository = this.repository();
    const existing = await repository.findOneBy({
      orgId: scope.orgId,
      userId: scope.userId,
      key,
    });
    const row: FulcrumThemeSetting = existing ?? {
      id: crypto.randomUUID(),
      orgId: scope.orgId,
      userId: scope.userId,
      key,
      value,
    };
    row.value = value;
    await repository.save(row);
  }

  private repository() {
    return this.dataSource.getRepository(FulcrumThemeSettingEntity);
  }
}
