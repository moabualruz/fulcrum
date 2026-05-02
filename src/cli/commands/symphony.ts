/**
 * fulcrum symphony — orchestration CLI commands.
 */

import { TRPCError } from "@trpc/server";
import type { Container } from "@needle-di/core";
import type { EntityManager } from "@mikro-orm/postgresql";

import { DEFAULT_ORG_ID } from "../../db/seed.ts";
import { ENTITY_MANAGER_TOKEN } from "../../db/db.module.ts";
import type {
  AgentRunIssue,
  CandidateIssue,
} from "../../orchestration/symphony/tracker.ts";

export interface SymphonyCaller {
  orchestration: {
    fetchCandidateIssues: (input: {
      orgId: string;
      limit: number;
    }) => Promise<CandidateIssue[]>;
    fetchIssuesByStates?: (input: {
      orgId: string;
      states: string[];
      limit: number;
    }) => Promise<AgentRunIssue[]>;
  };
}

export interface SymphonyRunOptions {
  caller?: SymphonyCaller;
  container?: Container | null;
  orgId?: string;
  userId?: string;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum symphony

Orchestration commands.

Usage:
  fulcrum symphony runs list --state <state> [--limit N] [--json]

Options:
  --state <state>  State filter. 'ready' lists candidate tasks; run states list agent runs.
  --limit <N>      Max rows to return (default 50).
  --json           Output as machine-readable JSON.
  -h, --help       Show this help.
`;

export async function run(
  argv: readonly string[],
  opts: SymphonyRunOptions = {},
): Promise<void> {
  const { print = console.log, printErr = console.error, exit = process.exit } = opts;
  const [domain = "help", ...rest] = argv;

  switch (domain) {
    case "runs":
      return runRuns(rest, { ...opts, print, printErr, exit });
    case "help":
    case "--help":
    case "-h":
      print(HELP);
      return;
    default:
      printErr(`fulcrum symphony: unknown command '${domain}'`);
      printErr(HELP);
      exit(2);
  }
}

async function runRuns(
  argv: readonly string[],
  opts: Required<Pick<SymphonyRunOptions, "print" | "printErr" | "exit">> &
    SymphonyRunOptions,
): Promise<void> {
  const { print, printErr, exit } = opts;
  const [action = "help", ...rest] = argv;

  switch (action) {
    case "list":
      return runRunsList(rest, opts);
    case "help":
    case "--help":
    case "-h":
      print(HELP);
      return;
    default:
      printErr(`fulcrum symphony runs: unknown command '${action}'`);
      printErr(HELP);
      exit(2);
  }
}

async function runRunsList(
  argv: readonly string[],
  opts: Required<Pick<SymphonyRunOptions, "print" | "printErr" | "exit">> &
    SymphonyRunOptions,
): Promise<void> {
  const { print, printErr, exit } = opts;
  const jsonMode = argv.includes("--json");
  const state = readFlag(argv, "--state") ?? "ready";
  const limit = Number(readFlag(argv, "--limit") ?? "50");

  if (!Number.isInteger(limit) || limit < 1) {
    printErr("fulcrum symphony runs list: --limit must be a positive integer");
    exit(1);
    return;
  }

  const caller = await resolveCaller(opts);

  try {
    if (state !== "ready") {
      if (!caller.orchestration.fetchIssuesByStates) {
        throw new Error("orchestration.fetchIssuesByStates is unavailable");
      }
      const rows = await caller.orchestration.fetchIssuesByStates({
        orgId: opts.orgId ?? DEFAULT_ORG_ID,
        states: [state],
        limit,
      });

      if (jsonMode) {
        print(JSON.stringify(rows));
        return;
      }

      print("ID                                    STATE         ATTEMPT  STARTED_AT");
      for (const row of rows) {
        print(
          `${row.id}  ${row.state.padEnd(12)}  ${String(row.attemptCount).padEnd(7)}  ${row.startedAt.toISOString()}`,
        );
      }
      return;
    }

    const rows = await caller.orchestration.fetchCandidateIssues({
      orgId: opts.orgId ?? DEFAULT_ORG_ID,
      limit,
    });

    if (jsonMode) {
      print(JSON.stringify(rows));
      return;
    }

    print("ID                                    STATE  PRIORITY  CREATED_AT");
    for (const row of rows) {
      print(
        `${row.id}  ${row.state.padEnd(5)}  ${String(row.priority ?? "").padEnd(8)}  ${row.createdAt.toISOString()}`,
      );
    }
  } catch (err) {
    const msg = err instanceof TRPCError
      ? `${err.code}: ${err.message}`
      : `Error: ${(err as Error).message}`;
    printErr(`fulcrum symphony runs list: ${msg}`);
    exit(1);
  }
}

async function resolveCaller(opts: SymphonyRunOptions): Promise<SymphonyCaller> {
  if (opts.caller) return opts.caller;

  const { t } = await import("../../trpc/trpc.ts");
  const { appRouter } = await import("../../trpc/router.ts");
  const { createContext } = await import("../../trpc/context.ts");

  const container = opts.container ?? null;
  const orgId = opts.orgId ?? DEFAULT_ORG_ID;
  const userId = opts.userId ?? "admin-local-user";
  const em = resolveEntityManager(container);
  const factory = t.createCallerFactory(appRouter);

  return factory(
    createContext({
      session: localCliSession(orgId, userId) as never,
      orgId,
      userId,
      em,
      container,
    }),
  ) as unknown as SymphonyCaller;
}

function resolveEntityManager(container: Container | null): EntityManager | null {
  if (!container) return null;
  try {
    return container.get(ENTITY_MANAGER_TOKEN);
  } catch {
    return null;
  }
}

function localCliSession(orgId: string, userId: string) {
  const now = new Date();
  return {
    id: "cli-local-session",
    userId,
    orgId,
    activeOrganizationId: orgId,
    expiresAt: new Date(now.getTime() + 86_400_000),
    createdAt: now,
    updatedAt: now,
    token: "cli-local-session",
    ipAddress: null,
    userAgent: "fulcrum-cli",
  };
}

function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  return argv[index + 1];
}
