import { Command } from "commander";
import {
  getProfile,
  listProfiles,
  UnknownAgentError,
  type AgentProfile,
} from "@execution-orchestration/interface/agent-catalog.ts";
import { which } from "@platform-core/interface/process-runner.ts";

interface AgentCommandOptions {
  json?: boolean;
  name?: string;
}

interface AgentTestResult {
  name: string;
  passed: boolean;
  reason?: string;
  testedAt: string;
}

export function createAgentsCommand(): Command {
  const command = new Command("agents");
  command.description("Generated agents commands.");

  const getProfileCommand = command.command("get-profile");
  getProfileCommand.description("agents getProfile");
  getProfileCommand.option("--json", "Emit JSON output");
  getProfileCommand.option("--name <string>", "name");
  getProfileCommand.action(async (options) => {
    const opts = options as AgentCommandOptions;
    if (!opts.name) {
      emitError("BAD_REQUEST", "agents get-profile requires --name", opts);
      return;
    }
    try {
      printOutput(getProfile(opts.name), opts.json === true);
    } catch (error) {
      handleAgentError(error, opts);
    }
  });

  const listProfilesCommand = command.command("list-profiles");
  listProfilesCommand.description("agents listProfiles");
  listProfilesCommand.option("--json", "Emit JSON output");
  listProfilesCommand.action(async (options) => {
    printOutput(listProfiles(), (options as AgentCommandOptions).json === true);
  });

  const testProfileCommand = command.command("test-profile");
  testProfileCommand.description("agents testProfile");
  testProfileCommand.option("--json", "Emit JSON output");
  testProfileCommand.option("--name <string>", "name");
  testProfileCommand.action(async (options) => {
    const opts = options as AgentCommandOptions;
    if (!opts.name) {
      emitError("BAD_REQUEST", "agents test-profile requires --name", opts);
      return;
    }
    try {
      const result = await testProfile(getProfile(opts.name));
      printOutput(result, opts.json === true);
      if (!result.passed) process.exitCode = 1;
    } catch (error) {
      handleAgentError(error, opts);
    }
  });

  return command;
}

async function testProfile(profile: AgentProfile): Promise<AgentTestResult> {
  const testedAt = new Date().toISOString();
  const binPath = await which(profile.cliPath);
  if (!binPath) {
    return {
      name: profile.name,
      passed: false,
      reason: `binary '${profile.cliPath}' not on PATH`,
      testedAt,
    };
  }

  const missingVars = profile.authEnvVars.filter((envVar) => !process.env[envVar]);
  if (missingVars.length > 0) {
    return {
      name: profile.name,
      passed: false,
      reason: `missing env vars: ${missingVars.join(", ")}`,
      testedAt,
    };
  }

  return { name: profile.name, passed: true, testedAt };
}

function handleAgentError(error: unknown, options: AgentCommandOptions): void {
  if (error instanceof UnknownAgentError) {
    emitError("NOT_FOUND", error.message, options);
    return;
  }
  throw error;
}

function emitError(code: string, message: string, options: AgentCommandOptions): void {
  process.exitCode = 1;
  if (options.json === true) {
    console.log(JSON.stringify({ error: { code, message } }));
    return;
  }
  console.error(message);
}

function printOutput(value: unknown, json: boolean): void {
  console.log(json ? JSON.stringify(value) : JSON.stringify(value, null, 2));
}
