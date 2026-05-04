import { TRPCError } from "@trpc/server";
import { Container } from "@needle-di/core";
import { MikroORM, type EntityManager } from "@mikro-orm/postgresql";
import type { Session as BetterAuthSession } from "better-auth";

import {
  ENTITY_MANAGER_TOKEN,
  registerDbBindings,
} from "../../db/db.module.ts";

type ContextCaller = {
  context: {
    assemble: (input: Record<string, unknown>) => Promise<unknown>;
  };
};

export interface ContextRunOptions {
  caller?: ContextCaller;
  container?: Container | null;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum context

Context commands.

Usage:
  fulcrum context assemble --task <description> [--json]

Options:
  --json      Output as machine-readable JSON.
  -h, --help  Show this help.
`;

export async function run(
  argv: readonly string[],
  opts: ContextRunOptions = {},
): Promise<void> {
  const print = opts.print ?? console.log;
  const printErr = opts.printErr ?? console.error;
  const exit = opts.exit ?? process.exit;
  const resolved = { ...opts, print, printErr, exit };

  const [sub = "help", ...rest] = argv;

  switch (sub) {
    case "assemble":
      return runAssemble(rest, resolved);
    case "help":
    case "--help":
    case "-h":
      print(HELP);
      return;
    default:
      printErr(`fulcrum context: unknown command '${sub}'`);
      printErr(HELP);
      exit(2);
  }
}

type ResolvedOptions = Required<Pick<ContextRunOptions, "print" | "printErr" | "exit">> & ContextRunOptions;

async function runAssemble(argv: readonly string[], opts: ResolvedOptions): Promise<void> {
  const task = flagValue(argv, "--task");
  if (!task) {
    opts.printErr("fulcrum context assemble: missing required flag --task <description>");
    opts.exit(1);
    return;
  }

  try {
    const caller = await resolveCaller(opts);
    const result = await caller.context.assemble({ task });
    const jsonMode = argv.includes("--json");
    if (jsonMode) {
      opts.print(JSON.stringify(result));
    } else {
      opts.print(JSON.stringify(result, null, 2));
    }
  } catch (err) {
    const msg = err instanceof TRPCError
      ? `${err.code}: ${err.message}`
      : (err as Error).message;
    opts.printErr(`fulcrum context assemble: ${msg}`);
    opts.exit(1);
  }
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index < 0) return undefined;
  return argv[index + 1];
}

async function resolveCaller(opts: ContextRunOptions): Promise<ContextCaller> {
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
      message: "No active CLI session found. Run `fulcrum init` or `fulcrum auth login` before context commands.",
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
  return factory(ctx) as unknown as ContextCaller;
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
