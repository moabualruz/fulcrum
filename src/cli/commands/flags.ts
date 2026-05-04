/**
 * fulcrum flags — feature-flag CLI subcommands.
 *
 * Commands:
 *   fulcrum flags list [--json]
 *   fulcrum flags set <flag> <on|off> [--json]
 *
 * All commands accept a `--json` flag: outputs machine-readable JSON to stdout.
 * Non-JSON outputs human-readable text. Exit 0 on success; non-zero on error.
 *
 * The `run` function accepts an optional `opts` parameter for dependency injection
 * in tests (fake caller, print/printErr/exit callbacks). Production wiring
 * builds the caller from the shared needle-di Container.
 *
 * C4: CLI surface at feature parity with Web surface.
 * C8: needle-di Container resolves services; tRPC caller is in-process (no HTTP).
 */

import { TRPCError } from "@trpc/server";
import { Container } from "@needle-di/core";
import { MikroORM, type EntityManager } from "@mikro-orm/postgresql";
import type { Session as BetterAuthSession } from "better-auth";
import {
  ENTITY_MANAGER_TOKEN,
  registerDbBindings,
} from "../../db/db.module.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface FlagItem {
  name: string;
  enabled: boolean;
  description: string;
}

export interface FlagsRunOptions {
  /**
   * In-process tRPC caller. Accepts any object with a `flags` namespace
   * that exposes list() and set() procedures (duck-typed for testability).
   */
  caller?: {
    flags: {
      list: () => Promise<FlagItem[]>;
      set: (input: { flag: string; enabled: boolean; rolloutPercent?: number }) => Promise<unknown>;
    };
  };

  /** needle-di Container — used to build caller when `caller` not provided. */
  container?: import("@needle-di/core").Container | null;

  /** stdout writer (default: console.log). */
  print?: (line: string) => void;

  /** stderr writer (default: console.error). */
  printErr?: (line: string) => void;

  /** process.exit shim (default: process.exit). */
  exit?: (code: number) => void;
}

const HELP = `fulcrum flags

Feature-flag management commands.

Usage:
  fulcrum flags list [--json]
  fulcrum flags set <flag> <on|off> [--json]

Options:
  --json      Output as machine-readable JSON.
  -h, --help  Show this help.
`;

// ─────────────────────────────────────────────────────────────────────────────
// run — entry-point for `fulcrum flags <subcommand> [args]`
// ─────────────────────────────────────────────────────────────────────────────

export async function run(
  argv: readonly string[],
  opts: FlagsRunOptions = {},
): Promise<void> {
  const { print = console.log, printErr = console.error, exit = process.exit } = opts;
  const [sub = "help", ...rest] = argv;

  switch (sub) {
    case "list":
      return runList(rest, { ...opts, print, printErr, exit });

    case "set":
      return runSet(rest, { ...opts, print, printErr, exit });

    case "help":
    case "--help":
    case "-h":
      print(HELP);
      return;

    default:
      printErr(`fulcrum flags: unknown command '${sub}'`);
      printErr(HELP);
      exit(2);
  }
}

export const runFlags = run;

// ─────────────────────────────────────────────────────────────────────────────
// list
// ─────────────────────────────────────────────────────────────────────────────

