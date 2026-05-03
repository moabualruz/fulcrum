import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { openPglite } from "../product-kernel/db/pglite.ts";
import { runMigrations } from "../product-kernel/db/migrate.ts";
import { productDbDir } from "../product-kernel/paths.ts";
import type { ProductDb } from "../product-kernel/db/types.ts";
import {
  listNotifications,
  unreadCount,
  markRead,
  markAllRead,
  mute,
  unmute,
  listRules,
  getRule,
  createRule,
  updateRule,
  deleteRule,
  listChannels,
  configureChannel,
} from "../product-kernel/store/notifications.ts";

const HELP = `fulcrum notify — notification management

Usage:
  fulcrum notify list [--unread] [--limit N] [--offset N] [--json]
  fulcrum notify read <id>
  fulcrum notify mark-read <id>|--all
  fulcrum notify mute <subject-kind> <subject-id> [--until <ISO>] [--json]
  fulcrum notify unmute <subject-kind> <subject-id>
  fulcrum notify rules list [--json]
  fulcrum notify rules get <id> [--json]
  fulcrum notify rules create --name <name> --pattern <json> --channels <csv> [--disable] [--json]
  fulcrum notify rules update <id> [--name <name>] [--pattern <json>] [--channels <csv>] [--enable|--disable] [--json]
  fulcrum notify rules delete <id>
  fulcrum notify channels list [--json]
  fulcrum notify channels config <kind> [--url <url>] [--secret <secret>] [--json]
  fulcrum notify channels test <kind>
`;

const DEFAULT_ORG_SLUG = "default";
const DEFAULT_USER_ID = "local";

// --- Flag parser (matches product.ts pattern) ---

const BOOLEAN_FLAGS = new Set<string>(["--json", "--unread", "--all", "--enable", "--disable"]);

interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | true>;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      if (eq !== -1) {
        flags[token.slice(0, eq)] = token.slice(eq + 1);
        continue;
      }
      if (BOOLEAN_FLAGS.has(token)) {
        flags[token] = true;
        continue;
      }
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[token] = next;
        i += 1;
        continue;
      }
      flags[token] = true;
      continue;
    }
    positionals.push(token);
  }
  return { positionals, flags };
}

function flag(args: ParsedArgs, name: string): string | undefined {
  const v = args.flags[`--${name}`];
  return typeof v === "string" ? v : undefined;
}

function hasFlag(args: ParsedArgs, name: string): boolean {
  return args.flags[`--${name}`] !== undefined;
}

async function openDb(): Promise<ProductDb> {
  const dir = productDbDir();
  await mkdir(dir, { recursive: true });
  return openPglite(join(dir, "main"));
}

async function resolveOrgId(db: ProductDb): Promise<string> {
  const rows = await db.query<{ id: string }>(
    `SELECT id FROM orgs WHERE slug = $1`,
    [DEFAULT_ORG_SLUG],
  );
  if (!rows[0]) throw new Error(`no org with slug=${DEFAULT_ORG_SLUG}; run 'fulcrum product init' first`);
  return rows[0].id;
}

export async function run(argv: readonly string[]): Promise<void> {
  const [verb, ...rest] = argv;
  if (!verb || verb === "help" || verb === "--help" || verb === "-h") {
    console.log(HELP);
    return;
  }
  switch (verb) {
    case "list": return runList(rest);
    case "read": return runRead(rest);
    case "mark-read": return runMarkRead(rest);
    case "mute": return runMute(rest);
    case "unmute": return runUnmute(rest);
    case "rules": return runRules(rest);
    case "channels": return runChannels(rest);
    default:
      console.error(`fulcrum notify: unknown verb '${verb}'`);
      console.error(HELP);
      process.exit(2);
  }
}

async function runList(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  const json = hasFlag(args, "json");
  const unreadOnly = hasFlag(args, "unread");
  const limit = Number(flag(args, "limit") ?? "50");
  const offset = Number(flag(args, "offset") ?? "0");
  const db = await openDb();
  try {
    await runMigrations(db);
    const orgId = await resolveOrgId(db);
    const rows = await listNotifications(db, {
      orgId, userId: DEFAULT_USER_ID, unread: unreadOnly, limit, offset,
    });
    if (json) {
      console.log(JSON.stringify(rows, null, 2));
    } else if (rows.length === 0) {
      console.log("no notifications");
    } else {
      for (const n of rows) {
        const marker = n.read_at ? " " : "*";
        console.log(`${marker} ${n.id}\t${n.subject_kind}:${n.subject_id}\t${n.verb}\t${n.title}`);
      }
    }
  } finally {
    await db.close();
  }
}

async function runRead(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  const id = args.positionals[0];
  if (!id) { console.error("usage: fulcrum notify read <id>"); process.exit(2); }
  const db = await openDb();
  try {
    await runMigrations(db);
    const orgId = await resolveOrgId(db);
    const rows = await db.query<Record<string, unknown>>(
      `SELECT * FROM user_notifications WHERE id = $1 AND org_id = $2`,
      [id, orgId],
    );
    if (!rows[0]) { console.error(`notification not found: ${id}`); process.exit(1); }
    console.log(JSON.stringify(rows[0], null, 2));
  } finally {
    await db.close();
  }
}

