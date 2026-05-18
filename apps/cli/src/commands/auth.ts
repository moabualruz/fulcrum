import { formatCommandError } from "../api-errors.ts";
import {
  createAuthApiCallerFromEnv,
  type AuthApiEnvironment,
} from "@identity-access/interface/http/auth-api-client.ts";

type InviteRole = "owner" | "admin" | "member" | "guest";

export interface AuthRunOptions {
  caller?: {
    auth: {
      whoami: () => Promise<any>;
      invite?: (input: { email: string; role: InviteRole }) => Promise<any>;
    };
  };
  env?: AuthApiEnvironment;
  fetch?: typeof fetch;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
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

  try {
    const caller = await resolveCaller(opts);
    if (!caller.auth.invite) {
      printErr("fulcrum auth invite: auth invite operation is not available.");
      exit(1);
      return;
    }

    const result = await caller.auth.invite({ email, role });
    if (jsonMode) {
      print(JSON.stringify(result));
    } else {
      print(`Invitation: ${result.invitationId}`);
      print(`Token:      ${result.token}`);
    }
  } catch (err) {
    const msg = formatCommandError(err);
    printErr(`fulcrum auth invite: ${msg}`);
    exit(1);
  }
}

function isInviteRole(value: string): value is InviteRole {
  return value === "owner" || value === "admin" || value === "member" || value === "guest";
}

async function runWhoami(
  argv: readonly string[],
  opts: Required<Pick<AuthRunOptions, "print" | "printErr" | "exit">> & AuthRunOptions,
): Promise<void> {
  const { print, printErr, exit } = opts;
  const jsonMode = argv.includes("--json");

  try {
    const caller = await resolveCaller(opts);
    const result = await caller.auth.whoami();

    if (jsonMode) {
      print(JSON.stringify({
        userId: result.userId,
        orgId: result.orgId,
        activeOrgId: result.activeOrgId,
        sessionId: result.sessionId,
        sessionExpiresAt: result.sessionExpiresAt,
        email: result.email,
        role: result.role,
        orgName: result.orgName,
      }));
    } else {
      print(`User:  ${result.email ?? result.userId}`);
      print(`Org:   ${result.orgId}`);
      print(`Role:  ${result.role ?? "(unknown)"}`);
    }
  } catch (err) {
    const msg = formatCommandError(err);
    printErr(`fulcrum auth whoami: ${msg}`);
    exit(1);
  }
}

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

async function runLogout(
  _argv: readonly string[],
  opts: Required<Pick<AuthRunOptions, "print" | "printErr" | "exit">> & AuthRunOptions,
): Promise<void> {
  const { printErr, exit } = opts;
  printErr("logout: session invalidation not yet implemented.");
  exit(1);
}

async function resolveCaller(opts: AuthRunOptions): Promise<{
  auth: {
    whoami: () => Promise<any>;
    invite?: (input: { email: string; role: InviteRole }) => Promise<any>;
  };
}> {
  if (opts.caller) return opts.caller;
  const apiCaller = createAuthApiCallerFromEnv(opts.env, opts.fetch);
  if (!apiCaller) {
    throw new Error("Auth API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL.");
  }
  return apiCaller;
}
