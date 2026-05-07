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
import { createLocalCaller } from "./local-caller.ts";

type DocTemplateRow = inferRouterOutputs<AppRouter>["docs"]["templates"]["list"][number];

type DocsTemplateCaller = {
  docs: {
    templates: {
      list: (input: Record<string, never>) => Promise<DocTemplateRow[]>;
    };
  };
};

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

  return await createLocalCaller({
    container: opts.container,
    requireSession: true,
  }) as unknown as DocsTemplateCaller;
}
