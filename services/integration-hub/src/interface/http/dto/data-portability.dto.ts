export class DataPortabilityScopeDto {
  orgId!: string;
  userId!: string;
}

export class BackupRestoreDto extends DataPortabilityScopeDto {
  dump!: string;
}

export class DataExportCreateDto extends DataPortabilityScopeDto {
  outputPath?: string;
  pretty?: boolean;
}

export class DataImportPreflightQueryDto extends DataPortabilityScopeDto {
  path!: string;
}

export class DataImportRunDto extends DataPortabilityScopeDto {
  importId!: string;
  dryRun?: boolean;
  onConflict?: "skip" | "update" | "error";
}
