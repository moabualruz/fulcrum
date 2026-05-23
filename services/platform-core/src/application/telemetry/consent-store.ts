import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface TelemetryConsent {
  optedIn: boolean;
  decidedAt: string;
  scope: readonly string[];
}

export interface ConsentStoreOptions {
  homeDir?: string;
  filePath?: string;
  now?: () => Date;
  reader?: (path: string) => string;
  writer?: (path: string, content: string) => void;
}

export const TELEMETRY_SCOPE = Object.freeze([
  "command_usage_counts",
  "render_durations_ms",
  "anonymized_error_codes",
]) as readonly string[];

const SETTINGS_FILENAME = "settings.json";
const SETTINGS_DIRNAME = ".fulcrum";

export class TelemetryConsentStore {
  private readonly path: string;
  private readonly now: () => Date;
  private readonly reader: (path: string) => string;
  private readonly writer: (path: string, content: string) => void;

  constructor(options: ConsentStoreOptions = {}) {
    this.path = options.filePath ?? defaultPath(options.homeDir);
    this.now = options.now ?? (() => new Date());
    this.reader = options.reader ?? defaultReader;
    this.writer = options.writer ?? defaultWriter;
  }

  get filePath(): string {
    return this.path;
  }

  read(): TelemetryConsent | null {
    let content: string;
    try {
      content = this.reader(this.path);
    } catch {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(content) as unknown;
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    const telemetry = record["telemetry"];
    if (!telemetry || typeof telemetry !== "object") return null;
    const consent = telemetry as Record<string, unknown>;
    if (typeof consent["optedIn"] !== "boolean" || typeof consent["decidedAt"] !== "string") return null;
    return {
      optedIn: consent["optedIn"],
      decidedAt: consent["decidedAt"],
      scope: Array.isArray(consent["scope"])
        ? (consent["scope"] as unknown[]).filter((entry): entry is string => typeof entry === "string")
        : TELEMETRY_SCOPE,
    };
  }

  write(optedIn: boolean): TelemetryConsent {
    const existing = (() => {
      try {
        return JSON.parse(this.reader(this.path)) as Record<string, unknown>;
      } catch {
        return {} as Record<string, unknown>;
      }
    })();
    const consent: TelemetryConsent = {
      optedIn,
      decidedAt: this.now().toISOString(),
      scope: TELEMETRY_SCOPE,
    };
    const next = { ...existing, telemetry: consent };
    this.writer(this.path, `${JSON.stringify(next, null, 2)}\n`);
    return consent;
  }

  hasDecided(): boolean {
    return this.read() !== null;
  }
}

function defaultPath(homeDir?: string): string {
  const base = homeDir ?? process.env["FULCRUM_HOME"] ?? join(homedir(), SETTINGS_DIRNAME);
  if (homeDir) return join(homeDir, SETTINGS_FILENAME);
  if (process.env["FULCRUM_HOME"]) return join(process.env["FULCRUM_HOME"]!, SETTINGS_FILENAME);
  return join(base, SETTINGS_FILENAME);
}

function defaultReader(path: string): string {
  return readFileSync(path, "utf8");
}

function defaultWriter(path: string, content: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}
