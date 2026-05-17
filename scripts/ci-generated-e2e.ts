#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { delimiter } from "node:path";

type GeneratedE2eRunner = "bun" | "playwright";

const rawRunner = process.env.FULCRUM_GENERATED_E2E_RUNNER ?? "bun";
const runner = parseRunner(rawRunner);
const files = parseFiles(process.env.FULCRUM_GENERATED_E2E_FILES);

if (files.length === 0) {
  console.log("generated:e2e no generated E2E files configured");
  process.exit(0);
}

const command = runner === "playwright"
  ? { cmd: ["bun", "run", "web:e2e:generated", "--", ...files], cwd: "apps/web" }
  : { cmd: ["bun", "test", ...files], cwd: undefined };

const proc = spawn(command.cmd[0]!, command.cmd.slice(1), {
  cwd: command.cwd,
  env: process.env,
  stdio: "inherit",
});

proc.on("exit", (code) => process.exit(code ?? 1));

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
