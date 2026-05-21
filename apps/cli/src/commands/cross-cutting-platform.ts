import { readFile, writeFile } from "node:fs/promises";
import { TelemetryConsentStore } from "@platform-core/application/telemetry/consent-store.ts";
import {
  createDataPortabilityApiCallerFromEnv,
  type DataPortabilityApiEnvironment,
} from "@integration-hub/interface/http/data-portability-api-client.ts";
import { verifyBackupArchive } from "@platform-core/application/backup/runner.ts";
import { dirForLocale, normalizeLocale } from "@platform-core/application/localization/index.ts";
import type { NativeKeyringAdapter } from "@platform-core/application/secrets/keyring.ts";
import { productionAdapterFactory, type NativeAdapterLoader } from "@platform-core/application/secrets/keyring-platform.ts";
import {
  createCredentialApiCallerFromEnv,
  type CredentialApiEnvironment,
} from "@platform-core/interface/http/credential-api-client.ts";
import {
  createErrorLogApiCallerFromEnv,
  type ErrorLogApiEnvironment,
} from "@platform-core/interface/http/error-log-api-client.ts";
import {
  createFeatureExperimentApiCallerFromEnv,
  type FeatureExperimentApiEnvironment,
} from "@feature-flags/interface/http/feature-experiment-api-client.ts";
import {
  createThemeSettingsApiCallerFromEnv,
  type ThemeSettingsApiEnvironment,
} from "@platform-core/interface/http/theme-settings-api-client.ts";
import {
  createTelemetryApiCallerFromEnv,
  type TelemetryApiEnvironment,
} from "@platform-core/interface/http/telemetry-api-client.ts";

type Writer = (line: string) => void;
type CrossCuttingApiEnvironment =
  & CredentialApiEnvironment
  & DataPortabilityApiEnvironment
  & ErrorLogApiEnvironment
  & FeatureExperimentApiEnvironment
  & TelemetryApiEnvironment
  & ThemeSettingsApiEnvironment;

type CliOptions = {
  caller?: Record<string, any>;
  env?: CrossCuttingApiEnvironment;
  fetch?: typeof fetch;
  print?: Writer;
  printErr?: Writer;
  exit?: (code: number) => void;
  stdin?: () => Promise<string>;
  readInput?: (path: string) => Promise<string>;
  /** Injectable factory for init-keyring: for tests. */
  loaderFactory?: NativeAdapterLoader;
};

function io(opts: CliOptions) {
  return {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
}

function has(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
}

function isHelp(argv: readonly string[]): boolean {
  return argv[0] === "help" || has(argv, "--help") || has(argv, "-h");
}

function option(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  return argv[index + 1];
}

function positionals(argv: readonly string[]): string[] {
  const values: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]!;
    if (item.startsWith("-")) {
      if (!["--json", "--dry-run", "--enabled", "--disabled", "--unmask"].includes(item)) i += 1;
      continue;
    }
    values.push(item);
  }
  return values;
}

function jsonOrText(print: Writer, jsonMode: boolean, value: unknown, text: string): void {
  print(jsonMode ? JSON.stringify(value) : text);
}

function fail(opts: CliOptions, message: string, code = 1): void {
  const { printErr, exit } = io(opts);
  printErr(message);
  exit(code);
}

export async function runTheme(argv: readonly string[], opts: CliOptions = {}): Promise<void> {
  const { print } = io(opts);
  const [sub = "help"] = argv;
  if (sub === "list") {
    const caller = resolveThemeCaller(opts);
    const rows = await caller!.theme.listThemes();
    const compact = rows.map((row: { key: string; value: string; defaultValue: string }) => ({
      key: row.key,
      value: row.value,
      defaultValue: row.defaultValue,
    }));
    jsonOrText(print, has(argv, "--json"), compact, compact.map((row: { key: string; value: string }) => `${row.key}=${row.value}`).join("\n"));
    return;
  }

  if (sub === "set") {
    const key = option(argv, "--key");
    const value = option(argv, "--value");
    if (!key) return fail(opts, "fulcrum theme set: missing required option --key", 2);
    if (!value) return fail(opts, "fulcrum theme set: missing required option --value", 2);
    const caller = resolveThemeCaller(opts);
    const result = await caller!.theme.setTheme({ key, value });
    jsonOrText(print, has(argv, "--json"), result, `${result.key}=${result.value}`);
    return;
  }

  fail(opts, `fulcrum theme: unknown command '${sub}'`, 2);
}

function resolveThemeCaller(opts: CliOptions): Record<string, any> {
  if (opts.caller?.theme) return opts.caller;
  const apiCaller = createThemeSettingsApiCallerFromEnv(opts.env, opts.fetch);
  if (!apiCaller) {
    throw new Error(
      "Theme settings API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL plus FULCRUM_ORG_ID and FULCRUM_USER_ID.",
    );
  }
  return apiCaller;
}

