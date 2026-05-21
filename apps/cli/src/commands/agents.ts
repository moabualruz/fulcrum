/**
 * fulcrum agent: CLI surface for agent profile registry (P4#15).
 *
 * Commands:
 *   fulcrum agent list [--json]
 *   fulcrum agent view <name> [--json]
 *   fulcrum agent test <name> [--json]
 *
 * C1: No new deps beyond existing registry.
 * C3: --json flag on every command.
 */

import { listProfiles, getProfile, UnknownAgentError } from "@execution-orchestration/interface/agent-catalog.ts";
import { which } from "@platform-core/application/runtime-support/process-runner.ts";
import type { AgentProfile } from "@execution-orchestration/interface/agent-catalog.ts";
import { emitErrorResult, emitResult, parseJsonOutputMode } from "../lib/cli-output.ts";
import type { EnvelopeError, EnvelopeNextAction } from "../lib/envelope.ts";

const HELP = `fulcrum agent <list|view|test> [options]

  list              List all registered agent profiles
  view <name>       Show a single profile by name
  test <name>       Validate that agent binary is on PATH and auth vars set

Options:
  --json            Machine-readable JSON output
  --json-raw        Compatibility JSON payload without the fulcrum.cli.v1 envelope
`;

export interface AgentsRunOptions {
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
  commandRoot?: "agent" | "agents";
}

type Io = Required<Pick<AgentsRunOptions, "print" | "printErr" | "exit">>;
type AgentSubcommand = "list" | "view" | "test";

export async function run(argv: readonly string[], _opts?: AgentsRunOptions): Promise<void> {
  const io: Io = {
    print: _opts?.print ?? console.log,
    printErr: _opts?.printErr ?? console.error,
    exit: _opts?.exit ?? process.exit,
  };

  const [sub = "help", ...rest] = argv;
  const commandRoot = _opts?.commandRoot ?? "agent";

  switch (sub) {
    case "help":
    case "--help":
    case "-h":
      io.print(HELP);
      return;

    case "list": {
      const profiles = listProfiles();
      emitAgentResult({
        commandRoot,
        subcommand: "list",
        argv,
        result: { profiles },
        args: { client: optionValue(rest, "--client"), ring: optionValue(rest, "--ring") },
        renderHuman: (value) => {
          for (const p of value.profiles) {
            io.print(`${p.name}  cli=${p.cliPath}  sandbox=${p.sandcastleProvider}`);
          }
        },
        rawResult: profiles,
        io,
      });
      return;
    }

    case "view":
    case "profile": {
      const name = positional(rest)[0];
      if (!name) {
        emitAgentError({
          commandRoot,
          subcommand: sub === "profile" ? "view" : "view",
          argv,
          args: {},
          error: {
            code: "FUL_AGENT_MISSING_ARGUMENT",
            message: `fulcrum ${commandRoot} ${sub}: missing <name>`,
            fix: `Run \`fulcrum ${commandRoot} list\` to choose an agent, then retry with \`fulcrum ${commandRoot} view <name>\`.`,
          },
          io,
        });
        return;
      }
      try {
        const profile = getProfile(name);
        emitAgentResult({
          commandRoot,
          subcommand: "view",
          argv,
          args: { name },
          result: { profile },
          renderHuman: (value) => {
            io.print(`name: ${value.profile.name}`);
            io.print(`cliPath: ${value.profile.cliPath}`);
            io.print(`defaultFlags: ${value.profile.defaultFlags.join(" ")}`);
            io.print(`skillFolder: ${value.profile.skillFolder}`);
            io.print(`authEnvVars: ${value.profile.authEnvVars.join(", ")}`);
            io.print(`sandcastleProvider: ${value.profile.sandcastleProvider}`);
            io.print(`maxIterations: ${value.profile.maxIterations}`);
            io.print(`defaultTimeout: ${value.profile.defaultTimeout}`);
          },
          rawResult: profile,
          io,
        });
      } catch (err) {
        if (err instanceof UnknownAgentError) {
          emitAgentError({
            commandRoot,
            subcommand: "view",
            argv,
            args: { name },
            error: {
              code: "FUL_AGENT_NOT_FOUND",
              message: err.message,
              fix: `Run \`fulcrum ${commandRoot} list\` to see registered agents.`,
            },
            io,
          });
        } else {
          throw err;
        }
      }
      return;
    }

    case "test": {
      const name = positional(rest)[0];
      if (!name) {
        emitAgentError({
          commandRoot,
          subcommand: "test",
          argv,
          args: {},
          error: {
            code: "FUL_AGENT_MISSING_ARGUMENT",
            message: `fulcrum ${commandRoot} test: missing <name>`,
            fix: `Run \`fulcrum ${commandRoot} list\` to choose an agent, then retry with \`fulcrum ${commandRoot} test <name>\`.`,
          },
          io,
        });
        return;
      }
      try {
        const profile = getProfile(name);
        const result = await testProfile(profile);
        emitAgentResult({
          commandRoot,
          subcommand: "test",
          argv,
          args: { name },
          result,
          renderHuman: (value) => {
            const icon = value.passed ? "PASS" : "FAIL";
            io.print(`${icon} ${value.name}: ${value.reason ?? "ok"}`);
          },
          rawResult: result,
          io,
        });
        if (!result.passed) io.exit(1);
      } catch (err) {
        if (err instanceof UnknownAgentError) {
          emitAgentError({
            commandRoot,
            subcommand: "test",
            argv,
            args: { name },
            error: {
              code: "FUL_AGENT_NOT_FOUND",
              message: err.message,
              fix: `Run \`fulcrum ${commandRoot} list\` to see registered agents.`,
            },
            io,
          });
        } else {
          throw err;
        }
      }
      return;
    }

    default:
      emitAgentError({
        commandRoot,
        subcommand: "list",
        argv,
        args: { subcommand: sub },
        error: {
          code: "FUL_AGENT_UNKNOWN_COMMAND",
          message: `fulcrum ${commandRoot}: unknown command '${sub}'`,
          fix: `Run \`fulcrum ${commandRoot} --help\`.`,
        },
        io,
      });
      io.exit(2);
  }
}

