/**
 * fulcrum skills — CLI subcommands backed by tRPC skills.* procedures.
 *
 * Commands:
 *   fulcrum skills list [--json]
 *   fulcrum skills install <path> [--json]
 *   fulcrum skills upgrade <slug|all> [--json]
 *   fulcrum skills uninstall <slug> [--json]
 *   fulcrum skills sync [--fetch-upstream] [--install-cron] [--daily] [--json]
 *   fulcrum skills conflicts list [--json]
 *   fulcrum skills conflicts resolve <slug> --keep <local|upstream|editor> [--json]
 *
 * All commands accept `--json`: machine-readable JSON to stdout matching tRPC
 * schema identically to Web API responses.
 *
 * P5#17 — CLI fulcrum skills * commands + daily cron install (gated).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { platform } from "node:os";
import { TRPCError } from "@trpc/server";
import { Container } from "@needle-di/core";
import { MikroORM, type EntityManager } from "@mikro-orm/postgresql";
import type { Session as BetterAuthSession } from "better-auth";
import {
  ENTITY_MANAGER_TOKEN,
  registerDbBindings,
} from "../../db/db.module.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkillOutput {
  id: string;
  name: string;
  slug: string;
  source: string;
  upstreamRepo: string | null;
  upstreamRef: string | null;
  enabledAgents: string[];
}

interface SyncResult {
  merged: string[];
  conflicts: string[];
  errors: string[];
}

export interface SkillsCaller {
  list: () => Promise<SkillOutput[]>;
  install: (input: { path: string }) => Promise<SkillOutput>;
  upgrade: (input: { slug: string }) => Promise<SkillOutput[]>;
  uninstall: (input: { slug: string }) => Promise<void>;
  sync: (input: { fetchUpstream: boolean }) => Promise<SyncResult>;
  resolveConflict: (input: { slug: string; resolution: "local" | "upstream" | "editor" }) => Promise<SkillOutput>;
}

export interface SkillsRunOptions {
  caller?: SkillsCaller;
  container?: Container | null;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
  /** Override home for cron file writes (testing). */
  cronHome?: string;
}

// ---------------------------------------------------------------------------
// Feature gate
// ---------------------------------------------------------------------------

function isFeatureEnabled(feature: string): boolean {
  const features = process.env["FULCRUM_FEATURES"] ?? "";
  return features.split(",").some((f) => f.trim() === feature);
}

// ---------------------------------------------------------------------------
// run — entry-point
// ---------------------------------------------------------------------------

export async function run(
  argv: readonly string[],
  opts: SkillsRunOptions = {},
): Promise<void> {
  const { print = console.log, printErr = console.error, exit = process.exit } = opts;
  const [sub = "help", ...rest] = argv;

  switch (sub) {
    case "list":
      return runList(rest, { ...opts, print, printErr, exit });
    case "install":
      return runInstall(rest, { ...opts, print, printErr, exit });
    case "upgrade":
      return runUpgrade(rest, { ...opts, print, printErr, exit });
    case "uninstall":
      return runUninstall(rest, { ...opts, print, printErr, exit });
    case "sync":
      return runSync(rest, { ...opts, print, printErr, exit });
    case "conflicts":
      return runConflicts(rest, { ...opts, print, printErr, exit });
    case "help":
    case "--help":
    case "-h":
      print(HELP);
      return;
    default:
      printErr(`fulcrum skills: unknown command '${sub}'`);
      printErr(HELP);
      exit(2);
  }
}

const HELP = `fulcrum skills

Skill management commands (tRPC-backed).

Usage:
  fulcrum skills list [--json]
  fulcrum skills install <path> [--json]
  fulcrum skills upgrade <slug|all> [--json]
  fulcrum skills uninstall <slug> [--json]
  fulcrum skills sync [--fetch-upstream] [--install-cron] [--json]
  fulcrum skills conflicts list [--json]
  fulcrum skills conflicts resolve <slug> --keep <local|upstream|editor> [--json]

Options:
  --json            Output as machine-readable JSON.
  --fetch-upstream  Fetch upstream skill updates during sync.
  --install-cron    Install daily sync cron entry (requires FULCRUM_FEATURES=skills-daily-sync).
  -h, --help        Show this help.
`;

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

