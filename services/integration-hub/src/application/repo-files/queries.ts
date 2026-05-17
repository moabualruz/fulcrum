import type { EntityManager } from "typeorm";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { RepoBlameLine } from "@integration-hub/infrastructure/database/entities/repos/RepoBlameLine.ts";
import { RepoTreeEntry } from "@integration-hub/infrastructure/database/entities/repos/RepoTreeEntry.ts";
import { AppNotFoundError } from "@platform-core/domain/errors.ts";
import { getRepo } from "@integration-hub/application/repos/queries.ts";
import type { AppContext } from "@integration-hub/domain/repository.ts";

const execFileAsync = promisify(execFile);

export interface RepoFileRow {
  id: string;
  repo_id: string;
  branch: string;
  path: string;
  kind: "file" | "directory" | string;
  mime: string | null;
  size_bytes: number | null;
  sha: string | null;
  parent_path: string | null;
  depth: number;
  created_at: string;
  updated_at: string;
}

export interface RepoFileBlameRow {
  id: string;
  repo_id: string;
  branch: string;
  path: string;
  line_number: number;
  commit_sha: string;
  author: string;
  author_date: string;
  line_content: string;
}

export interface RepoFileContentRow {
  id: string;
  repo_id: string;
  branch: string;
  path: string;
  content: string | null;
  is_binary: boolean;
  encoding: string | null;
  created_at: string;
}

/** Determine MIME category for rendering decision. */
export function fileMimeCategory(
  mime: string | null,
  path: string,
): "image" | "text" | "binary" {
  if (mime?.startsWith("image/")) return "image";
  if (mime?.startsWith("text/")) return "text";

  // Infer from extension
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const textExts = new Set([
    "ts", "tsx", "js", "jsx", "mjs", "cjs",
    "json", "jsonc", "yaml", "yml", "toml",
    "md", "mdx", "txt", "csv", "tsv",
    "html", "htm", "css", "scss", "less",
    "xml", "svg", "sql", "sh", "bash", "zsh",
    "py", "rb", "rs", "go", "java", "kt", "swift",
    "c", "cpp", "h", "hpp", "cs", "php",
    "vue", "svelte", "astro",
    "dockerfile", "makefile", "justfile",
    "env", "gitignore", "editorconfig",
    "lock", "sum",
  ]);
  const imageExts = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp"]);

  if (imageExts.has(ext)) return "image";
  if (textExts.has(ext)) return "text";

  // Fallback: if content is available and non-null, treat as text
  return "binary";
}

/** Map file extension to Shiki language id. */
export function shikiLangFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    mjs: "javascript", cjs: "javascript",
    json: "json", jsonc: "jsonc", yaml: "yaml", yml: "yaml",
    toml: "toml", md: "markdown", mdx: "mdx",
    html: "html", htm: "html", css: "css", scss: "scss", less: "less",
    xml: "xml", svg: "xml", sql: "sql",
    sh: "bash", bash: "bash", zsh: "bash",
    py: "python", rb: "ruby", rs: "rust", go: "go",
    java: "java", kt: "kotlin", swift: "swift",
    c: "c", cpp: "cpp", h: "c", hpp: "cpp", cs: "csharp", php: "php",
    vue: "vue", svelte: "svelte", astro: "astro",
    dockerfile: "dockerfile", makefile: "makefile",
    txt: "text",
  };
  return map[ext] ?? "text";
}

export type FileTreeNode =
  | { kind: "file"; name: string; path: string; ext: string; binary: boolean }
  | { kind: "dir"; name: string; path: string; children: FileTreeNode[] };

const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "ico",
  "woff", "woff2", "ttf", "eot",
  "zip", "tar", "gz", "bz2", "7z",
  "pdf", "doc", "docx", "xls", "xlsx",
  "mp3", "mp4", "ogg", "webm",
  "exe", "dll", "so", "dylib",
]);

