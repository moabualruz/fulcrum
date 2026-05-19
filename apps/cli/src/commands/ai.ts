import { startTaskAiAssistSession } from "@agent-client-protocol/application/task-ai-assist-session.ts";

export interface AiCommandOptions {
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

const HELP = `fulcrum ai

Usage:
  fulcrum ai start --task <id> --title <title> [--description <text>] [--agent <id>] [--route plan|build|review] [--workspace <path>] [--json]
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
      io.print(rest.includes("--json") ? JSON.stringify(session) : JSON.stringify(session, null, 2));
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
