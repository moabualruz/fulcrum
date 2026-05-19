import { createSettingsApiCallerFromEnv } from "@platform-core/interface/http/settings-api-client.ts";
import {
  AI_ASSIST_DEFAULTS,
  flattenResolved,
  resolveAiAssistSettings,
  type AiAssistSettings,
} from "@platform-core/application/settings/ai-assist-resolver.ts";

const AI_ASSIST_ORG_KEY = "ai-assist.org" as const;
const AI_ASSIST_USER_PREFIX = "ai-assist.user." as const;

type SettingsCaller = {
  settings?: {
    list(): Promise<unknown[]>;
    get(input: { key: string }): Promise<unknown | null>;
    set(input: { key: string; value: string }): Promise<unknown>;
  };
};

export interface SettingsRunOptions {
  caller?: SettingsCaller;
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum settings

Usage:
  fulcrum settings list [--json]
  fulcrum settings get <key> [--json]
  fulcrum settings set <key> <value> [--json]
  fulcrum settings ai-assist get [--user <id>] [--json]
  fulcrum settings ai-assist set <key> <value> [--scope user|org] [--user <id>] [--json]
`;

export async function run(argv: readonly string[], opts: SettingsRunOptions = {}): Promise<void> {
  const io = ioFor(opts);
  const [verb = "help", ...rest] = argv;
  if (verb === "help" || verb === "--help" || verb === "-h") {
    io.print(HELP);
    return;
  }

  try {
    const caller = await resolveCaller(opts);
    const settings = caller.settings;
    if (!settings) throw new Error("settings caller is not configured");

    switch (verb) {
      case "list":
        if (!validateFlags(rest, new Set(["--json"]), io)) return;
        return printValue(await settings.list(), rest, io.print);
      case "get": {
        if (!validateFlags(rest, new Set(["--json"]), io)) return;
        const key = firstArg(rest);
        if (!key) return usage(io, "usage: fulcrum settings get <key>");
        const value = await settings.get({ key });
        if (value === null) {
          io.printErr(`setting not found: ${key}`);
          io.exit(1);
          return;
        }
        return printValue(value, rest, io.print);
      }
      case "set": {
        if (!validateFlags(rest, new Set(["--json"]), io)) return;
        const args = positionals(rest);
        const [key, value] = args;
        if (!key || value === undefined) return usage(io, "usage: fulcrum settings set <key> <value>");
        return printValue(await settings.set({ key, value }), rest, io.print);
      }
      case "ai-assist": {
        const [subVerb = "help", ...subRest] = rest;
        const subSettings = settings;
        const userFlag = flagValue(subRest, "--user");
        const userId = userFlag ?? opts.env?.["FULCRUM_USER_ID"] ?? process.env["FULCRUM_USER_ID"];
        const orgRaw = await subSettings.get({ key: AI_ASSIST_ORG_KEY }).catch(() => null);
        const userRaw = userId
          ? await subSettings.get({ key: `${AI_ASSIST_USER_PREFIX}${userId}` }).catch(() => null)
          : null;
        const resolved = resolveAiAssistSettings({
          org: parseStoredAiAssist(orgRaw),
          user: parseStoredAiAssist(userRaw),
        });
        if (subVerb === "get") {
          return printValue(resolved, subRest, io.print);
        }
        if (subVerb === "set") {
          const positional = positionals(subRest);
          const [key, value] = positional;
          if (!key || value === undefined) return usage(io, "usage: fulcrum settings ai-assist set <key> <value>");
          const scope = (flagValue(subRest, "--scope") as "user" | "org" | undefined) ?? "user";
          if (scope === "user" && !userId) return usage(io, "ai-assist set --scope user requires --user <id> or FULCRUM_USER_ID");
          const current = scope === "org" ? parseStoredAiAssist(orgRaw) : parseStoredAiAssist(userRaw);
          const next: AiAssistSettings = { ...AI_ASSIST_DEFAULTS, ...(current ?? {}), ...applyAssistField(key, value) };
          const storeKey = scope === "org" ? AI_ASSIST_ORG_KEY : `${AI_ASSIST_USER_PREFIX}${userId}`;
          await subSettings.set({ key: storeKey, value: JSON.stringify(next) });
          const updated = resolveAiAssistSettings({
            org: scope === "org" ? next : parseStoredAiAssist(orgRaw),
            user: scope === "user" ? next : parseStoredAiAssist(userRaw),
          });
          return printValue(flattenResolved(updated), subRest, io.print);
        }
        return usage(io, "usage: fulcrum settings ai-assist <get|set>");
      }
      default:
        io.printErr(`fulcrum settings: unknown verb '${verb}'`);
        io.exit(2);
    }
  } catch (error) {
    io.printErr(`fulcrum settings ${verb}: ${(error as Error).message}`);
    io.exit(1);
  }
}

async function resolveCaller(opts: SettingsRunOptions): Promise<SettingsCaller> {
  if (opts.caller) return opts.caller;
  const apiCaller = createSettingsApiCallerFromEnv(opts.env, opts.fetch);
  if (apiCaller) return apiCaller as SettingsCaller;
  throw new Error("Settings API caller is not configured");
}

function printValue(value: unknown, argv: readonly string[], print: (line: string) => void): void {
  print(argv.includes("--json") ? JSON.stringify(value) : formatValue(value));
}

function formatValue(value: unknown): string {
  if (typeof value === "object" && value !== null) return JSON.stringify(value, null, 2);
  return String(value);
}

function usage(io: Required<Pick<SettingsRunOptions, "printErr" | "exit">>, message: string): void {
  io.printErr(message);
  io.exit(2);
}

function positionals(argv: readonly string[]): string[] {
  return argv.filter((arg, index) => !arg.startsWith("-") && !argv[index - 1]?.startsWith("--"));
}

function firstArg(argv: readonly string[]): string | undefined {
  return positionals(argv)[0];
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === flag) return argv[i + 1];
    if (arg && arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
  }
  return undefined;
}

function parseStoredAiAssist(raw: unknown): Partial<AiAssistSettings> | null {
  if (!raw) return null;
  const candidate =
    typeof raw === "object" && raw && "value" in raw ? (raw as { value: unknown }).value : raw;
  if (!candidate) return null;
  if (typeof candidate === "object") return candidate as Partial<AiAssistSettings>;
  if (typeof candidate === "string") {
    try {
      return JSON.parse(candidate) as Partial<AiAssistSettings>;
    } catch {
      return null;
    }
  }
  return null;
}

function applyAssistField(key: string, value: string): Partial<AiAssistSettings> {
  switch (key) {
    case "checkpointMode":
      return { checkpointMode: value as AiAssistSettings["checkpointMode"] };
    case "retentionCount":
      return { retentionCount: Number.parseInt(value, 10) };
    case "retentionDays":
      return { retentionDays: Number.parseInt(value, 10) };
    case "eventsTransport":
      return { eventsTransport: value as AiAssistSettings["eventsTransport"] };
    default:
      throw new Error(`unknown ai-assist key '${key}'`);
  }
}

function ioFor(opts: SettingsRunOptions): Required<Pick<SettingsRunOptions, "print" | "printErr" | "exit">> {
  return {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
}

function validateFlags(argv: readonly string[], allowed: Set<string>, io: Required<Pick<SettingsRunOptions, "printErr" | "exit">>): boolean {
  for (const arg of argv) {
    if (arg.startsWith("--") && !allowed.has(arg)) {
      io.printErr(`unknown flag: ${arg}`);
      io.exit(2);
      return false;
    }
  }
  return true;
}
