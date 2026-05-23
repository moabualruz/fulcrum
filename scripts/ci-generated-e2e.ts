#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";

type GeneratedE2eRunner = "bun" | "playwright";

interface GeneratedE2eTraceLink {
  file: string;
  traceId: string | null;
  projectId: string | null;
  taskIds: string[];
  runIds: string[];
  artifactIds: string[];
  criteria: string[];
}

interface GeneratedE2eReport {
  status: "passed" | "failed" | "skipped";
  runner: GeneratedE2eRunner;
  command: string[];
  cwd: string | null;
  files: string[];
  exitCode: number | null;
  traceLinks: GeneratedE2eTraceLink[];
  stdout: string;
  stderr: string;
}

const rawRunner = process.env.FULCRUM_GENERATED_E2E_RUNNER ?? "bun";
const runner = parseRunner(rawRunner);
const files = parseFiles(process.env.FULCRUM_GENERATED_E2E_FILES);
const reportPath = process.env.FULCRUM_GENERATED_E2E_REPORT
  ?? join(tmpdir(), `fulcrum-generated-e2e-report-${Date.now()}.json`);

if (files.length === 0) {
  const report: GeneratedE2eReport = {
    status: "skipped",
    runner,
    command: [],
    cwd: null,
    files: [],
    exitCode: 0,
    traceLinks: [],
    stdout: "generated:e2e no generated E2E files configured\n",
    stderr: "",
  };
  await writeReport(reportPath, report);
  console.log(`generated:e2e no generated E2E files configured report=${reportPath}`);
  process.exit(0);
}

const command = runner === "playwright"
  ? { cmd: ["bun", "run", "web:e2e:generated", "--", ...files], cwd: "apps/web" }
  : { cmd: ["bun", "test", ...files], cwd: undefined };

const traceLinks = await Promise.all(files.map(readTraceLink));
const proc = spawn(command.cmd[0]!, command.cmd.slice(1), {
  cwd: command.cwd,
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
proc.stdout?.on("data", (chunk) => {
  const text = String(chunk);
  stdout += text;
  process.stdout.write(text);
});
proc.stderr?.on("data", (chunk) => {
  const text = String(chunk);
  stderr += text;
  process.stderr.write(text);
});

proc.on("exit", async (code) => {
  const exitCode = code ?? 1;
  const status = exitCode === 0 ? "passed" : "failed";
  const report: GeneratedE2eReport = {
    status,
    runner,
    command: command.cmd,
    cwd: command.cwd ?? null,
    files,
    exitCode,
    traceLinks,
    stdout,
    stderr,
  };
  await writeReport(reportPath, report);
  const traceSummary = traceLinks.flatMap((link) => link.traceId ? [link.traceId] : []);
  const criteriaCount = traceLinks.reduce((sum, link) => sum + link.criteria.length, 0);
  console.log(`generated:e2e report=${reportPath} status=${status} traces=${traceSummary.join(",") || "none"} criteria=${criteriaCount}`);
  if (exitCode !== 0) {
    console.error(`generated:e2e failed exit=${exitCode} runner=${runner} report=${reportPath}`);
    console.error("next: open report, inspect traceLinks, rerun listed command after fixing failed criterion");
  }
  process.exit(exitCode);
});

function parseRunner(value: string): GeneratedE2eRunner {
  if (value === "bun" || value === "playwright") return value;
  throw new Error(`invalid FULCRUM_GENERATED_E2E_RUNNER=${value}; expected bun|playwright`);
}

function parseFiles(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
      throw new Error("FULCRUM_GENERATED_E2E_FILES JSON must be an array of file paths");
    }
    return parsed;
  }
  return trimmed.split(delimiter).map((entry) => entry.trim()).filter(Boolean);
}

async function readTraceLink(file: string): Promise<GeneratedE2eTraceLink> {
  const body = await readFile(file, "utf8");
  const acceptedTrace = parseAcceptedTrace(body);
  const tasks = Array.isArray(acceptedTrace.tasks)
    ? acceptedTrace.tasks
    : acceptedTrace.task
      ? [acceptedTrace.task]
      : [];
  const coverageCases = Array.isArray(acceptedTrace.coverageCases) ? acceptedTrace.coverageCases : [];
  return {
    file,
    traceId: stringOrNull(acceptedTrace.traceId),
    projectId: stringOrNull(acceptedTrace.projectId),
    taskIds: uniqueStrings(tasks.map((task) => recordValue(task).id)),
    runIds: uniqueStrings([
      ...tasks.flatMap((task) => arrayValue(recordValue(task).runIds)),
      ...coverageCases.flatMap((coverage) => arrayValue(recordValue(coverage).runIds)),
    ]),
    artifactIds: uniqueStrings([
      ...tasks.flatMap((task) => arrayValue(recordValue(task).artifactIds)),
      ...coverageCases.flatMap((coverage) => arrayValue(recordValue(coverage).artifactIds)),
    ]),
    criteria: uniqueStrings([
      ...tasks.flatMap((task) => arrayValue(recordValue(task).successCriteria)),
      ...coverageCases.map((coverage) => recordValue(coverage).criterion),
    ]),
  };
}

function parseAcceptedTrace(body: string): Record<string, unknown> {
  const match = body.match(/const acceptedTrace = ([\s\S]*?) as const;/);
  if (!match?.[1]) return {};
  try {
    return JSON.parse(match[1]);
  } catch {
    return {};
  }
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function uniqueStrings(values: unknown[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.length > 0))];
}

async function writeReport(path: string, report: GeneratedE2eReport): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
