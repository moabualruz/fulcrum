import type {
  CredentialRepository,
  HttpClient,
  ImportResult as SourceImportResult,
} from "@integration-hub/application/importers/sources/types.ts";
import type {
  ImporterDescriptor,
  ImporterName,
  ImporterPreflightInput,
  ImporterPreflightResult,
  ImportResult,
} from "@integration-hub/application/importers/web-actions.ts";

export type {
  CredentialRepository,
  HttpClient,
  ImporterDescriptor,
  ImporterName,
  ImporterPreflightInput,
  ImporterPreflightResult,
  ImportResult,
  SourceImportResult,
};

export const IMPORTER_NAMES: ImporterName[] = ["csv", "linear", "jira", "plane"];

export function featureList(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env["FULCRUM_FEATURES"] ?? "").split(",").map((feature) => feature.trim()).filter(Boolean);
}

export function isImporterEnabled(name: ImporterName, env: NodeJS.ProcessEnv = process.env): boolean {
  return featureList(env).includes(`import-${name}`);
}

export function listImporters(env: NodeJS.ProcessEnv = process.env): ImporterDescriptor[] {
  return IMPORTER_NAMES.map((name) => ({
    name,
    enabled: isImporterEnabled(name, env),
  }));
}

export function listImportHistory(): ImportResult[] {
  return [];
}

export async function preflightImporter(input: ImporterPreflightInput): Promise<ImporterPreflightResult> {
  const actions = await import("@integration-hub/application/importers/web-actions.ts");
  return actions.preflightImporter(input);
}

export async function runImporter(): Promise<never> {
  const actions = await import("@integration-hub/application/importers/web-actions.ts");
  return actions.runImporter();
}

export async function importProjectSource(input: {
  format: string;
  project: string;
  dryRun: boolean;
  credentials: CredentialRepository;
  http: HttpClient;
  workspace?: string;
}): Promise<SourceImportResult> {
  switch (input.format) {
    case "linear": {
      const importer = await import("@integration-hub/application/importers/sources/linear.ts");
      return importer.importFromLinear(input.project, input.credentials, input.http, { dryRun: input.dryRun });
    }
    case "jira": {
      const importer = await import("@integration-hub/application/importers/sources/jira.ts");
      return importer.importFromJira(input.project, input.credentials, input.http, { dryRun: input.dryRun });
    }
    case "plane": {
      const importer = await import("@integration-hub/application/importers/sources/plane.ts");
      return importer.importFromPlane(
        input.workspace ?? input.project,
        input.project,
        input.credentials,
        input.http,
        { dryRun: input.dryRun },
      );
    }
    default:
      throw new Error(`Unknown import format: ${input.format}. Supported: linear, jira, plane`);
  }
}
