import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export interface RepoEvidenceInput {
  projectId: string;
  rootPath: string;
  ignoredPathPolicyId?: string;
  paths?: string[];
  limit?: number;
}

export interface RepoMapRef {
  path: string;
  sizeBytes: number;
  sourceRef: { type: "file"; uri: string; label: string };
}

export interface RepoMapEvidence {
  projectId: string;
  rootPath: string;
  generatedAt: string;
  state: "managed" | "degraded";
  freshness: "fresh";
  toolVersion: string;
  repoCommit?: string;
  configHash: string;
  ignoredPathBehavior: "honored";
  redactionStatus: "not_applicable";
  toolIdentity: "fulcrum.local-repo-map";
  cacheKey: string;
  invalidation: string[];
  limitations: string[];
  refs: RepoMapRef[];
}

export interface RepoPackEvidence {
  projectId: string;
  previewOnly: boolean;
  generatedAt: string;
  toolIdentity: "repomix" | "fulcrum.local-repo-pack";
  state: "managed" | "degraded";
  style: "json" | "plain";
  cacheKey: string;
  includedFiles: string[];
  sizeBytes: number;
  outputPath?: string;
  contentPreview?: string;
  sourceRefs: RepoMapRef["sourceRef"][];
  redactionStatus: "needs_review";
  limitations: string[];
}

export function buildRepoMapEvidence(input: RepoEvidenceInput): RepoMapEvidence {
  const limit = input.limit ?? 50;
  const rootExists = existsSync(input.rootPath);
  const refs = collectRepoRefs(input.rootPath, input.paths, limit);
  const repoCommit = readRepoCommit(input.rootPath);
  const limitations = [
    ...(rootExists ? [] : [`Project root missing: ${input.rootPath}.`]),
    ...(refs.length >= limit ? [`Limited to ${limit} files.`] : [])
  ];
  return {
    projectId: input.projectId,
    rootPath: input.rootPath,
    generatedAt: new Date().toISOString(),
    state: rootExists ? "managed" : "degraded",
    freshness: "fresh",
    toolVersion: "1.0",
    repoCommit,
    configHash: hashRepoConfig(input.rootPath, input.ignoredPathPolicyId),
    ignoredPathBehavior: "honored",
    redactionStatus: "not_applicable",
    toolIdentity: "fulcrum.local-repo-map",
    cacheKey: `${input.projectId}:${repoCommit ?? "local-uncommitted"}:${refs.length}`,
    invalidation: ["file_mtime", "path_rename", "ignored_path_policy"],
    limitations,
    refs
  };
}

export function buildRepoPackEvidence(
  input: RepoEvidenceInput & { previewOnly?: boolean; budgetBytes?: number }
): RepoPackEvidence {
  const repoMap = buildRepoMapEvidence({ ...input, limit: input.limit ?? 100 });
  const repomix = tryBuildRepomix(input.rootPath);
  if (repomix) {
    return {
      projectId: input.projectId,
      previewOnly: input.previewOnly ?? false,
      generatedAt: repoMap.generatedAt,
      toolIdentity: "repomix",
      state: "managed",
      style: "json",
      cacheKey: repoMap.cacheKey,
      includedFiles: repoMap.refs.map((ref) => ref.path),
      sizeBytes: repomix.sizeBytes,
      outputPath: repomix.outputPath,
      sourceRefs: repoMap.refs.map((ref) => ref.sourceRef),
      redactionStatus: "needs_review",
      limitations: repoMap.limitations
    };
  }

  const local = buildLocalPack(input.rootPath, repoMap.refs, input.budgetBytes ?? 512_000);
  return {
    projectId: input.projectId,
    previewOnly: input.previewOnly ?? false,
    generatedAt: repoMap.generatedAt,
    toolIdentity: "fulcrum.local-repo-pack",
    state: "degraded",
    style: "plain",
    cacheKey: repoMap.cacheKey,
    includedFiles: local.includedFiles,
    sizeBytes: Buffer.byteLength(local.contentPreview),
    contentPreview: local.contentPreview,
    sourceRefs: repoMap.refs.map((ref) => ref.sourceRef),
    redactionStatus: "needs_review",
    limitations: [
      "Repomix executable unavailable; generated local fallback pack.",
      ...repoMap.limitations,
      ...local.limitations
    ]
  };
}