export async function getRepoFilesPage(
  em: EntityManager,
  ctx: AppContext,
  input: { repoId: string; filePath: string },
): Promise<{ repo: { id: string; slug: string; root_path: string | null; default_branch: string | null; last_seen_at: string }; tree: FileTreeNode[]; filePath: string; fileContent: string | null; isBinary: boolean }> {
  const repo = await getRepo(em, ctx, input.repoId);
  const tree = await listGitTree(repo.localPath, "", 1);
  const ext = extension(input.filePath);
  const isBinary = input.filePath ? BINARY_EXTENSIONS.has(ext) : false;
  const fileContent = input.filePath && !isBinary ? await readGitFile(repo.localPath, input.filePath) : null;
  return {
    repo: {
      id: repo.id,
      slug: repo.slug,
      root_path: repo.localPath,
      default_branch: repo.defaultBranch ?? null,
      last_seen_at: isoStamp(repo.lastSyncAt) ?? "",
    },
    tree,
    filePath: input.filePath,
    fileContent,
    isBinary,
  };
}

export async function getRepoFileDetailPage(
  em: EntityManager,
  ctx: AppContext,
  input: { repoId: string; branch?: string; filePath: string; showBlame: boolean },
): Promise<{
  repo: { id: string; slug: string; root_path: string | null; default_branch: string | null };
  branch: string;
  branches: string[];
  fileEntry: RepoFileRow;
  filePath: string;
  mimeCategory: "image" | "text" | "binary";
  lang: string;
  content: string | null;
  isBinary: boolean;
  showBlame: boolean;
  blame: RepoFileBlameRow[];
}> {
  const repo = await getRepo(em, ctx, input.repoId);
  const activeBranch = input.branch ?? repo.defaultBranch ?? "main";
  const branches = await listIndexedBranches(em, ctx, repo.id);
  const fileEntry = await getFileByPath(em, ctx, repo.id, activeBranch, input.filePath);
  if (!fileEntry) throw new AppNotFoundError("File not found");
  const mimeCategory = fileMimeCategory(fileEntry.mime, input.filePath);
  const lang = shikiLangFromPath(input.filePath);
  const contentRow = mimeCategory !== "binary" ? await getFileContent(em, ctx, repo.id, activeBranch, input.filePath) : null;
  const isBinary = mimeCategory === "binary" || contentRow?.is_binary === true;
  return {
    repo: { id: repo.id, slug: repo.slug, root_path: repo.localPath, default_branch: repo.defaultBranch ?? null },
    branch: activeBranch,
    branches,
    fileEntry,
    filePath: input.filePath,
    mimeCategory,
    lang,
    content: contentRow?.content ?? null,
    isBinary,
    showBlame: input.showBlame,
    blame: input.showBlame && !isBinary ? await getBlameForFile(em, ctx, repo.id, activeBranch, input.filePath) : [],
  };
}

export async function listTreeChildren(
  em: EntityManager,
  ctx: AppContext,
  repoId: string,
  branch: string,
  parentPath: string | null,
): Promise<RepoFileRow[]> {
  await getRepo(em, ctx, repoId);
  const rows = await em.find(RepoTreeEntry, { where: { org: { id: ctx.orgId }, repo: repoId } as never, order: { kind: "ASC", path: "ASC" } });
  return rows
    .map((row) => serializeTreeEntry(row, branch))
    .filter((row) => row.parent_path === parentPath);
}

export async function getFileByPath(
  em: EntityManager,
  ctx: AppContext,
  repoId: string,
  branch: string,
  path: string,
): Promise<RepoFileRow | null> {
  await getRepo(em, ctx, repoId);
  const row = await em.findOne(RepoTreeEntry, { where: { org: { id: ctx.orgId }, repo: { id: repoId }, path } as never });
  return row ? serializeTreeEntry(row, branch) : null;
}

