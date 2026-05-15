export type {
  BackupSummaryDto,
  SettingsEntityKind,
  SettingsErrorDto,
  SettingsFeatureFlagDto,
  SettingsSecretDto,
  SettingsTelemetryDto,
} from "@platform-core/application/settings/queries.ts";
export {
  SETTINGS_ENTITY_KINDS,
} from "@platform-core/application/settings/queries.ts";
import {
  preflightSettingsBackup as runPreflightSettingsBackup,
  preflightSettingsDataImport as runPreflightSettingsDataImport,
} from "@platform-core/application/settings/commands.ts";
import {
  summarizeImportManifest as runSummarizeImportManifest,
} from "@platform-core/application/settings/queries.ts";

type AddSettingsSecret = typeof import("@platform-core/application/settings/commands.ts").addSettingsSecret;
type ClearSettingsErrors = typeof import("@platform-core/application/settings/commands.ts").clearSettingsErrors;
type CreateSettingsBackup = typeof import("@platform-core/application/settings/commands.ts").createSettingsBackup;
type CreateSettingsDataExport = typeof import("@platform-core/application/settings/queries.ts").createSettingsDataExport;
type DeleteSettingsSecret = typeof import("@platform-core/application/settings/commands.ts").deleteSettingsSecret;
type GetSettingsTelemetry = typeof import("@platform-core/application/settings/queries.ts").getSettingsTelemetry;
type ImportSettingsData = typeof import("@platform-core/application/settings/commands.ts").importSettingsData;
type ListBackupSummaries = typeof import("@platform-core/application/settings/queries.ts").listBackupSummaries;
type ListSettingsErrors = typeof import("@platform-core/application/settings/queries.ts").listSettingsErrors;
type ListSettingsFeatureFlags = typeof import("@platform-core/application/settings/queries.ts").listSettingsFeatureFlags;
type ListSettingsSecrets = typeof import("@platform-core/application/settings/queries.ts").listSettingsSecrets;
type PreflightSettingsBackup = typeof import("@platform-core/application/settings/commands.ts").preflightSettingsBackup;
type PreflightSettingsDataImport = typeof import("@platform-core/application/settings/commands.ts").preflightSettingsDataImport;
type PurgeSettingsTelemetry = typeof import("@platform-core/application/settings/commands.ts").purgeSettingsTelemetry;
type RestoreSettingsBackup = typeof import("@platform-core/application/settings/commands.ts").restoreSettingsBackup;
type RotateSettingsSecret = typeof import("@platform-core/application/settings/commands.ts").rotateSettingsSecret;
type SetSettingsFeatureFlagCohortRules = typeof import("@platform-core/application/settings/commands.ts").setSettingsFeatureFlagCohortRules;
type SetSettingsFeatureFlagRollout = typeof import("@platform-core/application/settings/commands.ts").setSettingsFeatureFlagRollout;
type SummarizeImportManifest = typeof import("@platform-core/application/settings/queries.ts").summarizeImportManifest;
type ToggleSettingsFeatureFlag = typeof import("@platform-core/application/settings/commands.ts").toggleSettingsFeatureFlag;
type ToggleSettingsSecretArchive = typeof import("@platform-core/application/settings/commands.ts").toggleSettingsSecretArchive;
type ToggleSettingsTelemetryOptIn = typeof import("@platform-core/application/settings/commands.ts").toggleSettingsTelemetryOptIn;

export async function addSettingsSecret(
  ...args: Parameters<AddSettingsSecret>
): Promise<Awaited<ReturnType<AddSettingsSecret>>> {
  const commands = await import("@platform-core/application/settings/commands.ts");
  return commands.addSettingsSecret(...args);
}

export async function clearSettingsErrors(
  ...args: Parameters<ClearSettingsErrors>
): Promise<Awaited<ReturnType<ClearSettingsErrors>>> {
  const commands = await import("@platform-core/application/settings/commands.ts");
  return commands.clearSettingsErrors(...args);
}

export async function createSettingsBackup(
  ...args: Parameters<CreateSettingsBackup>
): Promise<Awaited<ReturnType<CreateSettingsBackup>>> {
  const commands = await import("@platform-core/application/settings/commands.ts");
  return commands.createSettingsBackup(...args);
}

export async function createSettingsDataExport(
  ...args: Parameters<CreateSettingsDataExport>
): Promise<Awaited<ReturnType<CreateSettingsDataExport>>> {
  const queries = await import("@platform-core/application/settings/queries.ts");
  return queries.createSettingsDataExport(...args);
}

export async function deleteSettingsSecret(
  ...args: Parameters<DeleteSettingsSecret>
): Promise<Awaited<ReturnType<DeleteSettingsSecret>>> {
  const commands = await import("@platform-core/application/settings/commands.ts");
  return commands.deleteSettingsSecret(...args);
}

