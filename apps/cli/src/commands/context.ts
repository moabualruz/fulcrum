import type { Container } from "@needle-di/core";

import { createLocalCaller } from "../local-caller.ts";

type ContextCaller = {
  context: {
    assemble?: (input: Record<string, unknown>) => Promise<unknown>;
    preview?: (input: Record<string, unknown>) => Promise<unknown>;
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
  fulcrum context preview --project <id> --task <id> [--include-global] [--json]

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
    case "preview":
      return runPreview(rest, resolved);
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
    if (!caller.context.assemble) throw new Error("context.assemble procedure is not available");
    const result = await caller.context.assemble({ task });
    const jsonMode = argv.includes("--json");
    if (jsonMode) {
      opts.print(JSON.stringify(result));
    } else {
      opts.print(JSON.stringify(result, null, 2));
    }
  } catch (err) {
    const msg = formatCliError(err);
    opts.printErr(`fulcrum context assemble: ${msg}`);
    opts.exit(1);
  }
}

async function runPreview(argv: readonly string[], opts: ResolvedOptions): Promise<void> {
  const projectId = flagValue(argv, "--project");
  const taskId = flagValue(argv, "--task");
  if (!projectId || !taskId) {
    opts.printErr("fulcrum context preview: missing required flags --project <id> --task <id>");
    opts.exit(1);
    return;
  }

  try {
    const caller = await resolveCaller(opts);
    const input = { projectId, taskId, includeGlobal: argv.includes("--include-global") };
    const result = caller.context.preview
      ? await caller.context.preview(input)
      : await caller.context.assemble(input);
    opts.print(argv.includes("--json") ? JSON.stringify(result) : JSON.stringify(result, null, 2));
  } catch (err) {
    const msg = formatCliError(err);
    opts.printErr(`fulcrum context preview: ${msg}`);
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

  return await createLocalCaller({
    container: opts.container,
    requireSession: true,
  }) as unknown as ContextCaller;
}

function formatCliError(err: unknown): string {
  if (err && typeof err === "object" && "code" in err && "message" in err) {
    const code = String((err as { code: unknown }).code);
    const message = String((err as { message: unknown }).message);
    return `${code}: ${message}`;
  }
  return (err as Error).message;
}
