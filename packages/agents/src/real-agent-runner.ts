import { spawn } from "node:child_process";
import type { AgentProfile } from "./profiles.js";

export interface RealAgentRunInput {
  profile: AgentProfile;
  prompt: string;
  cwd: string;
  timeoutMs?: number;
  commandOverride?: string;
}

export interface RealAgentRunResult {
  agentId: string;
  command: string;
  args: string[];
  cwd: string;
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  status: "passed" | "failed" | "guided";
  evidenceRef: string;
  nextAction?: string;
}

export async function runRealAgentPrompt(input: RealAgentRunInput): Promise<RealAgentRunResult> {
  const command = input.commandOverride ?? input.profile.command;
  const args = input.profile.defaultPromptMechanism === "argument" ? [input.prompt] : [];
  const timeoutMs = input.timeoutMs ?? 30_000;

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: input.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      resolve({
        agentId: input.profile.agentId,
        command,
        args,
        cwd: input.cwd,
        exitCode: null,
        timedOut,
        stdout,
        stderr: error.message,
        status: "guided",
        evidenceRef: `agent://${input.profile.agentId}/unavailable`,
        nextAction:
          error.code === "ENOENT"
            ? input.profile.installHints[0]
            : `Fix ${input.profile.command} invocation: ${error.message}`
      });
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const status = exitCode === 0 && !timedOut ? "passed" : "failed";
      resolve({
        agentId: input.profile.agentId,
        command,
        args,
        cwd: input.cwd,
        exitCode,
        timedOut,
        stdout,
        stderr,
        status,
        evidenceRef: `agent://${input.profile.agentId}/prompt-run`,
        nextAction:
          status === "passed"
            ? undefined
            : timedOut
              ? `Increase timeout or fix ${input.profile.command} non-terminating prompt mode.`
              : `Inspect ${input.profile.command} output and authentication.`
      });
    });

    if (input.profile.defaultPromptMechanism === "stdin") {
      child.stdin.end(input.prompt);
    } else {
      child.stdin.end();
    }
  });
}