async function runList(
  argv: readonly string[],
  opts: Required<Pick<SkillsRunOptions, "print" | "printErr" | "exit">> & SkillsRunOptions,
): Promise<void> {
  const { print, printErr, exit } = opts;
  const jsonMode = argv.includes("--json");
  const caller = await resolveCaller(opts);

  try {
    const skills = await caller.list();
    if (jsonMode) {
      print(JSON.stringify(skills));
    } else {
      if (skills.length === 0) {
        print("No skills installed.");
        return;
      }
      const nameWidth = Math.max(4, ...skills.map((s) => s.slug.length));
      print(`${"SLUG".padEnd(nameWidth)}  SOURCE    AGENTS`);
      print(`${"─".repeat(nameWidth)}  ────────  ──────`);
      for (const s of skills) {
        print(`${s.slug.padEnd(nameWidth)}  ${s.source.padEnd(8)}  ${s.enabledAgents.join(", ")}`);
      }
    }
  } catch (err) {
    handleError("fulcrum skills list", err, printErr, exit);
  }
}

// ---------------------------------------------------------------------------
// install
// ---------------------------------------------------------------------------

async function runInstall(
  argv: readonly string[],
  opts: Required<Pick<SkillsRunOptions, "print" | "printErr" | "exit">> & SkillsRunOptions,
): Promise<void> {
  const { print, printErr, exit } = opts;
  const jsonMode = argv.includes("--json");
  const positional = argv.filter((a) => !a.startsWith("-"));
  const path = positional[0];

  if (!path) {
    printErr("fulcrum skills install: missing required argument <path>");
    printErr("Usage: fulcrum skills install <path> [--json]");
    exit(1);
    return;
  }

  const caller = await resolveCaller(opts);
  try {
    const skill = await caller.install({ path });
    if (jsonMode) {
      print(JSON.stringify(skill));
    } else {
      print(`Installed skill '${skill.slug}' for agents: ${skill.enabledAgents.join(", ")}`);
    }
  } catch (err) {
    handleError("fulcrum skills install", err, printErr, exit);
  }
}

// ---------------------------------------------------------------------------
// upgrade
// ---------------------------------------------------------------------------

async function runUpgrade(
  argv: readonly string[],
  opts: Required<Pick<SkillsRunOptions, "print" | "printErr" | "exit">> & SkillsRunOptions,
): Promise<void> {
  const { print, printErr, exit } = opts;
  const jsonMode = argv.includes("--json");
  const positional = argv.filter((a) => !a.startsWith("-"));
  const slug = positional[0];

  if (!slug) {
    printErr("fulcrum skills upgrade: missing required argument <slug|all>");
    printErr("Usage: fulcrum skills upgrade <slug|all> [--json]");
    exit(1);
    return;
  }

  const caller = await resolveCaller(opts);
  try {
    const skills = await caller.upgrade({ slug });
    if (jsonMode) {
      print(JSON.stringify(skills));
    } else {
      print(`Upgraded ${skills.length} skill(s): ${skills.map((s) => s.slug).join(", ")}`);
    }
  } catch (err) {
    handleError("fulcrum skills upgrade", err, printErr, exit);
  }
}

// ---------------------------------------------------------------------------
// uninstall
// ---------------------------------------------------------------------------

async function runUninstall(
  argv: readonly string[],
  opts: Required<Pick<SkillsRunOptions, "print" | "printErr" | "exit">> & SkillsRunOptions,
): Promise<void> {
  const { print, printErr, exit } = opts;
  const positional = argv.filter((a) => !a.startsWith("-"));
  const slug = positional[0];

  if (!slug) {
    printErr("fulcrum skills uninstall: missing required argument <slug>");
    printErr("Usage: fulcrum skills uninstall <slug> [--json]");
    exit(1);
    return;
  }

  const caller = await resolveCaller(opts);
  try {
    await caller.uninstall({ slug });
    if (argv.includes("--json")) {
      print(JSON.stringify({ ok: true, slug }));
    } else {
      print(`Uninstalled skill '${slug}'.`);
    }
  } catch (err) {
    handleError("fulcrum skills uninstall", err, printErr, exit);
  }
}

// ---------------------------------------------------------------------------
// sync
// ---------------------------------------------------------------------------

