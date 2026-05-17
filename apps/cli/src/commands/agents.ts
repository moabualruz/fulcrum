/**
 * fulcrum agents — CLI surface for agent profile registry (P4#15).
 *
 * Commands:
 *   fulcrum agents list [--json]
 *   fulcrum agents profile <name> [--json]
 *   fulcrum agents test <name> [--json]
 *
 * C1: No new deps beyond existing registry.
 * C3: --json flag on every command.
 */

import { listProfiles, getProfile, UnknownAgentError } from "@execution-orchestration/interface/agent-catalog.ts";
import { which } from "@platform-core/application/runtime-support/process-runner.ts";
import type { AgentProfile } from "@execution-orchestration/interface/agent-catalog.ts";

const HELP = `fulcrum agents <list|profile|test> [options]

  list              List all registered agent profiles
  profile <name>    Show a single profile by name
  test <name>       Validate that agent binary is on PATH and auth vars set

Options:
  --json            Machine-readable JSON output
`;

export interface AgentsRunOptions {
  print?: (line: string) => void;
  printErr?: (line: string) => void;
  exit?: (code: number) => void;
}

type Io = Required<Pick<AgentsRunOptions, "print" | "printErr" | "exit">>;

export async function run(argv: readonly string[], _opts?: AgentsRunOptions): Promise<void> {
  const io: Io = {
    print: _opts?.print ?? console.log,
    printErr: _opts?.printErr ?? console.error,
    exit: _opts?.exit ?? process.exit,
  };

  const [sub = "help", ...rest] = argv;
  const json = rest.includes("--json");

  switch (sub) {
    case "help":
    case "--help":
    case "-h":
      io.print(HELP);
      return;

    case "list": {
      const profiles = listProfiles();
      if (json) {
        io.print(JSON.stringify(profiles));
      } else {
        for (const p of profiles) {
          io.print(`${p.name}  cli=${p.cliPath}  sandbox=${p.sandcastleProvider}`);
        }
      }
      return;
    }

    case "profile": {
      const name = positional(rest)[0];
      if (!name) {
        emitError("agents profile: missing <name>", json, io);
        return;
      }
      try {
        const profile = getProfile(name);
        if (json) {
          io.print(JSON.stringify(profile));
        } else {
          io.print(`name: ${profile.name}`);
          io.print(`cliPath: ${profile.cliPath}`);
          io.print(`defaultFlags: ${profile.defaultFlags.join(" ")}`);
          io.print(`skillFolder: ${profile.skillFolder}`);
          io.print(`authEnvVars: ${profile.authEnvVars.join(", ")}`);
          io.print(`sandcastleProvider: ${profile.sandcastleProvider}`);
          io.print(`maxIterations: ${profile.maxIterations}`);
          io.print(`defaultTimeout: ${profile.defaultTimeout}`);
        }
      } catch (err) {
        if (err instanceof UnknownAgentError) {
          emitError(err.message, json, io);
        } else {
          throw err;
        }
      }
      return;
    }

    case "test": {
      const name = positional(rest)[0];
      if (!name) {
        emitError("agents test: missing <name>", json, io);
        return;
      }
      try {
        const profile = getProfile(name);
        const result = await testProfile(profile);
        if (json) {
          io.print(JSON.stringify(result));
        } else {
          const icon = result.passed ? "PASS" : "FAIL";
          io.print(`${icon} ${result.name}: ${result.reason ?? "ok"}`);
        }
        if (!result.passed) io.exit(1);
      } catch (err) {
        if (err instanceof UnknownAgentError) {
          emitError(err.message, json, io);
        } else {
          throw err;
        }
      }
      return;
    }

    default:
      io.printErr(`fulcrum agents: unknown command '${sub}'`);
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

function emitError(message: string, json: boolean, io: Io): void {
  if (json) {
    io.print(JSON.stringify({ error: { code: "NOT_FOUND", message } }));
  } else {
    io.printErr(message);
  }
  io.exit(1);
}

function positional(argv: readonly string[]): string[] {
  return argv.filter((a) => !a.startsWith("--"));
}