export async function getFileContent(
  em: EntityManager,
  ctx: AppContext,
  repoId: string,
  branch: string,
  path: string,
): Promise<RepoFileContentRow | null> {
  await getRepo(em, ctx, repoId);
  const row = await em.findOne(RepoTreeEntry, { where: { org: { id: ctx.orgId }, repo: { id: repoId }, path } as never });
  if (!row) return null;
  const payload = row.payload ?? {};
  const content = typeof payload["content"] === "string" ? payload["content"] : null;
  return {
    id: row.id,
    repo_id: row.repo.id,
    branch,
    path: row.path,
    content,
    is_binary: payload["isBinary"] === true || payload["is_binary"] === true || fileMimeCategory(typeof payload["mime"] === "string" ? payload["mime"] : null, row.path) === "binary",
    encoding: typeof payload["encoding"] === "string" ? payload["encoding"] : "utf-8",
    created_at: row.createdAt.toISOString(),
  };
}

export async function getBlameForFile(
  em: EntityManager,
  ctx: AppContext,
  repoId: string,
  branch: string,
  path: string,
): Promise<RepoFileBlameRow[]> {
  await getRepo(em, ctx, repoId);
  const rows = await em.find(RepoBlameLine, { where: { org: { id: ctx.orgId }, repo: { id: repoId }, path } as never, order: { lineNumber: "ASC" } });
  return rows.map((row) => ({
    id: row.id,
    repo_id: row.repo.id,
    branch,
    path: row.path,
    line_number: row.lineNumber,
    commit_sha: row.commitSha,
    author: row.authorName,
    author_date: row.committedAt.toISOString(),
    line_content: "",
  }));
}

export async function listIndexedBranches(em: EntityManager, ctx: AppContext, repoId: string): Promise<string[]> {
  const repo = await getRepo(em, ctx, repoId);
  const commitRows = await em.find(RepoTreeEntry, { where: { org: { id: ctx.orgId }, repo: repoId } as never, order: { commitSha: "ASC" } });
  const branches = new Set(commitRows.map((row) => row.commitSha).filter(Boolean));
  if (repo.defaultBranch) branches.add(repo.defaultBranch);
  if (repo.currentBranch) branches.add(repo.currentBranch);
  return [...branches].sort();
}

async function listGitTree(rootPath: string | null | undefined, subPath: string, maxDepth: number): Promise<FileTreeNode[]> {
  if (!rootPath) return [];
  try {
    const args = subPath
      ? ["-C", rootPath, "ls-tree", "--name-only", "HEAD", `${subPath}/`]
      : ["-C", rootPath, "ls-tree", "--name-only", "HEAD"];
    const { stdout } = await execFileAsync("git", args);
    const entries = stdout.trim().split("\n").filter(Boolean);
    const nodes: FileTreeNode[] = [];
    for (const entry of entries) {
      const name = entry.split("/").pop() ?? entry;
      const { stdout: typeOut } = await execFileAsync("git", [
        "-C", rootPath,
        "cat-file",
        "-t",
        `HEAD:${entry}`,
      ]).catch(() => ({ stdout: "blob" }));
      if (typeOut.trim() === "tree") {
        nodes.push({ kind: "dir", name, path: entry, children: maxDepth > 1 ? await listGitTree(rootPath, entry, maxDepth - 1) : [] });
      } else {
        const ext = extension(name);
        nodes.push({ kind: "file", name, path: entry, ext, binary: BINARY_EXTENSIONS.has(ext) });
      }
    }
    return nodes;
  } catch {
    return [];
  }
}

async function readGitFile(rootPath: string | null | undefined, filePath: string): Promise<string | null> {
  if (!rootPath) return null;
  try {
    const { stdout } = await execFileAsync("git", ["-C", rootPath, "show", `HEAD:${filePath}`]);
    return stdout;
  } catch {
    return null;
  }
}

function serializeTreeEntry(row: RepoTreeEntry, branch: string): RepoFileRow {
  const payload = row.payload ?? {};
  return {
    id: row.id,
    repo_id: row.repo.id,
    branch,
    path: row.path,
    kind: row.kind === "dir" ? "directory" : row.kind,
    mime: typeof payload["mime"] === "string" ? payload["mime"] : null,
    size_bytes: row.size ?? null,
    sha: row.contentHash ?? null,
    parent_path: parentPath(row.path),
    depth: row.path.split("/").filter(Boolean).length - 1,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

function parentPath(path: string): string | null {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join("/");
}

function extension(path: string): string {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

function isoStamp(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}
