import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { redactText } from "@fulcrum/policy";
import {
  makeId,
  QualityGateDefinitionSchema,
  QualityGateResultSchema,
  SCHEMA_VERSION,
  type ArtifactContract,
  type QualityGateDefinition,
  type QualityGateResult,
  type RunEvent
} from "@fulcrum/shared";

export interface QualityGateRepositoryPort {
  saveDefinition(definition: QualityGateDefinition): QualityGateDefinition;
  getDefinition(gateId: string): QualityGateDefinition | undefined;
  listDefinitions(projectId: string): QualityGateDefinition[];
  saveResult(result: QualityGateResult): QualityGateResult;
  getResult(resultId: string): QualityGateResult | undefined;
  listResults(input: { projectId: string; runId?: string; taskId?: string }): QualityGateResult[];
}

export interface QualityArtifactPort {
  attach(input: {
    type: ArtifactContract["type"];
    localRef: string;
    summary: string;
    projectId?: string;
    taskId?: string;
    runId?: string;
    capturedBy: string;
  }): Promise<ArtifactContract>;
}

export interface QualityEventPort {
  appendEvent(event: Omit<RunEvent, "sequence">): RunEvent;
}

export interface QualityRunLinkPort {
  linkResultToRun(runId: string, qualityGateResultId: string): unknown;
}

export interface QualityGateRunInput {
  gateId: string;
  cwd: string;
  projectId?: string;
  taskId?: string;
  runId?: string;
  artifactRoot?: string;
  skip?: boolean;
}

export class QualityGateRunner {
  constructor(
    private readonly repository: QualityGateRepositoryPort,
    private readonly artifacts: QualityArtifactPort,
    private readonly events?: QualityEventPort,
    private readonly runLinks?: QualityRunLinkPort
  ) {}

  define(input: Omit<QualityGateDefinition, "createdAt" | "updatedAt" | "schemaVersion">) {
    const now = new Date().toISOString();
    return this.repository.saveDefinition(
      QualityGateDefinitionSchema.parse({
        ...input,
        createdAt: now,
        updatedAt: now,
        schemaVersion: SCHEMA_VERSION
      })
    );
  }

  list(projectId: string): QualityGateDefinition[] {
    return this.repository.listDefinitions(projectId);
  }

  results(input: { projectId: string; runId?: string; taskId?: string }): QualityGateResult[] {
    return this.repository.listResults(input);
  }

