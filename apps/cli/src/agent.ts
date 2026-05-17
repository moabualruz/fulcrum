import {
  createAgentRunApiCallerFromEnv,
  type AgentRunApiEnvironment,
} from "@execution-orchestration/interface/http/agent-run-api-client.ts";
import { formatApiError } from "./api-errors.ts";

const HELP = `fulcrum agent — agent run commands

Usage:
  fulcrum agent run --task <id> [--agent <id>] [--json]
`;

const BOOLEAN_FLAGS = new Set<string>(["--json"]);

interface ParsedArgs {
  positionals: string[];
  flags: Record<string, string | true>;
}

type AgentRunResult = {
  runId?: string;
  id?: string;
  state?: string;
  status?: string;
  agent?: string;
};

type AgentCaller = {
  orchestration: {
    dispatchRun: (input: { taskId: string; agentName: string }) => Promise<AgentRunResult>;
  };
};

export interface AgentRunOptions {
  caller?: AgentCaller;
  env?: AgentRunApiEnvironment;
  fetch?: typeof fetch;
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

export async function run(argv: readonly string[], opts: AgentRunOptions = {}): Promise<void> {
  const print = opts.print ?? console.log;
  const printErr = opts.printErr ?? console.error;
  const exit = opts.exit ?? process.exit;
  const [verb, ...rest] = argv;
  if (!verb || verb === "help" || verb === "--help" || verb === "-h") {
    print(HELP);
    return;
  }
  if (verb !== "run") {
    printErr(`fulcrum agent: unknown verb '${verb}'`);
    exit(2);
    return;
  }
  const parsed = parseArgs(rest);
  const taskId = flag(parsed, "task");
  if (!taskId) {
    printErr("usage: fulcrum agent run --task <id>");
    exit(2);
    return;
  }
  const agent = flag(parsed, "agent") ?? "codex";
  const json = parsed.flags["--json"] !== undefined;
  try {
    const caller = await resolveCaller(opts);
    const result = await caller.orchestration.dispatchRun({ taskId, agentName: agent });
    const rawStatus = result.state ?? result.status ?? "queued";
    const status = rawStatus === "unclaimed" ? "queued" : rawStatus;
    const output = {
      id: result.runId ?? result.id,
      task_id: taskId,
      agent: result.agent ?? agent,
      status,
    };
    if (json) print(JSON.stringify(output, null, 2));
    else print(`${output.status}\t${output.agent}\t${output.id}`);
  } catch (err) {
    const message = errorMessage(err);
    const notFound = /not found/i.test(message);
    printErr(notFound ? `task not found: ${taskId}` : message);
    exit(notFound ? 1 : 1);
  }
}

async function resolveCaller(opts: AgentRunOptions): Promise<AgentCaller> {
  if (opts.caller) return opts.caller;
  const apiCaller = createAgentRunApiCallerFromEnv(opts.env, opts.fetch);
  if (!apiCaller) {
    throw new Error(
      "Agent-run API caller is not configured. Set FULCRUM_SERVER_URL or FULCRUM_PUBLIC_API_URL and FULCRUM_ORG_ID.",
    );
  }
  return apiCaller as AgentCaller;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const eq = token.indexOf("=");
    if (eq !== -1) {
      flags[token.slice(0, eq)] = token.slice(eq + 1);
      continue;
    }
    if (BOOLEAN_FLAGS.has(token)) {
      flags[token] = true;
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      flags[token] = next;
      i += 1;
    } else {
      flags[token] = true;
    }
  }
  return { positionals, flags };
}

function flag(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.flags[`--${name}`];
  return typeof value === "string" ? value : undefined;
}

function errorMessage(error: unknown): string {
  return formatApiError(error);
}
