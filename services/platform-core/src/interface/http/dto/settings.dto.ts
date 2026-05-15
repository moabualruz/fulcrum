export class SettingsScopeQueryDto {
  orgId!: string;
  userId?: string;
}

export class SettingsKeyParamsDto {
  key!: string;
}

export class SettingsValueDto extends SettingsScopeQueryDto {
  value!: unknown;
}
