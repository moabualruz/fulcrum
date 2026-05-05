/**
 * Artifact harvest hook for sandbox-runner after_run (P4#12).
 *
 * Matches files in worktree against artifact glob, copies them to
 * workspace_root/artifacts/<run_id>/, ready for harvestArtifacts().
 */

import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { join, basename, relative } from "node:path";
import { ARTIFACT_RUN_EDGE_KIND } from "../artifacts/harvest.ts";

// Default artifact glob: dist/**, build/**, *.patch, *.diff
export const DEFAULT_ARTIFACT_GLOB = "dist/**,build/**,*.patch,*.diff";
export const RUN_ARTIFACT_EDGE_KIND = ARTIFACT_RUN_EDGE_KIND;

export interface ArtifactHarvestHookOutput {
  runId: string;
  extractedDir: string;
  sourceGlob: string;
  edgeKind: typeof RUN_ARTIFACT_EDGE_KIND;
}

/**
 * Match files in worktree against a comma-separated glob pattern string.
 * Returns absolute paths of matched files.
 */
export async function matchArtifactGlob(
  worktreePath: string,
  glob: string,
): Promise<string[]> {
  const patterns = glob.split(",").map((p) => p.trim()).filter(Boolean);
  const allFiles = await listFilesRecursive(worktreePath);
  const matched: string[] = [];

  for (const absolutePath of allFiles) {
    const rel = relative(worktreePath, absolutePath);
    if (matchesAny(rel, patterns)) {
      matched.push(absolutePath);
    }
  }

  return matched;
}

/**
 * Copy matched files to workspace_root/artifacts/<runId>/.
 * Returns the extraction directory path.
 */
export async function extractArtifacts(
  matchedFiles: string[],
  workspaceRoot: string,
  runId: string,
): Promise<string> {
  const extractedDir = join(workspaceRoot, "artifacts", runId);
  await mkdir(extractedDir, { recursive: true });

  for (const sourcePath of matchedFiles) {
    const destPath = join(extractedDir, basename(sourcePath));
    await copyFile(sourcePath, destPath);
  }

  return extractedDir;
}

export function artifactHarvestHookOutput(
  runId: string,
  extractedDir: string,
  sourceGlob = DEFAULT_ARTIFACT_GLOB,
): ArtifactHarvestHookOutput {
  return {
    runId,
    extractedDir,
    sourceGlob,
    edgeKind: RUN_ARTIFACT_EDGE_KIND,
  };
}

// ---------------------------------------------------------------------------
// Glob matching — simple pattern matching without external deps
// ---------------------------------------------------------------------------

function matchesAny(relativePath: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (matchesPattern(relativePath, pattern)) return true;
  }
  return false;
}

function matchesPattern(relativePath: string, pattern: string): boolean {
  // "dir/**" — matches any file under dir/
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return relativePath.startsWith(prefix + "/") || relativePath === prefix;
  }

  // "*.ext" — matches files with that extension at root level
  if (pattern.startsWith("*.")) {
    const ext = pattern.slice(1); // e.g. ".patch"
    return relativePath.endsWith(ext) && !relativePath.includes("/");
  }

  // Exact match
  return relativePath === pattern;
}

async function listFilesRecursive(dir: string): Promise<string[]> {
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(absolutePath)));
    } else if (entry.isFile()) {
      files.push(absolutePath);
    }
  }
  return files;
}
