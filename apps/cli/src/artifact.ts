import {
  createArtifactApiCallerFromEnv,
  type ArtifactApiEnvironment,
} from "@workflow-coordination/interface/http/artifact-api-client.ts";
import { formatApiError } from "./api-errors.ts";

type ArtifactCaller = {
  artifacts: {
    list(input?: Record<string, unknown>): Promise<unknown[]>;
    get(input: { id: string }): Promise<unknown>;
  };
};

export interface ArtifactRunOptions {
  caller?: ArtifactCaller;
  env?: ArtifactApiEnvironment;
  fetch?: typeof fetch;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum artifact - artifact commands

Usage:
  fulcrum artifact list [--json]
  fulcrum artifact show <id> [--json]
`;

export async function run(argv: readonly string[], opts: ArtifactRunOptions = {}): Promise<void> {
  const io = ioFor(opts);
  const [verb = "help", ...rest] = argv;
  if (verb === "help" || verb === "--help" || verb === "-h") {
    io.print(HELP);
    return;
  }

  try {
    const caller = await resolveCaller(opts);
    if (verb === "list") {
      if (!validateFlags(rest, new Set(["--json"]), io)) return;
      const rows = await caller.artifacts.list({});
      if (rest.includes("--json")) io.print(JSON.stringify(rows, null, 2));
      else if (rows.length === 0) io.print("no artifacts");
      else for (const row of rows as Array<Record<string, unknown>>) io.print(`${row["filename"] ?? row["kind"] ?? "artifact"}\t${row["id"]}`);
      return;
    }
    if (verb === "show") {
      if (!validateFlags(rest, new Set(["--json"]), io)) return;
      const id = firstArg(rest);
      if (!id) {
        io.printErr("usage: fulcrum artifact show <id> [--json]");
        io.exit(2);
        return;
      }
      const artifact = await caller.artifacts.get({ id });
      io.print(rest.includes("--json") ? JSON.stringify(artifact) : JSON.stringify(artifact, null, 2));
      return;
    }
    io.printErr(`fulcrum artifact: unknown verb '${verb}'`);
    io.exit(2);
  } catch (error) {
    io.printErr(`fulcrum artifact ${verb}: ${errorMessage(error)}`);
    io.exit(1);
  }
}

async function resolveCaller(opts: ArtifactRunOptions): Promise<ArtifactCaller> {
  if (opts.caller) return opts.caller;
  const apiCaller = createArtifactApiCallerFromEnv(opts.env, opts.fetch);
  if (!apiCaller) {
    throw new Error("Artifact API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL.");
  }
  return apiCaller as ArtifactCaller;
}

function firstArg(argv: readonly string[]): string | undefined {
  return argv.find((arg) => !arg.startsWith("-"));
}

function validateFlags(argv: readonly string[], allowed: Set<string>, io: Required<Pick<ArtifactRunOptions, "printErr" | "exit">>): boolean {
  for (const arg of argv) {
    if (arg.startsWith("--") && !allowed.has(arg)) {
      io.printErr(`unknown flag: ${arg}`);
      io.exit(2);
      return false;
    }
  }
  return true;
}

function ioFor(opts: ArtifactRunOptions): Required<Pick<ArtifactRunOptions, "print" | "printErr" | "exit">> {
  return {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
}

function errorMessage(error: unknown): string {
  return formatApiError(error);
}