export async function getSettingsTelemetry(
  ...args: Parameters<GetSettingsTelemetry>
): Promise<Awaited<ReturnType<GetSettingsTelemetry>>> {
  const queries = await import("@platform-core/application/settings/queries.ts");
  return queries.getSettingsTelemetry(...args);
}

export async function importSettingsData(
  ...args: Parameters<ImportSettingsData>
): Promise<Awaited<ReturnType<ImportSettingsData>>> {
  const commands = await import("@platform-core/application/settings/commands.ts");
  return commands.importSettingsData(...args);
}

export async function listBackupSummaries(
  ...args: Parameters<ListBackupSummaries>
): Promise<Awaited<ReturnType<ListBackupSummaries>>> {
  const queries = await import("@platform-core/application/settings/queries.ts");
  return queries.listBackupSummaries(...args);
}

export async function listSettingsErrors(
  ...args: Parameters<ListSettingsErrors>
): Promise<Awaited<ReturnType<ListSettingsErrors>>> {
  const queries = await import("@platform-core/application/settings/queries.ts");
  return queries.listSettingsErrors(...args);
}

export async function listSettingsFeatureFlags(
  ...args: Parameters<ListSettingsFeatureFlags>
): Promise<Awaited<ReturnType<ListSettingsFeatureFlags>>> {
  const queries = await import("@platform-core/application/settings/queries.ts");
  return queries.listSettingsFeatureFlags(...args);
}

export async function listSettingsSecrets(
  ...args: Parameters<ListSettingsSecrets>
): Promise<Awaited<ReturnType<ListSettingsSecrets>>> {
  const queries = await import("@platform-core/application/settings/queries.ts");
  return queries.listSettingsSecrets(...args);
}

export function preflightSettingsBackup(
  ...args: Parameters<PreflightSettingsBackup>
): ReturnType<PreflightSettingsBackup> {
  return runPreflightSettingsBackup(...args);
}

export function preflightSettingsDataImport(
  ...args: Parameters<PreflightSettingsDataImport>
): ReturnType<PreflightSettingsDataImport> {
  return runPreflightSettingsDataImport(...args);
}

export async function purgeSettingsTelemetry(
  ...args: Parameters<PurgeSettingsTelemetry>
): Promise<Awaited<ReturnType<PurgeSettingsTelemetry>>> {
  const commands = await import("@platform-core/application/settings/commands.ts");
  return commands.purgeSettingsTelemetry(...args);
}

export async function restoreSettingsBackup(
  ...args: Parameters<RestoreSettingsBackup>
): Promise<Awaited<ReturnType<RestoreSettingsBackup>>> {
  const commands = await import("@platform-core/application/settings/commands.ts");
  return commands.restoreSettingsBackup(...args);
}

export async function rotateSettingsSecret(
  ...args: Parameters<RotateSettingsSecret>
): Promise<Awaited<ReturnType<RotateSettingsSecret>>> {
  const commands = await import("@platform-core/application/settings/commands.ts");
  return commands.rotateSettingsSecret(...args);
}

export async function setSettingsFeatureFlagCohortRules(
  ...args: Parameters<SetSettingsFeatureFlagCohortRules>
): Promise<Awaited<ReturnType<SetSettingsFeatureFlagCohortRules>>> {
  const commands = await import("@platform-core/application/settings/commands.ts");
  return commands.setSettingsFeatureFlagCohortRules(...args);
}

export async function setSettingsFeatureFlagRollout(
  ...args: Parameters<SetSettingsFeatureFlagRollout>
): Promise<Awaited<ReturnType<SetSettingsFeatureFlagRollout>>> {
  const commands = await import("@platform-core/application/settings/commands.ts");
  return commands.setSettingsFeatureFlagRollout(...args);
}

export function summarizeImportManifest(
  ...args: Parameters<SummarizeImportManifest>
): ReturnType<SummarizeImportManifest> {
  return runSummarizeImportManifest(...args);
}

export async function toggleSettingsFeatureFlag(
  ...args: Parameters<ToggleSettingsFeatureFlag>
): Promise<Awaited<ReturnType<ToggleSettingsFeatureFlag>>> {
  const commands = await import("@platform-core/application/settings/commands.ts");
  return commands.toggleSettingsFeatureFlag(...args);
}

export async function toggleSettingsSecretArchive(
  ...args: Parameters<ToggleSettingsSecretArchive>
): Promise<Awaited<ReturnType<ToggleSettingsSecretArchive>>> {
  const commands = await import("@platform-core/application/settings/commands.ts");
  return commands.toggleSettingsSecretArchive(...args);
}

export async function toggleSettingsTelemetryOptIn(
  ...args: Parameters<ToggleSettingsTelemetryOptIn>
): Promise<Awaited<ReturnType<ToggleSettingsTelemetryOptIn>>> {
  const commands = await import("@platform-core/application/settings/commands.ts");
  return commands.toggleSettingsTelemetryOptIn(...args);
}
