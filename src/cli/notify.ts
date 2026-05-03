import {
  flagIso,
  flagNumber,
  flagString,
  hasFlag,
  parseArgs,
  printJson,
  requiredFlag,
} from "./arg-parser.ts";
import { callProcedure } from "./trpc-client.ts";

export interface NotifyClient {
  list(input: { unread?: boolean; limit?: number; offset?: number }): Promise<unknown[]>;
  read(id: string): Promise<unknown>;
  markRead(id: string): Promise<unknown>;
  markAllRead(): Promise<unknown>;
  mute(input: { subjectKind: string; subjectId: string; until?: string }): Promise<unknown>;
  unmute(input: { subjectKind: string; subjectId: string }): Promise<unknown>;
  rulesList(): Promise<unknown[]>;
  rulesGet(id: string): Promise<unknown>;
  rulesCreate(input: { name: string; pattern: Record<string, unknown>; channels: string[]; enabled?: boolean }): Promise<unknown>;
  rulesUpdate(input: { id: string; name?: string; pattern?: Record<string, unknown>; channels?: string[]; enabled?: boolean }): Promise<unknown>;
  rulesDelete(id: string): Promise<unknown>;
  channelsList(): Promise<unknown[]>;
  channelsConfig(input: { channel: string; url?: string; secret?: string }): Promise<unknown>;
  channelsTest(channel: string): Promise<unknown>;
}

interface RunOptions {
  client?: NotifyClient;
}

const HELP = `fulcrum notify

Usage:
  fulcrum notify list [--unread] [--limit <n>] [--offset <n>] [--json]
  fulcrum notify read <id> [--json]
  fulcrum notify mark-read <id>|--all [--json]
  fulcrum notify mute <subject-kind> <subject-id> [--until <ISO>] [--json]
  fulcrum notify unmute <subject-kind> <subject-id> [--json]
  fulcrum notify rules list|get|create|update|delete ...
  fulcrum notify channels list|config|test ...
`;

const BOOLEAN_FLAGS = new Set(["--json", "--unread", "--all", "--enable", "--disable"]);

function defaultClient(): NotifyClient {
  return {
    list: (input) => callProcedure("notify.list", input),
    read: (id) => callProcedure("notify.read", { id }),
    markRead: (id) => callProcedure("notify.markRead", { id }),
    markAllRead: () => callProcedure("notify.markAllRead", {}),
    mute: (input) => callProcedure("notify.mute", input),
    unmute: (input) => callProcedure("notify.unmute", input),
    rulesList: () => callProcedure("notify.rules.list", {}),
    rulesGet: (id) => callProcedure("notify.rules.get", { id }),
    rulesCreate: (input) => callProcedure("notify.rules.create", input),
    rulesUpdate: (input) => callProcedure("notify.rules.update", input),
    rulesDelete: (id) => callProcedure("notify.rules.delete", { id }),
    channelsList: () => callProcedure("notify.channels.list", {}),
    channelsConfig: (input) => callProcedure("notify.channels.config", input),
    channelsTest: (channel) => callProcedure("notify.channels.test", { channel }),
  };
}

export async function run(argv: readonly string[], options: RunOptions = {}): Promise<void> {
  const [verb, ...rest] = argv;
  if (!verb || verb === "help" || verb === "--help" || verb === "-h") {
    console.log(HELP);
    return;
  }
  const client = options.client ?? defaultClient();
  switch (verb) {
    case "list":
      return runList(rest, client);
    case "read":
      return runRead(rest, client);
    case "mark-read":
      return runMarkRead(rest, client);
    case "mute":
      return runMute(rest, client);
    case "unmute":
      return runUnmute(rest, client);
    case "rules":
      return runRules(rest, client);
    case "channels":
      return runChannels(rest, client);
    default:
      throw new Error(`unknown notify verb: ${verb}`);
  }
}

async function runList(argv: readonly string[], client: NotifyClient): Promise<void> {
  const parsed = parseArgs(argv, BOOLEAN_FLAGS);
  const result = await client.list({
    unread: hasFlag(parsed, "unread") || undefined,
    limit: flagNumber(parsed, "limit"),
    offset: flagNumber(parsed, "offset"),
  });
  if (hasFlag(parsed, "json")) printJson(result);
  else printRows(result);
}

async function runRead(argv: readonly string[], client: NotifyClient): Promise<void> {
  const parsed = parseArgs(argv, BOOLEAN_FLAGS);
  const id = parsed.positionals[0];
  if (!id) throw new Error("usage: fulcrum notify read <id>");
  printResult(await client.read(id), hasFlag(parsed, "json"));
}

async function runMarkRead(argv: readonly string[], client: NotifyClient): Promise<void> {
  const parsed = parseArgs(argv, BOOLEAN_FLAGS);
  const result = hasFlag(parsed, "all")
    ? await client.markAllRead()
    : await client.markRead(requiredPositional(parsed.positionals, "usage: fulcrum notify mark-read <id>|--all"));
  printResult(result, hasFlag(parsed, "json"));
}

