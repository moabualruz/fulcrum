import {
  createDocumentApiCallerFromEnv,
  type DocumentApiEnvironment,
} from "@knowledge-workspace/interface/http/document-api-client.ts";

type DocTemplateRow = {
  id: string;
  docType: string;
  name: string;
};

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
  env?: DocumentApiEnvironment;
  fetch?: typeof fetch;
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
  const apiCaller = createDocumentApiCallerFromEnv(opts.env, opts.fetch);
  if (!apiCaller) {
    throw new Error("Document API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL.");
  }
  return {
    docs: {
      templates: {
        list: async (input) => await apiCaller.docs.listTemplates(input) as DocTemplateRow[],
      },
    },
  };
}
