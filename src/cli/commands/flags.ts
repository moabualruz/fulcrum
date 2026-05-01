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
      set: (input: { flag: string; enabled: boolean }) => Promise<{ ok: boolean }>;
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

  // Filter out --json so positional args are clean
  const positional = argv.filter((a) => !a.startsWith("-"));
  const jsonMode = argv.includes("--json");

  const [flagName, valueStr] = positional;

  if (!flagName) {
    printErr("fulcrum flags set: missing required argument <flag>");
    printErr("Usage: fulcrum flags set <flag> <on|off>");
    exit(1);
    return;
  }

  if (!valueStr) {
    printErr(`fulcrum flags set: missing required argument <on|off> for flag '${flagName}'`);
    printErr("Usage: fulcrum flags set <flag> <on|off>");
    exit(1);
    return;
  }

  if (valueStr !== "on" && valueStr !== "off") {
    printErr(`fulcrum flags set: invalid value '${valueStr}' — must be 'on' or 'off'`);
    exit(1);
    return;
  }

  const enabled = valueStr === "on";
  const caller = await resolveCaller(opts);

  try {
    const result = await caller.flags.set({ flag: flagName, enabled });

    if (jsonMode) {
      print(JSON.stringify({ flag: flagName, enabled, ok: result.ok }));
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
    set: (input: { flag: string; enabled: boolean }) => Promise<{ ok: boolean }>;
  };
}> {
  if (opts.caller) return opts.caller;

  // Production path: build caller from needle-di container + tRPC router
  const { t } = await import("../../trpc/trpc.ts");
  const { appRouter } = await import("../../trpc/router.ts");
  const { createContext } = await import("../../trpc/context.ts");

  const container = opts.container ?? null;
  const ctx = createContext({ session: null, orgId: null, userId: null, em: null, container });
  const factory = t.createCallerFactory(appRouter);
  // Cast: caller's flags.set input is narrowed to FeatureFlagName union by tRPC; our
  // interface uses string for duck-typed testability. Runtime validation is unchanged.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return factory(ctx) as any;
}