async function runList(
  argv: readonly string[],
  opts: Required<Pick<FlagsRunOptions, "print" | "printErr" | "exit">> & FlagsRunOptions,
): Promise<void> {
  const { print, printErr, exit } = opts;
  const jsonMode = argv.includes("--json");

  const caller = await resolveCaller(opts);

  try {
    const flags = await caller.flags.list();

    if (jsonMode) {
      print(JSON.stringify(flags));
    } else {
      // Pretty-print table: name (padded), enabled, description
      const nameWidth = Math.max(...flags.map((f) => f.name.length), 4);
      print(`${"NAME".padEnd(nameWidth)}  ENABLED  DESCRIPTION`);
      print(`${"─".repeat(nameWidth)}  ───────  ─────────────────────────────────────`);
      for (const f of flags) {
        const enabledStr = f.enabled ? "true   " : "false  ";
        print(`${f.name.padEnd(nameWidth)}  ${enabledStr}  ${f.description}`);
      }
    }
  } catch (err) {
    const msg = err instanceof TRPCError
      ? `${err.code}: ${err.message}`
      : `Error: ${(err as Error).message}`;
    printErr(`fulcrum flags list: ${msg}`);
    exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// set
// ─────────────────────────────────────────────────────────────────────────────

async function runSet(
  argv: readonly string[],
  opts: Required<Pick<FlagsRunOptions, "print" | "printErr" | "exit">> & FlagsRunOptions,
): Promise<void> {
  const { print, printErr, exit } = opts;

  const unknownFlag = argv.find((arg) =>
    arg.startsWith("-") && !["--json", "--enabled", "--disabled", "--rollout-percent"].includes(arg)
  );
  if (unknownFlag) {
    printErr(`fulcrum flags set: unknown flag '${unknownFlag}'`);
    exit(2);
    return;
  }

  const positional: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "--rollout-percent") {
      i += 1;
      continue;
    }
    if (!arg.startsWith("-")) positional.push(arg);
  }
  const jsonMode = argv.includes("--json");

  const [flagName, valueStr] = positional;

  if (!flagName) {
    printErr("fulcrum flags set: missing required argument <flag>");
    printErr("Usage: fulcrum flags set <flag> <on|off>");
    exit(1);
    return;
  }

  const usesBooleanFlags = argv.includes("--enabled") || argv.includes("--disabled");
  if (!valueStr && !usesBooleanFlags) {
    printErr(`fulcrum flags set: missing required argument <on|off> for flag '${flagName}'`);
    printErr("Usage: fulcrum flags set <flag> <on|off>");
    exit(1);
    return;
  }

  if (valueStr && valueStr !== "on" && valueStr !== "off") {
    printErr(`fulcrum flags set: invalid value '${valueStr}' — must be 'on' or 'off'`);
    exit(1);
    return;
  }

  const rolloutValue = argv[argv.indexOf("--rollout-percent") + 1];
  const rolloutPercent = argv.includes("--rollout-percent") ? Number(rolloutValue) : undefined;
  if (rolloutPercent !== undefined && (!Number.isInteger(rolloutPercent) || rolloutPercent < 0 || rolloutPercent > 100)) {
    printErr("fulcrum flags set: --rollout-percent must be an integer from 0 to 100");
    exit(1);
    return;
  }

  const enabled = usesBooleanFlags ? argv.includes("--enabled") : valueStr === "on";
  const caller = await resolveCaller(opts);

  try {
    const result = await caller.flags.set({ flag: flagName, enabled, rolloutPercent });

    if (jsonMode) {
      const objectResult = result && typeof result === "object" ? result as Record<string, unknown> : {};
      print(JSON.stringify({
        name: objectResult.name ?? flagName,
        enabled: objectResult.enabled ?? enabled,
        rollout_percent: objectResult.rollout_percent ?? rolloutPercent,
      }));
    } else {
      print(`Flag '${flagName}' set to ${enabled ? "on" : "off"}.`);
    }
  } catch (err) {
    const msg = err instanceof TRPCError
      ? `${err.code}: ${err.message}`
      : `Error: ${(err as Error).message}`;
    printErr(`fulcrum flags set: ${msg}`);
    exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: resolve in-process tRPC caller
// ─────────────────────────────────────────────────────────────────────────────

async function resolveCaller(opts: FlagsRunOptions): Promise<{
  flags: {
    list: () => Promise<FlagItem[]>;
    set: (input: { flag: string; enabled: boolean; rolloutPercent?: number }) => Promise<unknown>;
  };
}> {
  if (opts.caller) return opts.caller;

  // Production path: build caller from needle-di container + tRPC router
  const { t } = await import("../../trpc/trpc.ts");
  const { appRouter } = await import("../../trpc/router.ts");
  const { createContext } = await import("../../trpc/context.ts");

  const cliContext = buildCliContext(opts.container ?? null);
  const { container, em } = cliContext;
  const session = await resolveActiveCliSession(em);
  if (!session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "No active CLI session found. Run `fulcrum init` or `fulcrum auth login` before feature flag commands.",
    });
  }

  const orgId = session.activeOrganizationId ?? session.orgId;
  const userId = session.userId;
  if (!orgId || !userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Active CLI session is missing orgId or userId. Re-authenticate.",
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
  // Cast: caller's flags.set input is narrowed to FeatureFlagName union by tRPC; our
  // interface uses string for duck-typed testability. Runtime validation is unchanged.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return factory(ctx) as any;
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
