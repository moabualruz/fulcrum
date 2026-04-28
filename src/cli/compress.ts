// Compress markdown files using caveman CLI.
// Wraps scripts/compress-with-caveman.sh logic in TypeScript.

import { exists } from "../utils/proc.ts";
import { spawnSync } from "bun";

const HELP = `fulcrum compress — compress markdown files with caveman

Usage:
  fulcrum compress                     Compress default targets (see below).
  fulcrum compress <file> [...]       Compress explicit files.
  fulcrum compress --check            Dry-run; exit 1 if any pending compression.
  fulcrum compress --help             This message.

Default targets (if no files given):
  - skills/*/SKILL.md (excluding _template)
  - rules/AGENTS.md (if present)
  - ./AGENTS.md (if present)
  - skills/SOURCES.md (if present)
  - docs/*.md (excluding README.md, HANDOVER.md, *.original.md)

Idempotent: files with .original.md siblings are skipped (already compressed).
`;

interface CompressOptions {
  checkMode: boolean;
  targets: string[];
}

export async function run(args: string[]): Promise<void> {
  // Show help if requested
  if (args.includes("--help") || args.includes("-h")) {
    console.log(HELP);
    return;
  }

  // Parse arguments
  const opts = parseArgs(args);

  // Resolve caveman compress directory
  const compressDir = await resolveCavemanCompressDir();
  if (!compressDir) {
    console.error("Caveman not installed. Install with: claude plugin install caveman@caveman");
    process.exit(1);
  }

  // Collect target files
  let targets = opts.targets;
  if (targets.length === 0) {
    targets = await getDefaultTargets();
  }

  // Resolve to absolute paths and filter
  const resolvedTargets = await resolveAndFilterTargets(targets);

  // Process each target
  let pendingCount = 0;
  let compressedCount = 0;
  let skippedCount = 0;

  for (const target of resolvedTargets) {
    const backupFile = target.replace(/\.md$/, ".original.md");
    const backupExists = await exists(backupFile);

    if (backupExists) {
      // Already compressed
      console.log(`SKIP ${target} (already compressed)`);
      skippedCount++;
      continue;
    }

    // File needs compression
    if (opts.checkMode) {
      console.log(`PENDING ${target}`);
      pendingCount++;
    } else {
      // Perform compression
      try {
        const result = spawnSync(["python3", "-m", "scripts", target], {
          cwd: compressDir,
          stdout: "ignore",
          stderr: "ignore",
        });

        if (result.success) {
          console.log(`COMPRESS ${target}`);
          compressedCount++;
        } else {
          console.error(`ERROR: Failed to compress ${target}`);
          process.exit(1);
        }
      } catch (err) {
        console.error(`ERROR: Failed to compress ${target}`);
        process.exit(1);
      }
    }
  }

  // Exit with appropriate code
  if (opts.checkMode) {
    process.exit(pendingCount > 0 ? 1 : 0);
  } else {
    process.exit(0);
  }
}

function parseArgs(args: string[]): CompressOptions {
  const checkMode = args.includes("--check");
  const targets = args.filter((arg) => arg !== "--check" && arg !== "--help" && arg !== "-h");
  return { checkMode, targets };
}

async function resolveCavemanCompressDir(): Promise<string | null> {
  const homeDir = process.env.HOME || "";
  const cavemanBase = `${homeDir}/.claude/plugins/cache/caveman/caveman`;

  const baseExists = await exists(cavemanBase);
  if (!baseExists) {
    return null;
  }

  // Find the hash subdirectory (should be exactly one)
  try {
    const proc = Bun.spawn(["ls", "-1", cavemanBase], {
      stdout: "pipe",
      stderr: "ignore",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;

    const hashDir = output.trim().split("\n")[0];
    if (!hashDir) {
      return null;
    }

    const compressDir = `${cavemanBase}/${hashDir}/skills/compress`;
    const compressExists = await exists(compressDir);
    return compressExists ? compressDir : null;
  } catch {
    return null;
  }
}

async function getDefaultTargets(): Promise<string[]> {
  const targets: string[] = [];

  // skills/*/SKILL.md (excluding _template)
  try {
    const proc = Bun.spawn(
      [
        "find",
        "skills",
        "-maxdepth",
        "2",
        "-name",
        "SKILL.md",
        "!",
        "-path",
        "skills/_template/*",
      ],
      {
        stdout: "pipe",
        stderr: "ignore",
      }
    );
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    targets.push(
      ...output
        .trim()
        .split("\n")
        .filter((f) => f)
    );
  } catch {}

  // rules/AGENTS.md
  if (await exists("rules/AGENTS.md")) {
    targets.push("rules/AGENTS.md");
  }

  // ./AGENTS.md
  if (await exists("AGENTS.md")) {
    targets.push("AGENTS.md");
  }

  // skills/SOURCES.md
  if (await exists("skills/SOURCES.md")) {
    targets.push("skills/SOURCES.md");
  }

  // docs/*.md (excluding README.md, HANDOVER.md, *.original.md)
  try {
    const proc = Bun.spawn(
      [
        "find",
        "docs",
        "-maxdepth",
        "1",
        "-name",
        "*.md",
        "!",
        "-name",
        "README.md",
        "!",
        "-name",
        "HANDOVER.md",
        "!",
        "-name",
        "*.original.md",
      ],
      {
        stdout: "pipe",
        stderr: "ignore",
      }
    );
    const output = await new Response(proc.stdout).text();
    await proc.exited;
    targets.push(
      ...output
        .trim()
        .split("\n")
        .filter((f) => f)
    );
  } catch {}

  return targets;
}

async function resolveAndFilterTargets(targets: string[]): Promise<string[]> {
  const resolved: string[] = [];

  for (let target of targets) {
    // Resolve to absolute path
    if (!target.startsWith("/")) {
      try {
        const proc = Bun.spawn(["sh", "-c", `cd "${target.replace(/"/g, '\\"')}" 2>/dev/null && pwd || echo`], {
          stdout: "pipe",
          stderr: "ignore",
        });
        const dir = await new Response(proc.stdout).text();
        await proc.exited;
        const dirPath = dir.trim();
        if (dirPath) {
          target = `${dirPath}/${target.split("/").pop()}`;
        }
      } catch {
        continue;
      }
    }

    // Skip if file doesn't exist
    if (!(await exists(target))) {
      continue;
    }

    // Skip if in excluded directories
    if (target.match(/(dist|node_modules|eval-results)\//) ||
        target.endsWith("HANDOVER.md") ||
        target.endsWith("README.md")) {
      continue;
    }

    resolved.push(target);
  }

  return resolved;
}