function collectRepoRefs(
  rootPath: string,
  paths: string[] | undefined,
  limit: number
): RepoMapRef[] {
  const allowed =
    paths && paths.length > 0
      ? paths.map((item) => item.replaceAll("\\", "/").replace(/^\/+/, ""))
      : undefined;
  const refs: RepoMapRef[] = [];
  const visit = (directory: string): void => {
    if (!existsSync(directory) || refs.length >= limit) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (refs.length >= limit) return;
      if ([".git", ".fulcrum", "node_modules", "dist"].includes(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(rootPath, absolute).replaceAll(path.sep, "/");
      if (allowed && !isAllowedPathTraversal(relative, entry.isDirectory(), allowed)) continue;
      if (entry.isDirectory()) {
        visit(absolute);
        continue;
      }
      if (!entry.isFile()) continue;
      const stat = statSync(absolute);
      refs.push({
        path: relative,
        sizeBytes: stat.size,
        sourceRef: { type: "file", uri: absolute, label: relative }
      });
    }
  };
  visit(rootPath);
  return refs;
}

function isAllowedPathTraversal(
  relative: string,
  isDirectory: boolean,
  allowed: string[]
): boolean {
  if (relative === "") return true;
  return allowed.some((candidate) => {
    if (relative === candidate || relative.startsWith(`${candidate}/`)) return true;
    return isDirectory && candidate.startsWith(`${relative}/`);
  });
}

function tryBuildRepomix(rootPath: string): { outputPath: string; sizeBytes: number } | undefined {
  const outputPath = path.join(
    mkdtempSync(path.join(tmpdir(), "fulcrum-repomix-")),
    "repomix-output.json"
  );
  try {
    execFileSync("repomix", [rootPath, "--style", "json", "-o", outputPath], {
      cwd: rootPath,
      encoding: "utf8",
      timeout: 30_000,
      stdio: ["ignore", "pipe", "pipe"]
    });
    return { outputPath, sizeBytes: statSync(outputPath).size };
  } catch {
    return undefined;
  }
}

function buildLocalPack(
  rootPath: string,
  refs: RepoMapRef[],
  budgetBytes: number
): { contentPreview: string; includedFiles: string[]; limitations: string[] } {
  const chunks = ["# Fulcrum Local Repo Pack", ""];
  const includedFiles: string[] = [];
  let used = Buffer.byteLength(chunks.join("\n"));
  for (const ref of refs) {
    const absolute = path.join(rootPath, ref.path);
    let body: string;
    try {
      body = readFileSync(absolute, "utf8");
    } catch {
      continue;
    }
    if (typeof body !== "string") continue;
    const section = [`## ${ref.path}`, "", "```", body, "```", ""].join("\n");
    const sectionBytes = Buffer.byteLength(section);
    if (used + sectionBytes > budgetBytes) break;
    chunks.push(section);
    includedFiles.push(ref.path);
    used += sectionBytes;
  }
  return {
    contentPreview: chunks.join("\n"),
    includedFiles,
    limitations:
      includedFiles.length < refs.length
        ? [`Budget limited pack to ${includedFiles.length} files.`]
        : []
  };
}

function readRepoCommit(rootPath: string): string | undefined {
  try {
    return execFileSync("git", ["-C", rootPath, "rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return undefined;
  }
}

function hashRepoConfig(rootPath: string, ignoredPathPolicyId?: string): string {
  const hash = createHash("sha256");
  hash.update(ignoredPathPolicyId ?? "");
  for (const name of [".gitignore", ".ignore", ".fulcrumignore", ".repomixignore"]) {
    try {
      hash.update(name);
      hash.update(readFileSync(path.join(rootPath, name)));
    } catch {
      // Missing ignore files are expected.
    }
  }
  return hash.digest("hex");
}
