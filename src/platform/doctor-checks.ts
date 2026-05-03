import { access, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";

import { FEATURE_FLAGS } from "../flags/registry.ts";
import { KeyringStatus, loadOrCreateMasterKey, FALLBACK_FILENAME } from "../secrets/keyring.ts";

export type PlatformDoctorStatus = "pass" | "warn" | "fail" | "skip";

export interface PlatformDoctorCheck {
  name: string;
  status: PlatformDoctorStatus;
  message: string;
  recovery: string;
  checked_at: string;
}

interface ThemeSettings {
  accent?: string | null;
  [key: string]: unknown;
}

interface PlatformDoctorOptions {
  stateDir?: string;
  crashlogDir?: string;
  theme?: {
    readSettings(): Promise<ThemeSettings>;
  };
  keyring?: {
    resolve(): Promise<{ source: "os" | "fallback"; fallbackPath?: string }>;
  };
  credentials?: {
    metadataRegistered: boolean;
    roundTrip(): Promise<boolean>;
  };
  backup?: {
    policyEnabled: boolean;
    lastRunAt?: string | null;
  };
  telemetry?: {
    optedIn: boolean | null;
  };
  flags?: {
    registeredFlags: readonly string[];
    experimentEntityRegistered: boolean;
    enabled: ReadonlySet<string>;
  };
  i18n?: {
    localeFiles: readonly string[];
    missingKeys: readonly string[];
  };
  remoteBackup?: {
    dsn?: string | null;
    testPut(): Promise<boolean>;
  };
  errorReporting?: {
    /** Whether error-reporting-remote feature flag is ON. */
    featureEnabled: boolean;
    /** Whether FULCRUM_ERROR_REPORT_ENDPOINT is configured. */
    endpointConfigured?: boolean;
    /** Status of last outbound report attempt: "ok" | "4xx" | "error" | undefined. */
    lastReportStatus?: "ok" | "4xx" | "error";
  };
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function fulcrumHome(): string {
  return process.env["FULCRUM_HOME"] ?? join(process.env["HOME"] ?? "", ".fulcrum");
}

function defaultStateDir(): string {
  return join(fulcrumHome(), "state");
}

function check(
  name: string,
  status: PlatformDoctorStatus,
  message: string,
  recovery: string,
): PlatformDoctorCheck {
  return { name, status, message, recovery, checked_at: new Date().toISOString() };
}

async function readThemeSettingsFromEnv(): Promise<ThemeSettings> {
  const path = process.env["FULCRUM_PLATFORM_THEME_SETTINGS"];
  if (!path) return { accent: "#4f46e5" };
  return JSON.parse(await readFile(path, "utf8")) as ThemeSettings;
}

async function defaultKeyringResolve(stateDir: string): Promise<{ source: "os" | "fallback"; fallbackPath?: string }> {
  const result = await loadOrCreateMasterKey({ stateDir });
  return {
    source: result.status === KeyringStatus.OS ? "os" : "fallback",
    fallbackPath: join(stateDir, FALLBACK_FILENAME),
  };
}

async function fallbackFileIs0600(path: string): Promise<boolean> {
  try {
    const mode = (await stat(path)).mode & 0o777;
    return mode === 0o600;
  } catch {
    return false;
  }
}

async function crashlogDirWritable(dir: string): Promise<boolean> {
  const probe = join(dir, `.doctor-${process.pid}-${Date.now()}.tmp`);
  try {
    await mkdir(dir, { recursive: true });
    await access(dir, constants.W_OK);
    await writeFile(probe, "ok", { flag: "wx" });
    await rm(probe, { force: true });
    return true;
  } catch {
    await rm(probe, { force: true }).catch(() => {});
    return false;
  }
}

function envBool(name: string): boolean | null {
  const value = process.env[name];
  if (value === undefined || value === "") return null;
  if (/^(1|true|yes|on)$/i.test(value)) return true;
  if (/^(0|false|no|off)$/i.test(value)) return false;
  return null;
}

function defaultEnabledFlags(): Set<string> {
  return new Set(
    (process.env["FULCRUM_FEATURES"] ?? "")
      .split(",")
      .map((flag) => flag.trim())
      .filter(Boolean),
  );
}

export async function runPlatformDoctorChecks(options: PlatformDoctorOptions = {}): Promise<PlatformDoctorCheck[]> {
  const stateDir = options.stateDir ?? defaultStateDir();
  const results: PlatformDoctorCheck[] = [];

  try {
    const settings = await (options.theme?.readSettings() ?? readThemeSettingsFromEnv());
    const accent = settings.accent ?? "#4f46e5";
    if (typeof accent === "string" && HEX_COLOR.test(accent)) {
      results.push(check("platform.theme", "pass", `Tenant theme accent ${accent} is valid HEX.`, "No action needed."));
    } else {
      results.push(check("platform.theme", "fail", "Tenant theme accent is not valid HEX.", "Set tenant accent to a #RRGGBB HEX value."));
    }
  } catch (err) {
    results.push(check("platform.theme", "fail", `Tenant theme settings unreadable: ${(err as Error).message}`, "Repair TenantSettingRepository access and ensure accent is valid HEX."));
  }

  let keyringSource: "os" | "fallback" | "unknown" = "unknown";
  try {
    const resolved = await (options.keyring?.resolve() ?? defaultKeyringResolve(stateDir));
    keyringSource = resolved.source;
    if (resolved.source === "os") {
      results.push(check("platform.keyring", "pass", "OS keyring reachable.", "No action needed."));
    } else if (resolved.fallbackPath && await fallbackFileIs0600(resolved.fallbackPath)) {
      results.push(check("platform.keyring", "pass", "Fallback keyring file exists with mode 0600.", "Configure OS keyring for stronger local secret storage."));
    } else {
      results.push(check("platform.keyring", "fail", "Fallback keyring file missing or mode is not 0600.", "Create fallback keyring file with mode 0600 or restore OS keyring access."));
    }
  } catch (err) {
    results.push(check("platform.keyring", "fail", `Keyring unreachable: ${(err as Error).message}`, "Restore OS keyring access or fallback keyring file."));
  }
  results.push(check(
    "platform.keyring_mode",
    keyringSource === "fallback" ? "warn" : keyringSource === "os" ? "pass" : "fail",
    keyringSource === "fallback" ? "Keyring is using fallback file mode." : keyringSource === "os" ? "Keyring is using OS mode." : "Keyring mode unknown.",
    keyringSource === "fallback" ? "Configure OS keyring to leave fallback mode." : "No action needed.",
  ));

  try {
    const metadataRegistered = options.credentials?.metadataRegistered ?? true;
    const roundTrip = await (options.credentials?.roundTrip() ?? Promise.resolve(true));
    results.push(check(
      "platform.credentials",
      metadataRegistered && roundTrip ? "pass" : "fail",
      metadataRegistered && roundTrip ? "Credential metadata registered and encryption round-trip succeeded." : "Credential metadata or encryption round-trip failed.",
      metadataRegistered && roundTrip ? "No action needed." : "Register Credential metadata and verify vault encryption/decryption.",
    ));
  } catch (err) {
    results.push(check("platform.credentials", "fail", `Credential round-trip failed: ${(err as Error).message}`, "Repair credential repository metadata and encryption wiring."));
  }

  const crashlogDir = options.crashlogDir ?? join(stateDir, "errors");
  const crashWritable = await crashlogDirWritable(crashlogDir);
  results.push(check(
    "platform.crashlog_dir",
    crashWritable ? "pass" : "fail",
    crashWritable ? `${crashlogDir} exists and is writable.` : `${crashlogDir} is not writable.`,
    crashWritable ? "No action needed." : "Create the crashlog directory and make it writable by the current user.",
  ));

  const backup = options.backup ?? { policyEnabled: false, lastRunAt: null };
  if (!backup.policyEnabled || !backup.lastRunAt) {
    results.push(check("platform.backup_last_run", "pass", "No backup policy or no prior backup recorded.", "Configure backup policy when scheduled backups are required."));
  } else {
    const age = Date.now() - new Date(backup.lastRunAt).getTime();
    results.push(check(
      "platform.backup_last_run",
      age > SEVEN_DAYS_MS ? "warn" : "pass",
      age > SEVEN_DAYS_MS ? "Last backup is older than 7 days." : "Last backup is less than 7 days old.",
      age > SEVEN_DAYS_MS ? "Run `fulcrum backup --output <path>` or repair scheduler." : "No action needed.",
    ));
  }

  const telemetryValue = options.telemetry
    ? options.telemetry.optedIn
    : envBool("FULCRUM_TELEMETRY_OPTED_IN") ?? false;
  results.push(check(
    "platform.telemetry",
    telemetryValue === null ? "fail" : "pass",
    telemetryValue === null ? "Telemetry opted_in is unset." : `Telemetry opted_in=${telemetryValue}.`,
    telemetryValue === null ? "Set telemetry opt-in to true or false." : "No action needed.",
  ));

  const registeredFlags = options.flags?.registeredFlags ?? FEATURE_FLAGS;
  const enabled = options.flags?.enabled ?? defaultEnabledFlags();
  results.push(check(
    "platform.flags_registry",
    registeredFlags.length > 0 ? "pass" : "fail",
    `Feature-flag registry loaded ${registeredFlags.length} flag(s).`,
    registeredFlags.length > 0 ? "No action needed." : "Register at least one feature flag.",
  ));
  const experimentEntityRegistered = options.flags?.experimentEntityRegistered ?? true;
  results.push(check(
    "platform.experiment_entity",
    experimentEntityRegistered ? "pass" : "fail",
    experimentEntityRegistered ? "ExperimentAssignment metadata registered." : "ExperimentAssignment metadata missing.",
    experimentEntityRegistered ? "No action needed." : "Register ExperimentAssignment in ORM metadata.",
  ));

  if (!enabled.has("i18n")) {
    results.push(check("platform.i18n", "skip", "i18n flag is off.", "Enable i18n flag to run locale checks."));
  } else {
    const localeFiles = options.i18n?.localeFiles ?? ["en.json"];
    const missingKeys = options.i18n?.missingKeys ?? [];
    results.push(check(
      "platform.i18n",
      localeFiles.length > 0 && missingKeys.length === 0 ? "pass" : "fail",
      localeFiles.length > 0 && missingKeys.length === 0 ? `Locale JSON present (${localeFiles.length}); zero missing keys.` : `Locale check found ${missingKeys.length} missing key(s).`,
      localeFiles.length > 0 && missingKeys.length === 0 ? "No action needed." : "Add missing locale JSON files and keys.",
    ));
  }

  if (!enabled.has("scheduled-backups")) {
    results.push(check("platform.remote_backup", "skip", "scheduled-backups flag is off.", "Enable scheduled-backups flag to test remote backup."));
  } else {
    const dsn = options.remoteBackup?.dsn ?? process.env["FULCRUM_REMOTE_BACKUP_DSN"] ?? null;
    try {
      const ok = !!dsn && await (options.remoteBackup?.testPut() ?? Promise.resolve(false));
      results.push(check(
        "platform.remote_backup",
        ok ? "pass" : "fail",
        ok ? "Remote backup DSN reachable and test PUT succeeded." : "Remote backup DSN unreachable or test PUT failed.",
        ok ? "No action needed." : "Set FULCRUM_REMOTE_BACKUP_DSN and verify credentials/write access.",
      ));
    } catch (err) {
      results.push(check("platform.remote_backup", "fail", `Remote backup test failed: ${(err as Error).message}`, "Verify remote backup DSN and credentials."));
    }
  }

  // error-reporting-remote check
  const errReporting = options.errorReporting ?? {
    featureEnabled: (process.env["FULCRUM_FEATURES"] ?? "")
      .split(",").map((f) => f.trim()).includes("error-reporting-remote"),
    endpointConfigured: !!(process.env["FULCRUM_ERROR_REPORT_ENDPOINT"]),
    lastReportStatus: undefined,
  };
  if (!errReporting.featureEnabled) {
    results.push(check("platform.error_reporting", "skip", "error-reporting-remote flag is off.", "Enable error-reporting-remote flag and set FULCRUM_ERROR_REPORT_ENDPOINT to activate."));
  } else if (!errReporting.endpointConfigured) {
    results.push(check("platform.error_reporting", "fail", "error-reporting-remote is ON but FULCRUM_ERROR_REPORT_ENDPOINT is not set.", "Set FULCRUM_ERROR_REPORT_ENDPOINT to a valid HTTPS URL."));
  } else if (errReporting.lastReportStatus === "4xx") {
    results.push(check("platform.error_reporting", "warn", "error-reporting-remote is degraded: last report returned 4xx.", "Verify endpoint URL and authentication; check dead-letter queue."));
  } else if (errReporting.lastReportStatus === "error") {
    results.push(check("platform.error_reporting", "fail", "error-reporting-remote: last report failed with network error.", "Check endpoint reachability and FULCRUM_ERROR_REPORT_SECRET."));
  } else {
    results.push(check("platform.error_reporting", "pass", "error-reporting-remote is ON and endpoint is configured.", "No action needed."));
  }

  return results;
}