export async function runI18n(argv: readonly string[], opts: CliOptions = {}): Promise<void> {
  const { print } = io(opts);
  const [sub = "help"] = argv;

  if (sub === "list") {
    jsonOrText(print, has(argv, "--json"), {
      locales: ["en", "fr", "ar"],
      defaultLocale: "en",
    }, "en\nfr\nar");
    return;
  }

  if (sub === "set") {
    const locale = normalizeLocale(option(argv, "--locale"));
    const payload = { locale, dir: dirForLocale(locale, true) };
    jsonOrText(print, has(argv, "--json"), payload, `${payload.locale} ${payload.dir}`);
    return;
  }

  fail(opts, `fulcrum i18n: unknown command '${sub}'`, 2);
}

export async function runSecrets(argv: readonly string[], opts: CliOptions = {}): Promise<void> {
  const { print } = io(opts);
  const [sub = "help"] = argv;
  if (isHelp(argv)) {
    print("fulcrum secrets\n\nUsage:\n  fulcrum secrets <set|get|rotate|init-keyring> [options]");
    return;
  }

  const args = positionals(argv.slice(1));
  const name = option(argv, "--name") ?? args[0];
  if (!name) return fail(opts, `fulcrum secrets ${sub}: missing required argument <name>`, 2);

  if (sub === "set") {
    const raw = option(argv, "--value") ??
      await (opts.stdin ?? (() => new Response(Bun.stdin.stream()).text()))();
    const result = await resolveCredentialCaller(opts).credentials.set({ name, value: raw.replace(/\r?\n$/, "") });
    print(JSON.stringify(result));
    return;
  }

  if (sub === "rotate") {
    const raw = option(argv, "--value") ??
      await (opts.stdin ?? (() => new Response(Bun.stdin.stream()).text()))();
    const value = raw.replace(/\r?\n$/, "");
    const result = await resolveCredentialCaller(opts).credentials.rotate({ name, value, newValue: value });
    print(JSON.stringify(result));
    return;
  }

  if (sub === "get") {
    if (has(argv, "--unmask")) return fail(opts, "fulcrum secrets get: --unmask requires interactive confirmation", 1);
    const result = await resolveCredentialCaller(opts).credentials.get({ name });
    print(JSON.stringify({
      name: result.name,
      masked_value: result.masked_value ?? "***",
      last_used_at: result.last_used_at ?? null,
    }));
    return;
  }

  fail(opts, `fulcrum secrets: unknown command '${sub}'`, 2);
}

function resolveCredentialCaller(opts: CliOptions): Record<string, any> {
  if (opts.caller?.credentials) return opts.caller;
  const apiCaller = createCredentialApiCallerFromEnv(opts.env, opts.fetch);
  if (!apiCaller) {
    throw new Error(
      "Credential API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL plus FULCRUM_ORG_ID and FULCRUM_USER_ID.",
    );
  }
  return apiCaller;
}

export async function runErrors(argv: readonly string[], opts: CliOptions = {}): Promise<void> {
  const { print } = io(opts);
  const [sub = "help"] = argv;
  if (sub === "list") {
    const sinceValue = option(argv, "--since");
    const rows = await resolveErrorLogCaller(opts).errorLogs.list({
      since: sinceValue ? new Date(`${sinceValue}T00:00:00.000Z`) : undefined,
    });
    jsonOrText(print, has(argv, "--json"), rows, rows.map((row: { id: string; errorMessage: string }) => `${row.id} ${row.errorMessage}`).join("\n"));
    return;
  }

  if (sub === "get") {
    const id = positionals(argv.slice(1))[0];
    if (!id) return fail(opts, "fulcrum errors get: missing required argument <id>", 2);
    const row = await resolveErrorLogCaller(opts).errorLogs.get({ id });
    jsonOrText(print, has(argv, "--json"), row, `${row.id} ${row.errorMessage}`);
    return;
  }

  if (sub === "purge") {
    const result = await resolveErrorLogCaller(opts).errorLogs.clear({});
    jsonOrText(print, has(argv, "--json"), result, `deleted=${result.deleted}`);
    return;
  }

  return fail(opts, `fulcrum errors: unknown command '${sub}'`, 2);
}

function resolveErrorLogCaller(opts: CliOptions): Record<string, any> {
  if (opts.caller?.errorLogs) return opts.caller;
  const apiCaller = createErrorLogApiCallerFromEnv(opts.env, opts.fetch);
  if (!apiCaller) {
    throw new Error(
      "Error log API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL plus FULCRUM_ORG_ID and FULCRUM_USER_ID.",
    );
  }
  return apiCaller;
}

