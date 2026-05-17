import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import path from "path";

export function getPlanDirectory(): string {
  const dataHome = process.env.XDG_DATA_HOME || path.join(homedir(), ".local", "share");
  return path.join(dataHome, "opencode", "plans");
}

export type ValidatePlanPathResult = { ok: true; content: string } | { ok: false; error: string };

export function validatePlanPath(filePath: string, _planDir: string): ValidatePlanPathResult {
  if (!path.isAbsolute(filePath)) {
    return { ok: false, error: `Path must be absolute. Got: ${filePath}` };
  }

  if (!existsSync(filePath)) {
    return {
      ok: false,
      error: `No plan file found at ${filePath}. Create the file first, then call submit_plan.`,
    };
  }

  let content: string;
  try {
    content = readFileSync(filePath, "utf-8");
  } catch (error) {
    return {
      ok: false,
      error: `Could not read plan file at ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (!content.trim()) {
    return {
      ok: false,
      error: `Plan file at ${filePath} is empty. Write your plan content first, then call submit_plan.`,
    };
  }

  return { ok: true, content };
}

export function normalizeEditPermission(edit: string | Record<string, string> | undefined): Record<string, string> {
  if (typeof edit === "string") {
    return { "*": edit };
  }
  return edit ?? {};
}

export function stripConflictingPlanModeRules(systemEntries: string[]): string[] {
  return systemEntries
    .map((entry) =>
      cleanupSystemEntry(
        entry
          .split("\n")
          .filter((line) => !shouldStripPlanModeLine(line))
          .join("\n"),
      ),
    )
    .filter(Boolean);
}

function shouldStripPlanModeLine(line: string): boolean {
  const normalized = line.trim().toLowerCase();
  return (
    normalized.includes("strictly forbidden: any file edits") ||
    normalized.includes("your plan at ") ||
    normalized.includes("plan file already exists at ") ||
    normalized.includes(".opencode/plans/") ||
    normalized.includes("plan_exit") ||
    (normalized.includes("agent's conversation") && normalized.includes("not on disk"))
  );
}

function cleanupSystemEntry(entry: string): string {
  return entry
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