  async run(input: QualityGateRunInput): Promise<QualityGateResult> {
    const definition = this.repository.getDefinition(input.gateId);
    if (!definition) {
      throw new Error(`Quality gate not found: ${input.gateId}`);
    }
    if (input.projectId && input.projectId !== definition.projectId) {
      throw new Error(
        `Quality gate ${definition.gateId} belongs to project ${definition.projectId}, not ${input.projectId}`
      );
    }
    const startedAt = new Date().toISOString();
    const projectId = definition.projectId;
    const resultId = makeId(
      "gate",
      `${definition.gateId}-${input.runId ?? input.taskId ?? "manual"}-${startedAt}`
    );
    this.append("quality.started", definition, input, "Quality gate started.", []);
    if (input.skip) {
      const skipped = this.saveResult({
        qualityGateResultId: resultId,
        gateId: definition.gateId,
        projectId,
        taskId: input.taskId,
        runId: input.runId,
        workingDirectory: input.cwd,
        status: "skipped",
        startedAt,
        completedAt: startedAt,
        durationMs: 0,
        parsedSummary: {
          command: definition.command,
          stdoutLines: 0,
          stderrLines: 0,
          timedOut: false
        },
        redactionStatus: "not_applicable",
        createdAt: startedAt,
        updatedAt: startedAt,
        schemaVersion: SCHEMA_VERSION
      });
      this.linkOrAppendCompleted(skipped, definition, input, "Quality gate skipped.", []);
      return skipped;
    }

    this.saveResult({
      qualityGateResultId: resultId,
      gateId: definition.gateId,
      projectId,
      taskId: input.taskId,
      runId: input.runId,
      workingDirectory: input.cwd,
      status: "running",
      startedAt,
      parsedSummary: {
        command: definition.command,
        stdoutLines: 0,
        stderrLines: 0,
        timedOut: false
      },
      redactionStatus: "not_applicable",
      createdAt: startedAt,
      updatedAt: startedAt,
      schemaVersion: SCHEMA_VERSION
    });

    const execution = await runShellCommand(definition.command, input.cwd, definition.timeoutMs);
    const completedAt = new Date().toISOString();
    const output = redactText([execution.stdout, execution.stderr].filter(Boolean).join("\n"));
    const outputPath = await writeOutputArtifact(
      input.artifactRoot ?? path.join(input.cwd, ".fulcrum", "quality"),
      resultId,
      output.text
    );
    const artifact = await this.artifacts.attach({
      type: "quality_output",
      localRef: outputPath,
      summary: `${definition.name} quality output`,
      projectId,
      taskId: input.taskId,
      runId: input.runId,
      capturedBy: "core.quality.runner"
    });
    const status = execution.timedOut ? "timeout" : execution.exitCode === 0 ? "passed" : "failed";
    const result = this.saveResult({
      qualityGateResultId: resultId,
      gateId: definition.gateId,
      projectId,
      taskId: input.taskId,
      runId: input.runId,
      workingDirectory: input.cwd,
      status,
      startedAt,
      completedAt,
      durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
      outputArtifactId: artifact.artifactId,
      parsedSummary: {
        exitCode: execution.exitCode,
        stdoutLines: lineCount(execution.stdout),
        stderrLines: lineCount(execution.stderr),
        command: definition.command,
        timedOut: execution.timedOut
      },
      redactionStatus: output.redacted ? "redacted" : "not_applicable",
      createdAt: startedAt,
      updatedAt: completedAt,
      schemaVersion: SCHEMA_VERSION
    });
    this.linkOrAppendCompleted(result, definition, input, `Quality gate ${status}.`, [
      artifact.artifactId
    ]);
    return result;
  }

  private saveResult(result: QualityGateResult): QualityGateResult {
    return this.repository.saveResult(QualityGateResultSchema.parse(result));
  }

  private append(
    type: "quality.started" | "quality.completed",
    definition: QualityGateDefinition,
    input: QualityGateRunInput,
    message: string,
    artifactRefs: string[]
  ): void {
    this.events?.appendEvent({
      eventId: makeId("evt", `${definition.gateId}-${type}-${Date.now()}-${Math.random()}`),
      timestamp: new Date().toISOString(),
      source: "core.quality.runner",
      severity: type === "quality.completed" ? "info" : "debug",
      type,
      projectId: input.projectId ?? definition.projectId,
      taskId: input.taskId,
      runId: input.runId,
      payloadSummary: { message, gateId: definition.gateId, name: definition.name },
      payloadRef: null,
      artifactRefs,
      policyDecisionRefs: [],
      redactionStatus: "not_applicable",
      degraded: [],
      schemaVersion: SCHEMA_VERSION
    });
  }

  private linkOrAppendCompleted(
    result: QualityGateResult,
    definition: QualityGateDefinition,
    input: QualityGateRunInput,
    message: string,
    artifactRefs: string[]
  ): void {
    if (input.runId && this.runLinks) {
      this.runLinks.linkResultToRun(input.runId, result.qualityGateResultId);
      return;
    }
    this.append("quality.completed", definition, input, message, artifactRefs);
  }
}

async function runShellCommand(command: string, cwd: string, timeoutMs = 120_000) {
  return new Promise<{
    exitCode: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
  }>((resolve) => {
    const child = spawn(command, { cwd, shell: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr, timedOut });
    });
  });
}

async function writeOutputArtifact(
  root: string,
  resultId: string,
  output: string
): Promise<string> {
  await mkdir(root, { recursive: true });
  const outputPath = path.join(root, `${resultId}.log`);
  await writeFile(outputPath, output, "utf8");
  return outputPath;
}

function lineCount(output: string): number {
  return output.length === 0 ? 0 : output.split(/\r?\n/).filter((line) => line.length > 0).length;
}