export async function runBackup(argv: readonly string[], opts: CliOptions = {}): Promise<void> {
  const { print, printErr } = io(opts);
  const [sub] = argv;

  if (sub === "create") {
    const result = await resolveDataPortabilityCaller(opts).backup.create();
    jsonOrText(print, has(argv, "--json"), result, `Backup created ${result.path ?? ""}`.trim());
    return;
  }

  if (sub === "restore") {
    const dump = option(argv, "--dump");
    if (!dump) return fail(opts, "fulcrum backup restore: missing required option --dump", 2);
    const result = await resolveDataPortabilityCaller(opts).backup.restore({ dump, dryRun: has(argv, "--dry-run") });
    jsonOrText(print, has(argv, "--json"), result, `${result.collisions?.length ?? 0} collisions`);
    return;
  }

  if (sub === "verify") {
    const path = option(argv, "--path");
    if (!path) return fail(opts, "fulcrum backup verify: missing required option --path", 2);
    const result = opts.caller?.backup.verify
      ? await opts.caller.backup.verify({ path })
      : { path, ...await verifyBackupArchive(path) };
    jsonOrText(print, has(argv, "--json"), result, result.ok ? "Backup verified" : "Backup verification failed");
    return;
  }

  const output = option(argv, "--output");
  if (!output) return fail(opts, "fulcrum backup: missing required option --output", 2);
  const result = await resolveDataPortabilityCaller(opts).backup.create();
  const body = Buffer.from(result.dump, "base64").toString("utf8");
  await writeFile(output, body);
  printErr(`${Math.ceil(Buffer.byteLength(body) / 1024)} KB written`);
  jsonOrText(print, has(argv, "--json"), {
    manifest: { entity_counts: result.entityCounts },
    path: output,
  }, `Backup written to ${output}`);
}

export async function runRestore(argv: readonly string[], opts: CliOptions = {}): Promise<void> {
  const { print } = io(opts);
  const input = option(argv, "--input");
  if (!input) return fail(opts, "fulcrum restore: missing required option --input", 2);
  const dump = opts.readInput ? await opts.readInput(input) : await readFile(input, "utf8");
  const result = await resolveDataPortabilityCaller(opts).backup.restore({ dump, dryRun: has(argv, "--dry-run") });
  const payload = {
    collisions: result.collisions ?? [],
    entity_counts: result.entity_counts ?? result.entityCounts ?? {},
  };
  jsonOrText(print, has(argv, "--json"), payload, `${payload.collisions.length} collisions`);
}

function resolveDataPortabilityCaller(opts: CliOptions): Record<string, any> {
  if (opts.caller?.backup || opts.caller?.dataExport || opts.caller?.dataImport || opts.caller?.jsonImportExport) return opts.caller;
  const apiCaller = createDataPortabilityApiCallerFromEnv(opts.env, opts.fetch);
  if (!apiCaller) {
    throw new Error(
      "Data portability API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL plus FULCRUM_ORG_ID and FULCRUM_USER_ID.",
    );
  }
  return apiCaller;
}

export async function runTelemetry(argv: readonly string[], opts: CliOptions = {}): Promise<void> {
  const { print } = io(opts);
  const [sub = "help"] = argv;
  if (sub === "status") {
    const consentStore = createConsentStore(opts);
    const consent = consentStore.read();
    const remote = await tryRemoteStatus(opts);
    const summary = {
      consent: consent ?? null,
      consent_path: consentStore.filePath,
      remote,
    };
    jsonOrText(
      print,
      has(argv, "--json"),
      summary,
      consent
        ? `consent=${consent.optedIn ? "yes" : "no"} decided_at=${consent.decidedAt}`
        : `consent=undecided: run 'fulcrum telemetry opt-in' or 'fulcrum telemetry opt-out'`,
    );
    return;
  }

  if (sub === "opt-in") {
    const consent = createConsentStore(opts).write(true);
    const remote = await tryRemoteOptIn(opts);
    jsonOrText(print, has(argv, "--json"), { consent, remote }, "opted in");
    return;
  }

  if (sub === "opt-out") {
    const consent = createConsentStore(opts).write(false);
    const remote = await tryRemoteOptOut(opts);
    jsonOrText(print, has(argv, "--json"), { consent, remote }, "opted out");
    return;
  }

  if (sub === "purge") {
    const result = await resolveTelemetryCaller(opts).telemetry.purge({});
    jsonOrText(print, has(argv, "--json"), result, `deleted=${result.deleted}`);
    return;
  }

  fail(opts, `fulcrum telemetry: unknown command '${sub}'`, 2);
}

function createConsentStore(opts: CliOptions): TelemetryConsentStore {
  const overridePath = (opts.env as Record<string, string | undefined> | undefined)?.FULCRUM_TELEMETRY_CONSENT_PATH;
  return new TelemetryConsentStore(overridePath ? { filePath: overridePath } : {});
}

