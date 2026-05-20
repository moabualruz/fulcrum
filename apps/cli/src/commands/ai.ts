import { startTaskAiAssistSession } from "@agent-client-protocol/application/task-ai-assist-session.ts";

import { emitResult } from "../lib/cli-output.ts";

export interface AiCommandOptions {
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
  /** Process env — drives the CLI-TUI-UX §2.3 colour-disable conditions. */
  env?: NodeJS.ProcessEnv;
}

const HELP = `fulcrum ai

Usage:
  fulcrum ai start --task <id> --title <title> [--description <text>] [--agent <id>] [--route plan|build|review] [--workspace <path>] [--json]

Options:
  --json            Canonical fulcrum.cli.v1 JSON envelope
  --jq <expr>       Filter the envelope's .result through jq
  --json-raw        Pre-envelope JSON payload (compatibility, removed next release)
`;

export async function run(argv: readonly string[], opts: AiCommandOptions = {}): Promise<void> {
  const io = {
    print: opts.print ?? console.log,
    printErr: opts.printErr ?? console.error,
    exit: opts.exit ?? process.exit,
  };
  const [verb = "help", ...rest] = argv;

  switch (verb) {
    case "start": {
      const taskId = flagValue(rest, "--task");
      const title = flagValue(rest, "--title");
      if (!taskId || !title) {
        io.printErr("usage: fulcrum ai start --task <id> --title <title>");
        io.exit(2);
        return;
      }
      const session = startTaskAiAssistSession({
        task: {
          id: taskId,
          title,
          description: flagValue(rest, "--description"),
        },
        agent: flagValue(rest, "--agent"),
        route: flagValue(rest, "--route"),
        workspacePath: flagValue(rest, "--workspace"),
      });
      // `--json` wraps the session in the canonical `fulcrum.cli.v1` envelope;
      // plain output pretty-prints the same session object plus the DESIGN.md
      // §4.10 trace header line — starting an AI Assist session is a run, and
      // its trace id is the same one the envelope carries (and `FULCRUM_TRACE_ID`
      // propagates) so the session is followable in web / TUI.
      emitResult(
        {
          argv: rest,
          command: "fulcrum ai start",
          result: session,
          next_actions: [
            { label: "Open in TUI", command: "fulcrum tui :ai" },
          ],
          traceLine: true,
          env: opts.env,
          renderHuman: (value) => io.print(JSON.stringify(value, null, 2)),
        },
        { print: io.print, printErr: io.printErr },
      );
      return;
    }
    case "help":
    case "--help":
    case "-h":
      io.print(HELP);
      return;
    default:
      io.printErr(`fulcrum ai: unknown command '${verb}'`);
      io.printErr(HELP);
      io.exit(2);
  }
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const i = argv.indexOf(flag);
  const value = i >= 0 ? argv[i + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}