export interface AgentTestResult {
  name: string;
  passed: boolean;
  reason?: string;
  testedAt: string;
}

async function testProfile(profile: AgentProfile): Promise<AgentTestResult> {
  const testedAt = new Date().toISOString();

  // Check binary on PATH
  const binPath = await which(profile.cliPath);
  if (!binPath) {
    return { name: profile.name, passed: false, reason: `binary '${profile.cliPath}' not on PATH`, testedAt };
  }

  // Check auth env vars
  const missingVars = profile.authEnvVars.filter((v) => !process.env[v]);
  if (missingVars.length > 0) {
    return { name: profile.name, passed: false, reason: `missing env vars: ${missingVars.join(", ")}`, testedAt };
  }

  return { name: profile.name, passed: true, testedAt };
}

function positional(argv: readonly string[]): string[] {
  return argv.filter((a) => !a.startsWith("--"));
}

function optionValue(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

function commandName(root: string, subcommand: AgentSubcommand): string {
  return `fulcrum ${root} ${subcommand}`;
}

function emitAgentResult<TResult>(input: {
  commandRoot: "agent" | "agents";
  subcommand: AgentSubcommand;
  argv: readonly string[];
  args: Record<string, unknown>;
  result: TResult;
  rawResult?: unknown;
  renderHuman: (result: TResult) => void;
  io: Io;
}): void {
  const mode = parseJsonOutputMode(input.argv);
  if (mode.raw && input.rawResult !== undefined) {
    input.io.print(JSON.stringify(input.rawResult));
    return;
  }
  emitResult(
    {
      argv: input.argv,
      command: commandName(input.commandRoot, input.subcommand),
      args: input.args,
      result: input.result,
      renderHuman: input.renderHuman,
    },
    input.io,
  );
}

function emitAgentError(input: {
  commandRoot: "agent" | "agents";
  subcommand: AgentSubcommand;
  argv: readonly string[];
  args: Record<string, unknown>;
  error: EnvelopeError;
  nextActions?: EnvelopeNextAction[];
  io: Io;
}): void {
  emitErrorResult(
    {
      argv: input.argv,
      command: commandName(input.commandRoot, input.subcommand),
      args: input.args,
      error: input.error,
      next_actions: input.nextActions ?? [],
      renderHuman: () => input.io.printErr(input.error.message),
    },
    input.io,
  );
  input.io.exit(1);
}