async function tryRemoteStatus(opts: CliOptions): Promise<Record<string, unknown> | null> {
  try {
    return await resolveTelemetryCaller(opts).telemetry.status({});
  } catch {
    return null;
  }
}

async function tryRemoteOptIn(opts: CliOptions): Promise<Record<string, unknown> | null> {
  try {
    return await resolveTelemetryCaller(opts).telemetry.optIn({});
  } catch {
    return null;
  }
}

async function tryRemoteOptOut(opts: CliOptions): Promise<Record<string, unknown> | null> {
  try {
    return await resolveTelemetryCaller(opts).telemetry.optOut({});
  } catch {
    return null;
  }
}

function resolveTelemetryCaller(opts: CliOptions): Record<string, any> {
  if (opts.caller?.telemetry) return opts.caller;
  const apiCaller = createTelemetryApiCallerFromEnv(opts.env, opts.fetch);
  if (!apiCaller) {
    throw new Error(
      "Telemetry API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL plus FULCRUM_ORG_ID and FULCRUM_USER_ID.",
    );
  }
  return apiCaller;
}

export async function runDataExport(argv: readonly string[], opts: CliOptions = {}): Promise<void> {
  const format = option(argv, "--format") ?? "json";
  const output = option(argv, "--output");
  if (!output) return fail(opts, "fulcrum export: missing required option --output", 2);

  if (format === "csv") {
    const flags = await resolveFeatureFlagCaller(opts).flags.list();
    const enabled = flags.some((flag: { name: string; enabled: boolean }) =>
      flag.name === "import-csv/export-csv" && flag.enabled,
    );
    if (!enabled) return fail(opts, "Feature import-csv/export-csv not enabled", 1);
  }

  const dataCaller = resolveDataPortabilityCaller(opts);
  const dataExport = dataCaller.dataExport ?? dataCaller.jsonImportExport;
  const result = await dataExport.create({
    pretty: true,
    outputPath: output,
    entity: option(argv, "--entity"),
    format,
  });
  await writeFile(output, result.json);
  jsonOrText(io(opts).print, has(argv, "--json"), {
    path: output,
    entityCounts: result.entityCounts,
    format,
  }, `Export written to ${output}`);
}

export async function runDataImport(argv: readonly string[], opts: CliOptions = {}): Promise<void> {
  const { print } = io(opts);
  const [sub = "help"] = argv;

  if (sub === "preflight") {
    const path = option(argv, "--path");
    if (!path) return fail(opts, "fulcrum data import preflight: missing required option --path", 2);
    const result = await resolveDataPortabilityCaller(opts).dataImport.preflight({ path });
    jsonOrText(print, has(argv, "--json"), result, `${Object.keys(result.counts ?? {}).length} entity kinds`);
    return;
  }

  if (sub === "run") {
    const importId = option(argv, "--import-id");
    if (!importId) return fail(opts, "fulcrum data import run: missing required option --import-id", 2);
    const result = await resolveDataPortabilityCaller(opts).dataImport.run({
      importId,
      dryRun: has(argv, "--dry-run"),
      onConflict: option(argv, "--on-conflict"),
    });
    jsonOrText(print, has(argv, "--json"), result, `imported=${result.imported} updated=${result.updated}`);
    return;
  }

  fail(opts, `fulcrum data import: unknown command '${sub}'`, 2);
}

function resolveFeatureFlagCaller(opts: CliOptions): Record<string, any> {
  if (opts.caller?.flags) return opts.caller;
  const apiCaller = createFeatureExperimentApiCallerFromEnv(opts.env, opts.fetch);
  if (!apiCaller) {
    throw new Error(
      "Feature flag API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL before exporting CSV.",
    );
  }
  return apiCaller;
}

/**
 * runSecretsInitKeyring: `fulcrum secrets init-keyring`
 *
 * Attempts to (re-)load the native OS keyring module. Prints diagnostic on
 * failure and exits with code 1. Never crashes the process on load error.
 *
 * Issue 21: recovery action after node-keytar install.
 */
export async function runSecretsInitKeyring(
  argv: readonly string[],
  opts: CliOptions = {},
): Promise<void> {
  const { print, printErr, exit } = io(opts);
  if (isHelp(argv)) {
    print("fulcrum secrets init-keyring\n\nUsage:\n  fulcrum secrets init-keyring");
    return;
  }

  const loader = opts.loaderFactory ?? productionAdapterFactory;

  let adapter: NativeKeyringAdapter | null = null;
  try {
    adapter = await loader();
  } catch (e) {
    adapter = null;
    printErr(
      `Native keyring load error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (adapter) {
    print("Native keyring loaded successfully. OS keyring is active.");
    return;
  }

  printErr(
    "Native keyring could not be loaded. Install node-keytar or @napi-rs/keyring and re-run `fulcrum secrets init-keyring`.",
  );
  exit(1);
}