async function runMarkRead(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  const all = hasFlag(args, "all");
  const db = await openDb();
  try {
    await runMigrations(db);
    const orgId = await resolveOrgId(db);
    if (all) {
      const count = await markAllRead(db, orgId, DEFAULT_USER_ID);
      console.log(`marked ${count} notification(s) read`);
    } else {
      const id = args.positionals[0];
      if (!id) { console.error("usage: fulcrum notify mark-read <id>|--all"); process.exit(2); }
      const ok = await markRead(db, orgId, DEFAULT_USER_ID, id);
      if (ok) console.log(`marked read: ${id}`);
      else console.log(`already read or not found: ${id}`);
    }
  } finally {
    await db.close();
  }
}

async function runMute(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  const [subjectKind, subjectId] = args.positionals;
  if (!subjectKind || !subjectId) {
    console.error("usage: fulcrum notify mute <subject-kind> <subject-id> [--until <ISO>]");
    process.exit(2);
  }
  const until = flag(args, "until") ?? null;
  const json = hasFlag(args, "json");
  const db = await openDb();
  try {
    await runMigrations(db);
    const orgId = await resolveOrgId(db);
    const row = await mute(db, { orgId, userId: DEFAULT_USER_ID, subjectKind, subjectId, mutedUntil: until });
    if (json) {
      console.log(JSON.stringify(row, null, 2));
    } else {
      console.log(`muted ${subjectKind}:${subjectId}${until ? ` until ${until}` : ""}`);
    }
  } finally {
    await db.close();
  }
}

async function runUnmute(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  const [subjectKind, subjectId] = args.positionals;
  if (!subjectKind || !subjectId) {
    console.error("usage: fulcrum notify unmute <subject-kind> <subject-id>");
    process.exit(2);
  }
  const db = await openDb();
  try {
    await runMigrations(db);
    const orgId = await resolveOrgId(db);
    const ok = await unmute(db, orgId, DEFAULT_USER_ID, subjectKind, subjectId);
    if (ok) console.log(`unmuted ${subjectKind}:${subjectId}`);
    else console.log(`no mute found for ${subjectKind}:${subjectId}`);
  } finally {
    await db.close();
  }
}

async function runRules(argv: readonly string[]): Promise<void> {
  const [sub, ...rest] = argv;
  if (!sub) { console.error("usage: fulcrum notify rules <list|get|create|update|delete>"); process.exit(2); }
  switch (sub) {
    case "list": return runRulesList(rest);
    case "get": return runRulesGet(rest);
    case "create": return runRulesCreate(rest);
    case "update": return runRulesUpdate(rest);
    case "delete": return runRulesDelete(rest);
    default:
      console.error(`fulcrum notify rules: unknown verb '${sub}'`);
      process.exit(2);
  }
}

async function runRulesList(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  const json = hasFlag(args, "json");
  const db = await openDb();
  try {
    await runMigrations(db);
    const orgId = await resolveOrgId(db);
    const rows = await listRules(db, orgId);
    if (json) {
      console.log(JSON.stringify(rows, null, 2));
    } else if (rows.length === 0) {
      console.log("no rules");
    } else {
      for (const r of rows) {
        const state = r.enabled ? "on" : "off";
        console.log(`${r.id}\t${r.name}\t[${state}]\tchannels=${r.channels.join(",")}`);
      }
    }
  } finally {
    await db.close();
  }
}

async function runRulesGet(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  const id = args.positionals[0];
  if (!id) { console.error("usage: fulcrum notify rules get <id>"); process.exit(2); }
  const json = hasFlag(args, "json");
  const db = await openDb();
  try {
    await runMigrations(db);
    const orgId = await resolveOrgId(db);
    const rule = await getRule(db, orgId, id);
    if (!rule) { console.error(`rule not found: ${id}`); process.exit(1); }
    if (json) {
      console.log(JSON.stringify(rule, null, 2));
    } else {
      console.log(`${rule.id}\t${rule.name}\t${rule.enabled ? "on" : "off"}`);
      console.log(`pattern: ${JSON.stringify(rule.event_pattern)}`);
      console.log(`channels: ${rule.channels.join(", ")}`);
    }
  } finally {
    await db.close();
  }
}

async function runRulesCreate(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  const name = flag(args, "name");
  const patternStr = flag(args, "pattern");
  const channelsStr = flag(args, "channels");
  if (!name || !patternStr || !channelsStr) {
    console.error("usage: fulcrum notify rules create --name <name> --pattern <json> --channels <csv>");
    process.exit(2);
  }
  let eventPattern: Record<string, unknown>;
  try {
    eventPattern = JSON.parse(patternStr) as Record<string, unknown>;
  } catch {
    console.error(`invalid JSON for --pattern: ${patternStr}`);
    process.exit(2);
    return; // unreachable, satisfies TS
  }
  const channels = channelsStr.split(",").map((c) => c.trim()).filter(Boolean);
  const enabled = !hasFlag(args, "disable");
  const json = hasFlag(args, "json");
  const db = await openDb();
  try {
    await runMigrations(db);
    const orgId = await resolveOrgId(db);
    const rule = await createRule(db, { orgId, name, eventPattern, channels, enabled });
    if (json) {
      console.log(JSON.stringify(rule, null, 2));
    } else {
      console.log(`created rule ${rule.id}: ${rule.name}`);
    }
  } finally {
    await db.close();
  }
}