async function runMute(argv: readonly string[], client: NotifyClient): Promise<void> {
  const parsed = parseArgs(argv, BOOLEAN_FLAGS);
  const [subjectKind, subjectId] = parsed.positionals;
  if (!subjectKind || !subjectId) throw new Error("usage: fulcrum notify mute <subject-kind> <subject-id>");
  const result = await client.mute({ subjectKind, subjectId, until: flagIso(parsed, "until") });
  printResult(result, hasFlag(parsed, "json"));
}

async function runUnmute(argv: readonly string[], client: NotifyClient): Promise<void> {
  const parsed = parseArgs(argv, BOOLEAN_FLAGS);
  const [subjectKind, subjectId] = parsed.positionals;
  if (!subjectKind || !subjectId) throw new Error("usage: fulcrum notify unmute <subject-kind> <subject-id>");
  printResult(await client.unmute({ subjectKind, subjectId }), hasFlag(parsed, "json"));
}

async function runRules(argv: readonly string[], client: NotifyClient): Promise<void> {
  const [sub, ...rest] = argv;
  const parsed = parseArgs(rest, BOOLEAN_FLAGS);
  switch (sub) {
    case "list":
      return printResult(await client.rulesList(), hasFlag(parsed, "json"));
    case "get":
      return printResult(await client.rulesGet(requiredPositional(parsed.positionals, "usage: fulcrum notify rules get <id>")), hasFlag(parsed, "json"));
    case "create":
      return printResult(await client.rulesCreate({
        name: requiredFlag(parsed, "name"),
        pattern: parsePattern(requiredFlag(parsed, "pattern")),
        channels: parseChannels(requiredFlag(parsed, "channels")),
        enabled: enabledFlag(parsed),
      }), hasFlag(parsed, "json"));
    case "update":
      return printResult(await client.rulesUpdate({
        id: requiredPositional(parsed.positionals, "usage: fulcrum notify rules update <id>"),
        name: flagString(parsed, "name"),
        pattern: flagString(parsed, "pattern") ? parsePattern(flagString(parsed, "pattern") as string) : undefined,
        channels: flagString(parsed, "channels") ? parseChannels(flagString(parsed, "channels") as string) : undefined,
        enabled: enabledFlag(parsed),
      }), hasFlag(parsed, "json"));
    case "delete":
      return printResult(await client.rulesDelete(requiredPositional(parsed.positionals, "usage: fulcrum notify rules delete <id>")), hasFlag(parsed, "json"));
    default:
      throw new Error(`unknown notify rules verb: ${sub ?? ""}`);
  }
}

async function runChannels(argv: readonly string[], client: NotifyClient): Promise<void> {
  const [sub, ...rest] = argv;
  const parsed = parseArgs(rest, BOOLEAN_FLAGS);
  switch (sub) {
    case "list":
      return printResult(await client.channelsList(), hasFlag(parsed, "json"));
    case "config": {
      const channel = requiredPositional(parsed.positionals, "usage: fulcrum notify channels config <channel>");
      const result = maskSecret(await client.channelsConfig({ channel, url: flagString(parsed, "url"), secret: flagString(parsed, "secret") }));
      return printResult(result, hasFlag(parsed, "json"));
    }
    case "test":
      return printResult(await client.channelsTest(requiredPositional(parsed.positionals, "usage: fulcrum notify channels test <channel>")), hasFlag(parsed, "json"));
    default:
      throw new Error(`unknown notify channels verb: ${sub ?? ""}`);
  }
}

function parsePattern(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("object required");
    return value as Record<string, unknown>;
  } catch {
    throw new Error("invalid --pattern JSON");
  }
}

function parseChannels(raw: string): string[] {
  return raw.split(",").map((value) => value.trim()).filter(Boolean);
}

function enabledFlag(parsed: ReturnType<typeof parseArgs>): boolean | undefined {
  if (hasFlag(parsed, "enable") && hasFlag(parsed, "disable")) throw new Error("use only one of --enable or --disable");
  if (hasFlag(parsed, "enable")) return true;
  if (hasFlag(parsed, "disable")) return false;
  return undefined;
}

function requiredPositional(positionals: readonly string[], usage: string): string {
  const value = positionals[0];
  if (!value) throw new Error(usage);
  return value;
}

function maskSecret(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = { ...(value as Record<string, unknown>) };
  if (record["secret"] !== undefined) record["secret"] = "********";
  return record;
}

function printResult(value: unknown, json: boolean): void {
  if (json) printJson(value);
  else if (Array.isArray(value)) printRows(value);
  else console.log(String((value as Record<string, unknown>)["id"] ?? JSON.stringify(value)));
}

function printRows(rows: unknown[]): void {
  for (const row of rows) console.log(JSON.stringify(row));
}
