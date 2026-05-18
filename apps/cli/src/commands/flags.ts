import { formatCommandError } from "../api-errors.ts";
import {
  createFeatureExperimentApiCallerFromEnv,
  type FeatureExperimentApiEnvironment,
} from "@feature-flags/interface/http/feature-experiment-api-client.ts";

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
 * The `run` function accepts an optional `opts` parameter for dependency injection in tests.
 * Production wiring uses the configured public API client.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface FlagItem {
  name: string;
  enabled: boolean;
  description?: string;
}

interface RawFlagItem {
  name?: string;
  flag?: string;
  enabled: boolean;
  description?: string;
  source?: string;
}

type FlagsCaller = {
  flags: {
    list: () => Promise<RawFlagItem[]>;
    set: (input: { flag: string; enabled: boolean; rolloutPercent?: number }) => Promise<unknown>;
  };
};

export interface FlagsRunOptions {
  caller?: FlagsCaller;

  env?: FeatureExperimentApiEnvironment;

  fetch?: typeof fetch;

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
    const flags = (await caller.flags.list()).map(normalizeFlagItem);

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
    const msg = formatCommandError(err);
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
    const msg = formatCommandError(err);
    printErr(`fulcrum flags set: ${msg}`);
    exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: resolve public API caller
// ─────────────────────────────────────────────────────────────────────────────

function resolveCaller(opts: FlagsRunOptions): FlagsCaller {
  if (opts.caller) return opts.caller;

  const apiCaller = createFeatureExperimentApiCallerFromEnv(opts.env, opts.fetch);
  if (!apiCaller) {
    throw new Error("Feature flag API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL.");
  }
  return apiCaller as unknown as FlagsCaller;
}

function normalizeFlagItem(flag: RawFlagItem): FlagItem {
  return {
    name: flag.name ?? flag.flag ?? "unknown",
    enabled: flag.enabled,
    description: flag.description ?? flag.source ?? "",
  };
}