async function runSync(
  argv: readonly string[],
  opts: Required<Pick<SkillsRunOptions, "print" | "printErr" | "exit">> & SkillsRunOptions,
): Promise<void> {
  const { print, printErr, exit } = opts;
  const jsonMode = argv.includes("--json");
  const fetchUpstream = argv.includes("--fetch-upstream");
  const installCron = argv.includes("--install-cron");

  // Gate --install-cron behind feature flag
  if (installCron) {
    if (!isFeatureEnabled("skills-daily-sync")) {
      printErr("fulcrum skills sync: --install-cron requires FULCRUM_FEATURES=skills-daily-sync");
      exit(1);
      return;
    }
    await writeCronEntry(opts);
    if (jsonMode) {
      print(JSON.stringify({ cronInstalled: true }));
    } else {
      print("Daily sync cron entry installed.");
    }
    return;
  }

  const caller = await resolveCaller(opts);
  try {
    const result = await caller.sync({ fetchUpstream });
    if (jsonMode) {
      print(JSON.stringify(result));
    } else {
      print(`Sync complete: ${result.merged.length} merged, ${result.conflicts.length} conflicts, ${result.errors.length} errors.`);
      if (result.conflicts.length > 0) {
        print(`Conflicts: ${result.conflicts.join(", ")}`);
      }
      if (result.errors.length > 0) {
        print(`Errors: ${result.errors.join(", ")}`);
      }
    }
  } catch (err) {
    handleError("fulcrum skills sync", err, printErr, exit);
  }
}

// ---------------------------------------------------------------------------
// conflicts
// ---------------------------------------------------------------------------

async function runConflicts(
  argv: readonly string[],
  opts: Required<Pick<SkillsRunOptions, "print" | "printErr" | "exit">> & SkillsRunOptions,
): Promise<void> {
  const { print, printErr, exit } = opts;
  const [sub, ...rest] = argv;

  switch (sub) {
    case "list":
      return runConflictsList(rest, opts);
    case "resolve":
      return runConflictsResolve(rest, opts);
    default:
      printErr("Usage: fulcrum skills conflicts <list|resolve>");
      exit(2);
  }
}

async function runConflictsList(
  argv: readonly string[],
  opts: Required<Pick<SkillsRunOptions, "print" | "printErr" | "exit">> & SkillsRunOptions,
): Promise<void> {
  const { print } = opts;
  const jsonMode = argv.includes("--json");

  // Read conflicts from lock file (same source as existing cmdConflicts)
  const { readSkillsLockFile } = await import("../../skills/lock.ts");
  const lock = await readSkillsLockFile();
  const conflicts = Object.entries(lock)
    .filter(([, entry]) => entry.upstream_conflict)
    .map(([slug]) => slug)
    .sort();

  if (jsonMode) {
    print(JSON.stringify(conflicts));
  } else {
    if (conflicts.length === 0) {
      print("No pending conflicts.");
    } else {
      for (const slug of conflicts) print(slug);
    }
  }
}

async function runConflictsResolve(
  argv: readonly string[],
  opts: Required<Pick<SkillsRunOptions, "print" | "printErr" | "exit">> & SkillsRunOptions,
): Promise<void> {
  const { print, printErr, exit } = opts;
  const jsonMode = argv.includes("--json");

  const positional = argv.filter((a) => !a.startsWith("-"));
  const slug = positional[0];

  if (!slug) {
    printErr("fulcrum skills conflicts resolve: missing required argument <slug>");
    printErr("Usage: fulcrum skills conflicts resolve <slug> --keep <local|upstream|editor> [--json]");
    exit(1);
    return;
  }

  const keepIdx = argv.indexOf("--keep");
  const keepValue = keepIdx >= 0 ? argv[keepIdx + 1] : undefined;
  if (!keepValue || !["local", "upstream", "editor"].includes(keepValue)) {
    printErr("fulcrum skills conflicts resolve: --keep must be local, upstream, or editor");
    exit(1);
    return;
  }

  const caller = await resolveCaller(opts);
  try {
    const skill = await caller.resolveConflict({
      slug,
      resolution: keepValue as "local" | "upstream" | "editor",
    });
    if (jsonMode) {
      print(JSON.stringify(skill));
    } else {
      print(`Resolved conflict for '${slug}': kept ${keepValue}.`);
    }
  } catch (err) {
    handleError("fulcrum skills conflicts resolve", err, printErr, exit);
  }
}

// ---------------------------------------------------------------------------
// Cron entry (gated behind skills-daily-sync feature flag)
// ---------------------------------------------------------------------------

const PLIST_LABEL = "com.fulcrum.skills-sync";
const PLIST_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>fulcrum</string>
    <string>skills</string>
    <string>sync</string>
    <string>--fetch-upstream</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>9</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/tmp/fulcrum-skills-sync.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/fulcrum-skills-sync.log</string>