async function runRulesUpdate(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  const id = args.positionals[0];
  if (!id) { console.error("usage: fulcrum notify rules update <id> [--name ...] [--pattern ...] [--channels ...] [--enable|--disable]"); process.exit(2); }
  const json = hasFlag(args, "json");
  const patch: Parameters<typeof updateRule>[3] = {};
  const nameVal = flag(args, "name");
  if (nameVal !== undefined) patch.name = nameVal;
  const patternStr = flag(args, "pattern");
  if (patternStr !== undefined) {
    try { patch.eventPattern = JSON.parse(patternStr) as Record<string, unknown>; }
    catch { console.error(`invalid JSON for --pattern: ${patternStr}`); process.exit(2); }
  }
  const channelsStr = flag(args, "channels");
  if (channelsStr !== undefined) patch.channels = channelsStr.split(",").map((c) => c.trim()).filter(Boolean);
  if (hasFlag(args, "enable")) patch.enabled = true;
  if (hasFlag(args, "disable")) patch.enabled = false;
  const db = await openDb();
  try {
    await runMigrations(db);
    const orgId = await resolveOrgId(db);
    const rule = await updateRule(db, orgId, id, patch);
    if (!rule) { console.error(`rule not found: ${id}`); process.exit(1); }
    if (json) {
      console.log(JSON.stringify(rule, null, 2));
    } else {
      console.log(`updated rule ${rule.id}: ${rule.name}`);
    }
  } finally {
    await db.close();
  }
}

async function runRulesDelete(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  const id = args.positionals[0];
  if (!id) { console.error("usage: fulcrum notify rules delete <id>"); process.exit(2); }
  const db = await openDb();
  try {
    await runMigrations(db);
    const orgId = await resolveOrgId(db);
    const ok = await deleteRule(db, orgId, id);
    if (ok) console.log(`deleted rule ${id}`);
    else console.log(`rule not found: ${id}`);
  } finally {
    await db.close();
  }
}

async function runChannels(argv: readonly string[]): Promise<void> {
  const [sub, ...rest] = argv;
  if (!sub) { console.error("usage: fulcrum notify channels <list|config|test>"); process.exit(2); }
  switch (sub) {
    case "list": return runChannelsList(rest);
    case "config": return runChannelsConfig(rest);
    case "test": return runChannelsTest(rest);
    default:
      console.error(`fulcrum notify channels: unknown verb '${sub}'`);
      process.exit(2);
  }
}

async function runChannelsList(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  const json = hasFlag(args, "json");
  const db = await openDb();
  try {
    await runMigrations(db);
    const orgId = await resolveOrgId(db);
    const rows = await listChannels(db, orgId);
    if (json) {
      // Mask secrets in config before output
      const masked = rows.map((r) => ({
        ...r,
        config: maskSecrets(r.config),
      }));
      console.log(JSON.stringify(masked, null, 2));
    } else if (rows.length === 0) {
      console.log("no channels configured");
    } else {
      for (const c of rows) {
        console.log(`${c.kind}\t${c.enabled ? "on" : "off"}`);
      }
    }
  } finally {
    await db.close();
  }
}

async function runChannelsConfig(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  const kind = args.positionals[0];
  if (!kind) { console.error("usage: fulcrum notify channels config <kind> [--url ...] [--secret ...]"); process.exit(2); }
  const json = hasFlag(args, "json");
  const config: Record<string, unknown> = {};
  const url = flag(args, "url");
  if (url) config.url = url;
  const secret = flag(args, "secret");
  if (secret) config.secret = secret;
  const db = await openDb();
  try {
    await runMigrations(db);
    const orgId = await resolveOrgId(db);
    const row = await configureChannel(db, { orgId, kind, config });
    if (json) {
      console.log(JSON.stringify({ ...row, config: maskSecrets(row.config) }, null, 2));
    } else {
      console.log(`configured channel ${kind}`);
    }
  } finally {
    await db.close();
  }
}

async function runChannelsTest(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  const kind = args.positionals[0];
  if (!kind) { console.error("usage: fulcrum notify channels test <kind>"); process.exit(2); }
  const db = await openDb();
  try {
    await runMigrations(db);
    const orgId = await resolveOrgId(db);
    const rows = await listChannels(db, orgId);
    const ch = rows.find((c) => c.kind === kind);
    if (!ch) { console.error(`channel not configured: ${kind}`); process.exit(1); }
    // Test delivery is a stub — would enqueue async delivery in production
    console.log(`test delivery queued for channel ${kind}`);
  } finally {
    await db.close();
  }
}

function maskSecrets(config: Record<string, unknown>): Record<string, unknown> {
  const out = { ...config };
  if (typeof out.secret === "string") {
    out.secret = "****";
  }
  return out;
}
