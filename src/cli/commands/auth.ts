/**
 * fulcrum auth — authentication CLI subcommands.
 *
 * Commands:
 *   fulcrum auth whoami [--json]
 *   fulcrum auth invite <email> [--role owner|admin|member|guest] [--json]
 *   fulcrum auth login [--passkey | --password] [--non-interactive]
 *   fulcrum auth logout
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

type InviteRole = "owner" | "admin" | "member" | "guest";

export interface AuthRunOptions {
  /**
   * In-process tRPC caller. Accepts any object with an `auth` namespace
   * that exposes the required procedures (duck-typed for testability).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  caller?: {
    auth: {
      whoami: () => Promise<any>;
      invite?: (input: { email: string; role: InviteRole }) => Promise<any>;
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

const HELP = `fulcrum auth

Authentication commands.

Usage:
  fulcrum auth whoami [--json]
  fulcrum auth invite <email> [--role owner|admin|member|guest] [--json]
  fulcrum auth login [--passkey | --password] [--non-interactive]
  fulcrum auth logout

Options:
  --json            Output as machine-readable JSON.
  --non-interactive Skip interactive prompts (CI/scripting).
  -h, --help        Show this help.
`;

// ─────────────────────────────────────────────────────────────────────────────
// run — entry-point for `fulcrum auth <subcommand> [args]`
// ─────────────────────────────────────────────────────────────────────────────

export async function run(
  argv: readonly string[],
  opts: AuthRunOptions = {},
): Promise<void> {
  const { print = console.log, printErr = console.error, exit = process.exit } = opts;
  const [sub = "help", ...rest] = argv;

  switch (sub) {
    case "whoami":
      return runWhoami(rest, { ...opts, print, printErr, exit });

    case "login":
      return runLogin(rest, { ...opts, print, printErr, exit });

    case "logout":
      return runLogout(rest, { ...opts, print, printErr, exit });

    case "invite":
      return runInvite(rest, { ...opts, print, printErr, exit });

    case "help":
    case "--help":
    case "-h":
      print(HELP);
      return;

    default:
      printErr(`fulcrum auth: unknown command '${sub}'`);
      printErr(HELP);
      exit(2);
  }
}

async function runInvite(
  argv: readonly string[],
  opts: Required<Pick<AuthRunOptions, "print" | "printErr" | "exit">> & AuthRunOptions,
): Promise<void> {
  const { print, printErr, exit } = opts;
  const jsonMode = argv.includes("--json");
  const email = argv.find((arg) => !arg.startsWith("--") && arg !== "invite");
  const roleFlagIndex = argv.indexOf("--role");
  const role = roleFlagIndex >= 0 ? argv[roleFlagIndex + 1] : "member";

  if (!email) {
    printErr("fulcrum auth invite: missing required argument <email>");
    printErr("Usage: fulcrum auth invite <email> [--role owner|admin|member|guest] [--json]");
    exit(2);
    return;
  }

  if (!role || !isInviteRole(role)) {
    printErr(`fulcrum auth invite: invalid role '${role ?? ""}'`);
    exit(2);
    return;
  }

  const caller = await resolveCaller(opts);
  if (!caller.auth.invite) {
    printErr("fulcrum auth invite: auth.invite procedure unavailable.");
    exit(1);
    return;
  }

  try {
    const result = await caller.auth.invite({ email, role });
    if (jsonMode) {
      print(JSON.stringify(result));
    } else {
      print(`Invitation: ${result.invitationId}`);
      print(`Token:      ${result.token}`);
    }
  } catch (err) {
    const msg = err instanceof TRPCError
      ? `${err.code}: ${err.message}`
      : `Error: ${(err as Error).message}`;
    printErr(`fulcrum auth invite: ${msg}`);
    exit(1);
  }
}

function isInviteRole(value: string): value is InviteRole {
  return value === "owner" || value === "admin" || value === "member" || value === "guest";
}

// ─────────────────────────────────────────────────────────────────────────────
// whoami
// ─────────────────────────────────────────────────────────────────────────────

async function runWhoami(
  argv: readonly string[],
  opts: Required<Pick<AuthRunOptions, "print" | "printErr" | "exit">> & AuthRunOptions,
): Promise<void> {
  const { print, printErr, exit } = opts;
  const jsonMode = argv.includes("--json");

  const caller = await resolveCaller(opts);

  try {
    const result = await caller.auth.whoami();

    if (jsonMode) {
      print(JSON.stringify({ userId: result.userId, orgId: result.orgId, email: result.email, role: result.role }));
    } else {
      print(`User:  ${result.email ?? result.userId}`);
      print(`Org:   ${result.orgId}`);
      print(`Role:  ${result.role ?? "(unknown)"}`);
    }
  } catch (err) {
    const msg = err instanceof TRPCError
      ? `${err.code}: ${err.message}`
      : `Error: ${(err as Error).message}`;
    printErr(`fulcrum auth whoami: ${msg}`);
    exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// login (stub — interactive auth wired in later pillar)
// ─────────────────────────────────────────────────────────────────────────────

async function runLogin(
  argv: readonly string[],
  opts: Required<Pick<AuthRunOptions, "print" | "printErr" | "exit">> & AuthRunOptions,
): Promise<void> {
  const { printErr, exit } = opts;
  const nonInteractive = argv.includes("--non-interactive");

  if (nonInteractive) {
    printErr("login: --non-interactive mode not yet implemented.");
  } else {
    printErr("login: interactive login not yet implemented.");
  }
  exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// logout (stub — session invalidation wired in later pillar)
// ─────────────────────────────────────────────────────────────────────────────

async function runLogout(
  _argv: readonly string[],
  opts: Required<Pick<AuthRunOptions, "print" | "printErr" | "exit">> & AuthRunOptions,
): Promise<void> {
  const { printErr, exit } = opts;
  printErr("logout: session invalidation not yet implemented.");
  exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: resolve in-process tRPC caller
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveCaller(opts: AuthRunOptions): Promise<{
  auth: {
    whoami: () => Promise<any>;
    invite?: (input: { email: string; role: InviteRole }) => Promise<any>;
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
  return factory(ctx);
}
