/**
 * CLI handler for `fulcrum docs template <subcommand>`.
 *
 * Follows the same testable run(argv, opts) pattern as src/cli/inference.ts:
 *   - opts.caller  — in-process tRPC caller (injected by test or CLI bootstrap)
 *   - opts.print   — stdout sink (defaults to console.log)
 *   - opts.printErr — stderr sink (defaults to console.error)
 *   - opts.exit    — process exit (defaults to process.exit)
 *
 * C4: CLI parity — every tRPC procedure has a CLI binding.
 */

import type { AppRouter } from "../trpc/router.ts";
import type { inferRouterOutputs } from "@trpc/server";
import { Container } from "@needle-di/core";
import { MikroORM, type EntityManager } from "@mikro-orm/postgresql";
import type { Session as BetterAuthSession } from "better-auth";
import {
  ENTITY_MANAGER_TOKEN,
  registerDbBindings,
} from "../db/db.module.ts";

type DocTemplateRow = inferRouterOutputs<AppRouter>["docs"]["templates"]["list"][number];

type DocsTemplateCaller = {
  docs: {
    templates: {
      list: (input: Record<string, never>) => Promise<DocTemplateRow[]>;
    };
  };
};

interface CliSession {
  id: string;
  token: string;
  userId: string;
  orgId: string;
  activeOrganizationId?: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
}

const DOCS_HELP = `fulcrum docs

Usage:
  fulcrum docs template list [--json]
`;

const HELP = `fulcrum docs template

Usage:
  fulcrum docs template list [--json]

Commands:
  list    List all org-default doc templates
`;

export interface DocsTemplateRunOptions {
  caller?: DocsTemplateCaller;
  container?: import("@needle-di/core").Container | null;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

function hasFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(`--${flag}`);
}

export async function runDocsCommand(
  argv: readonly string[],
  opts: DocsTemplateRunOptions = {},
): Promise<void> {
  const print = opts.print ?? ((l) => console.log(l));
  const printErr = opts.printErr ?? ((l) => console.error(l));
  const exit = opts.exit ?? ((c) => process.exit(c));
  const [subcommand, ...rest] = argv;

  if (!subcommand || subcommand === "help" || hasFlag(argv, "help")) {
    print(DOCS_HELP);
    return;
  }

  if (subcommand === "template") {
    await run(rest, opts);
    return;
  }

  printErr(`unknown subcommand: ${subcommand}`);
  printErr(DOCS_HELP);
  exit(1);
}

export async function run(
  argv: readonly string[],
  opts: DocsTemplateRunOptions = {},
): Promise<void> {
  const print = opts.print ?? ((l) => console.log(l));
  const printErr = opts.printErr ?? ((l) => console.error(l));
  const exit = opts.exit ?? ((c) => process.exit(c));

  const [subcommand, ...rest] = argv;

  if (!subcommand || subcommand === "help" || hasFlag(argv, "help")) {
    print(HELP);
    return;
  }

  if (subcommand === "list") {
    const json = hasFlag(rest, "json");
    try {
      const caller = await resolveCaller(opts);
      const rows = await caller.docs.templates.list({} as Record<string, never>);
      if (json) {
        print(JSON.stringify(rows, null, 2));
      } else {
        for (const row of rows) {
          print(`${row.docType.padEnd(12)} ${row.name}  (id: ${row.id})`);
        }
      }
    } catch (err) {
      printErr(`error: ${err instanceof Error ? err.message : String(err)}`);
      exit(1);
    }
    return;
  }

  printErr(`unknown subcommand: ${subcommand}`);
  printErr(HELP);
  exit(1);
}

async function resolveCaller(opts: DocsTemplateRunOptions): Promise<DocsTemplateCaller> {
  if (opts.caller) return opts.caller;

  const { t } = await import("../trpc/trpc.ts");
  const { appRouter } = await import("../trpc/router.ts");
  const { createContext } = await import("../trpc/context.ts");

  const cliContext = buildCliContext(opts.container ?? null);
  const { container, em } = cliContext;
  const session = await resolveActiveCliSession(em);
  if (!session) {
    throw new Error(
      "No active CLI session found. Run `fulcrum init` or `fulcrum auth login` before docs commands.",
    );
  }

  const orgId = session.activeOrganizationId ?? session.orgId;
  const userId = session.userId;
  if (!orgId || !userId) {
    throw new Error("Active CLI session is missing orgId or userId. Re-authenticate.");
  }

  const ctx = createContext({
    session: session as unknown as BetterAuthSession,
    orgId,
    userId,
    em,
    container,
  });
  const factory = t.createCallerFactory(appRouter);
  return factory(ctx) as unknown as DocsTemplateCaller;
}

function buildCliContext(container: Container | null): {
  container: Container | null;
  em: EntityManager | null;
} {
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

async function resolveActiveCliSession(em: EntityManager | null): Promise<CliSession | null> {
  if (!em) return null;

  const { Session } = await import("../db/entities/auth/Session.ts");
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
      userAgent: session.userAgent ?? null,
    };
  } catch {
    return null;
  }
}
