import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Run } from "@fulcrum/shared";

export interface ValidationAgentInput {
  run: Run;
  worktreePath: string;
  onHeartbeat: (message: string) => void | Promise<void>;
  onProgress: (message: string) => void | Promise<void>;
}

export interface ValidationAgentResult {
  summary: string;
  changedFiles: string[];
  transcript: string[];
}

export async function runValidationAgent(input: ValidationAgentInput): Promise<ValidationAgentResult> {
  const transcript = [`validation agent start ${input.run.runId}`];
  await input.onHeartbeat("validation agent alive");
  await input.onProgress("writing deterministic output");
  await mkdir(input.worktreePath, { recursive: true });
  const filePath = path.join(input.worktreePath, "validation-agent-output.txt");
  const body = `Fulcrum validation agent completed run ${input.run.runId}\n`;
  await writeFile(filePath, body);
  transcript.push(`wrote ${filePath}`);
  await input.onHeartbeat("validation agent completed");
  return {
    summary: "Deterministic validation agent completed.",
    changedFiles: [filePath],
    transcript
  };
}