</dict>
</plist>
`;

const CRON_LINE = "0 9 * * * fulcrum skills sync --fetch-upstream";

async function writeCronEntry(opts: SkillsRunOptions): Promise<void> {
  const home = opts.cronHome ?? process.env["HOME"] ?? "";
  const isMac = platform() === "darwin";

  if (isMac) {
    const plistDir = join(home, "Library", "LaunchAgents");
    const plistPath = join(plistDir, `${PLIST_LABEL}.plist`);

    // Idempotent: check if already present
    try {
      const existing = await readFile(plistPath, "utf8");
      if (existing.includes(PLIST_LABEL)) return;
    } catch { /* not present — write it */ }

    await mkdir(plistDir, { recursive: true });
    await writeFile(plistPath, PLIST_TEMPLATE, "utf8");
  } else {
    // Linux: write to ~/.config/cron/fulcrum-skills-sync
    const cronDir = join(home, ".config", "cron");
    const cronPath = join(cronDir, "fulcrum-skills-sync");

    // Idempotent: check if already present
    try {
      const existing = await readFile(cronPath, "utf8");
      if (existing.includes("fulcrum skills sync")) return;
    } catch { /* not present — write it */ }

    await mkdir(cronDir, { recursive: true });
    await writeFile(cronPath, `${CRON_LINE}\n`, "utf8");
  }
}

// ---------------------------------------------------------------------------
// Helper: resolve in-process tRPC caller
// ---------------------------------------------------------------------------

async function resolveCaller(opts: SkillsRunOptions): Promise<SkillsCaller> {
  if (opts.caller) return opts.caller;

  const { t } = await import("../../trpc/trpc.ts");
  const { appRouter } = await import("../../trpc/router.ts");
  const { createContext } = await import("../../trpc/context.ts");

  const cliContext = buildCliContext(opts.container ?? null);
  const { container, em } = cliContext;
  const session = await resolveActiveCliSession(em);
  if (!session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "No active CLI session. Run `fulcrum init` or `fulcrum auth login` first.",
    });
  }

  const orgId = session.activeOrganizationId ?? session.orgId;
  const userId = session.userId;
  if (!orgId || !userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Active CLI session missing orgId or userId. Re-authenticate.",
    });
  }

  const ctx = createContext({
    session: session as unknown as BetterAuthSession,
    orgId,
    userId,
    em,
    container,
  });
  const factory = t.createCallerFactory(appRouter);
  const caller = factory(ctx);
  return {
    list: () => caller.fulcrum_skills.list(),
    install: (input) => caller.fulcrum_skills.install(input),
    upgrade: (input) => caller.fulcrum_skills.upgrade(input),
    uninstall: (input) => caller.fulcrum_skills.uninstall(input),
    sync: (input) => caller.fulcrum_skills.sync(input),
    resolveConflict: (input) => caller.fulcrum_skills.resolveConflict(input),
  };
}

function buildCliContext(container: Container | null): { container: Container | null; em: EntityManager | null } {
  if (!container) return { container: null, em: null };

  try {
    const orm = container.get(MikroORM);
    const em = container.get(ENTITY_MANAGER_TOKEN).fork();
    const requestContainer = new Container();
    requestContainer.bind({ provide: MikroORM, useValue: orm });
    registerDbBindings(requestContainer, orm, em);
    return { container: requestContainer, em };
  } catch {
    return { container, em: null };
  }
}

async function resolveActiveCliSession(em: EntityManager | null): Promise<{
  id: string;
  token: string;
  userId: string;
  orgId: string;
  activeOrganizationId: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
} | null> {
  if (!em) return null;

  const { Session } = await import("../../db/entities/auth/Session.ts");
  const now = new Date();

  try {
    const session = await em.findOne(
      Session,
      { expiresAt: { $gt: now } },
      { orderBy: { createdAt: "DESC" } },
    );
    if (!session) return null;

    return {
      id: session.id,
      token: session.id,
      userId: session.userId,
      orgId: session.orgId,
      activeOrganizationId: session.activeOrganizationId ?? session.orgId,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt,
      updatedAt: session.createdAt,
      ipAddress: session.ipAddress ?? null,
      userAgent: session.userAgent ?? "fulcrum-cli",
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

function handleError(
  prefix: string,
  err: unknown,
  printErr: (line: string) => void,
  exit: (code: number) => void,
): void {
  const msg = err instanceof TRPCError
    ? `${err.code}: ${err.message}`
    : `Error: ${(err as Error).message}`;
  printErr(`${prefix}: ${msg}`);
  exit(1);
}
