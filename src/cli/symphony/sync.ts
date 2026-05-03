/**
 * fulcrum symphony sync [--daily] [--json]
 *
 * 1. git submodule update --remote vendor/openai-symphony
 * 2. Compare SPEC.md SHA against .symphony-spec.lock; exit 0 if unchanged
 * 3. If changed: capture diff, run conformance suite, write drift report
 * 4. Exit non-zero if SPEC hash changed
 * 5. When FULCRUM_FEATURES=router-llm: append LLM-narrated summary (gated)
 *
 * Exposed as graphile-worker daily cron job `symphony:daily-sync` (4 AM local).
 */

import { createHash } from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncResult {
  driftDetected: boolean;
  reportPath: string | null;
  conformancePassed: boolean;
  specMissing: boolean;
}

// ---------------------------------------------------------------------------
// Lock file helpers
// ---------------------------------------------------------------------------

const LOCK_FILE = ".symphony-spec.lock";

export function computeSpecHash(specPath: string): string | null {
  if (!existsSync(specPath)) return null;
  const content = readFileSync(specPath);
  return createHash("sha256").update(content).digest("hex");
}

export function readLockHash(projectRoot: string): string | null {
  const lockPath = join(projectRoot, LOCK_FILE);
  if (!existsSync(lockPath)) return null;
  return readFileSync(lockPath, "utf-8").trim();
}

export function writeLockHash(projectRoot: string, hash: string): void {
  writeFileSync(join(projectRoot, LOCK_FILE), hash + "\n");
}

// ---------------------------------------------------------------------------
// Diff helpers
// ---------------------------------------------------------------------------

function captureDiff(projectRoot: string): string {
  // Prefer difft (syntax-aware); fall back to git diff
  try {
    const specPath = join(projectRoot, "vendor", "openai-symphony", "SPEC.md");
    return execSync(`difft --display side-by-side-show-both "${specPath}"`, {
      cwd: projectRoot,
      encoding: "utf-8",
      timeout: 30_000,
    });
  } catch {
    try {
      return execSync(
        "git diff --unified=5 HEAD~1 -- vendor/openai-symphony/SPEC.md",
        { cwd: projectRoot, encoding: "utf-8", timeout: 30_000 },
      );
    } catch {
      return "(diff unavailable)";
    }
  }
}

// ---------------------------------------------------------------------------
// Conformance runner stub
// ---------------------------------------------------------------------------

function runConformanceSuite(projectRoot: string): boolean {
  // Delegates to the conformance suite (P3#14/P3#15).
  // Returns true if suite passes, false otherwise.
  try {
    execSync("bun test src/cli/symphony/conformance", {
      cwd: projectRoot,
      encoding: "utf-8",
      timeout: 120_000,
      stdio: "pipe",
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// LLM narration (feature-gated)
// ---------------------------------------------------------------------------

function isRouterLlmEnabled(): boolean {
  const features = process.env["FULCRUM_FEATURES"] ?? "";
  return features.split(",").some((f) => f.trim() === "router-llm");
}

function appendLlmNarration(reportPath: string, _diffOutput: string): void {
  // Gated: only when FULCRUM_FEATURES=router-llm
  if (!isRouterLlmEnabled()) return;
  // Placeholder: would call inference sidecar to narrate diff
  const narration = "\n## LLM Drift Summary\n\n(LLM narration pending inference sidecar integration)\n";
  const existing = readFileSync(reportPath, "utf-8");
  writeFileSync(reportPath, existing + narration);
}

// ---------------------------------------------------------------------------
// Drift report
// ---------------------------------------------------------------------------

export function writeDriftReport(
  reportsDir: string,
  oldHash: string,
  newHash: string,
  diffOutput: string,
): string {
  mkdirSync(reportsDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const reportPath = join(reportsDir, `symphony-drift-${date}.md`);
  const content = `# Symphony SPEC Drift Report — ${date}

## Hashes
- Previous: \`${oldHash}\`
- Current:  \`${newHash}\`

## Diff
\`\`\`
${diffOutput}
\`\`\`
`;
  writeFileSync(reportPath, content);
  return reportPath;
}

// ---------------------------------------------------------------------------
// Core: detectDrift (pure-ish, testable without git)
// ---------------------------------------------------------------------------

export function detectDrift(
  projectRoot: string,
  opts?: { skipConformance?: boolean },
): SyncResult {
  const specPath = join(projectRoot, "vendor", "openai-symphony", "SPEC.md");
  const currentHash = computeSpecHash(specPath);

  if (currentHash === null) {
    return { driftDetected: false, reportPath: null, conformancePassed: true, specMissing: true };
  }

  const lockHash = readLockHash(projectRoot);

  // No drift
  if (lockHash === currentHash) {
    return { driftDetected: false, reportPath: null, conformancePassed: true, specMissing: false };
  }

  // Drift detected
  const diffOutput = captureDiff(projectRoot);
  const reportsDir = join(projectRoot, ".fulcrum", "reports");
  const reportPath = writeDriftReport(reportsDir, lockHash ?? "(none)", currentHash, diffOutput);

  // Conformance
  const conformancePassed = opts?.skipConformance
    ? true
    : runConformanceSuite(projectRoot);

  // Update lock
  writeLockHash(projectRoot, currentHash);

  // LLM narration (gated)
  appendLlmNarration(reportPath, diffOutput);

  return { driftDetected: true, reportPath, conformancePassed, specMissing: false };
}

// ---------------------------------------------------------------------------
// Submodule update
// ---------------------------------------------------------------------------

function updateSubmodule(projectRoot: string): void {
  execSync("git submodule update --remote vendor/openai-symphony", {
    cwd: projectRoot,
    encoding: "utf-8",
    timeout: 60_000,
    stdio: "pipe",
  });
}

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

export async function run(args: string[]): Promise<void> {
  const isJson = args.includes("--json");
  const isDaily = args.includes("--daily");
  const projectRoot = process.cwd();

  // Step 1: submodule update (skip in test / when vendor dir missing)
  const vendorDir = join(projectRoot, "vendor", "openai-symphony");
  if (existsSync(join(projectRoot, ".gitmodules"))) {
    try {
      updateSubmodule(projectRoot);
    } catch (e) {
      if (!isJson) {
        console.error("warn: submodule update failed:", (e as Error).message);
      }
    }
  }

  // Step 2–4: detect drift
  const result = detectDrift(projectRoot);

  if (isJson) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.specMissing) {
    console.log("symphony sync: SPEC.md not found at vendor/openai-symphony/SPEC.md");
  } else if (!result.driftDetected) {
    console.log("symphony sync: no drift detected");
  } else {
    console.log(`symphony sync: drift detected — report at ${result.reportPath}`);
    if (!result.conformancePassed) {
      console.log("symphony sync: conformance suite FAILED");
    }
  }

  // Exit non-zero if drift detected
  if (result.driftDetected) {
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// Job registry entry for graphile-worker daily cron
// ---------------------------------------------------------------------------

export const DAILY_SYNC_JOB = {
  identifier: "symphony:daily-sync",
  cron: "0 4 * * *", // 4 AM local
  handler: async () => {
    const result = detectDrift(process.cwd());
    return result;
  },
} as const;
