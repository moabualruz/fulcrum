import { createRequire } from "node:module";
import { access } from "node:fs/promises";
import { simpleGit } from "simple-git";

const require = createRequire(import.meta.url);
const mimeTypes = require("mime-types") as {
  lookup(path: string): string | false;
  charset(type: string): string | false;
};

export interface GitStatus {
  branch: string | null;
  dirty: boolean;
  ahead: number;
  behind: number;
  staged: string[];
  unstaged: string[];
}

export interface GitBranch {
  name: string;
  headSha: string;
  isDefault: boolean;
  isCurrent: boolean;
}

export interface GitCommit {
  sha: string;
  authorName: string;
  authorEmail: string;
  committedAt: Date;
  subject: string;
  body: string;
  parents: string[];
}

export interface GitBlameLine {
  sha: string;
  author: string;
  line: string;
  lineNo: number;
}

export interface GitFileTreeEntry {
  path: string;
  kind: "file" | "dir";
  sizeBytes: number;
}

export interface GitFileContent {
  content: string | Buffer;
  mimeType: string;
}

export interface GitStash {
  index: number;
  message: string;
  sha: string;
}

export interface GitCommitLogOptions {
  branch?: string;
  maxCount: number;
  offset: number;
}

export interface GitFileTreeOptions {
  branch?: string;
  dir?: string;
}

/**
 * Typed simple-git wrapper for repository supervision.
 *
 * Fallback gate: prefer simple-git porcelain methods when they return stable
 * parsed data. Use `git.raw([...])` for read-only commands simple-git does not
 * parse into the shapes Fulcrum needs (`show --stat --patch`, porcelain blame,
 * `ls-tree -l`, `stash list --format`). If a future raw command needs brittle
 * terminal parsing or write-side semantics that simple-git cannot model, add a
 * narrow nodegit/libgit2 adapter for that single operation only.
 */

function gitAt(localPath: string) {
  return simpleGit({ baseDir: localPath });
}

export async function getStatus(localPath: string): Promise<GitStatus> {
  const status = await gitAt(localPath).status();
  const staged = new Set<string>();
  const unstaged = new Set<string>();

  for (const file of status.files) {
    const indexStatus = file.index.trim();
    if (indexStatus !== "" && indexStatus !== "?") {
      staged.add(file.path);
    }
    if (file.working_dir.trim() !== "") {
      unstaged.add(file.path);
    }
  }

  return {
    branch: status.current,
    dirty: !status.isClean(),
    ahead: status.ahead,
    behind: status.behind,
    staged: [...staged].sort(),
    unstaged: [...unstaged].sort(),
  };
}

export async function listBranches(localPath: string): Promise<GitBranch[]> {
  const git = gitAt(localPath);
  const defaultBranch = await resolveDefaultBranch(git.raw.bind(git));
  const current = (await git.raw(["branch", "--show-current"])).trim();
  const output = await git.raw([
    "for-each-ref",
    "--format=%(refname)\t%(objectname)",
    "refs/heads",
    "refs/remotes",
  ]);

  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawName = "", headSha = ""] = line.split("\t");
      const name = normalizeBranchName(rawName);
      return {
        name,
        headSha,
        isDefault: isDefaultBranch(name, defaultBranch),
        isCurrent: name === current,
      };
    })
    .filter((branch) => !branch.name.endsWith("/HEAD"))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function createBranch(localPath: string, name: string, from = "HEAD"): Promise<void> {
  const existing = await listBranches(localPath);
  if (existing.some((branch) => branch.name === name)) {
    throw new Error(`Branch already exists: ${name}`);
  }

  await gitAt(localPath).branch([name, from]);
}

export async function checkoutBranch(localPath: string, name: string): Promise<void> {
  await gitAt(localPath).checkout(name);
}

export async function deleteBranch(localPath: string, name: string, force = false): Promise<void> {
  await gitAt(localPath).deleteLocalBranch(name, force);
}

export async function getCommitLog(
  localPath: string,
  options: GitCommitLogOptions,
): Promise<GitCommit[]> {
  const args = [
    "log",
    `--max-count=${options.maxCount}`,
    `--skip=${options.offset}`,
    "--format=%H%x1f%an%x1f%ae%x1f%cI%x1f%s%x1f%b%x1f%P%x1e",
  ];
  if (options.branch) {
    args.push(options.branch);
  }

  const output = await gitAt(localPath).raw(args);
  return output
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [sha = "", authorName = "", authorEmail = "", committedAt = "", subject = "", body = "", parents = ""] =
        entry.split("\x1f");
      return {
        sha,
        authorName,
        authorEmail,
        committedAt: new Date(committedAt),
        subject,
        body: body.trim(),
        parents: parents === "" ? [] : parents.split(" "),
      };
    });
}

export async function getCommitDiff(localPath: string, sha: string): Promise<string> {
  return gitAt(localPath).raw(["show", "--stat", "--patch", sha]);
}

export async function getBlame(
  localPath: string,
  filePath: string,
  branch = "HEAD",
): Promise<GitBlameLine[]> {
  const output = await gitAt(localPath).raw(["blame", "--line-porcelain", branch, "--", filePath]);
  const lines: GitBlameLine[] = [];
  let current: { sha: string; author: string; lineNo: number } | undefined;

  for (const line of output.split("\n")) {
    const header = /^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/.exec(line);
    if (header) {
      current = {
        sha: header[1] ?? "",
        author: "",
        lineNo: Number(header[2] ?? "0"),
      };
      continue;
    }

    if (current && line.startsWith("author ")) {
      current.author = line.slice("author ".length);
      continue;
    }

    if (current && line.startsWith("\t")) {
      lines.push({
        sha: current.sha,
        author: current.author,
        line: line.slice(1),
        lineNo: current.lineNo,
      });
      current = undefined;
    }
  }

  return lines;
}

export async function getFileTree(
  localPath: string,
  options: GitFileTreeOptions = {},
): Promise<GitFileTreeEntry[]> {
  const branch = options.branch ?? "HEAD";
  const git = gitAt(localPath);
  const args = ["ls-tree", "-l", await resolveRef(git.raw.bind(git), branch)];
  if (options.dir) {
    args.push(`${options.dir.replace(/\/$/, "")}/`);
  }

  const output = await git.raw(args);
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^(\d+) (blob|tree) [0-9a-f]{40}\s+(-|\d+)\t(.+)$/.exec(line);
      if (!match) {
        throw new Error(`Unable to parse git ls-tree line: ${line}`);
      }

      return {
        path: match[4] ?? "",
        kind: match[2] === "tree" ? "dir" : "file",
        sizeBytes: match[3] === "-" ? 0 : Number(match[3]),
      };
    });
}

export async function getFileContent(
  localPath: string,
  filePath: string,
  branch = "HEAD",
): Promise<GitFileContent> {
  const mimeType = mimeTypes.lookup(filePath) || "application/octet-stream";
  const git = gitAt(localPath);
  const ref = await resolveRef(git.raw.bind(git), branch);
  const content = await git.binaryCatFile(["-p", `${ref}:${filePath}`]) as Buffer;

  if (isTextMimeType(mimeType)) {
    return {
      content: content.toString("utf8"),
      mimeType,
    };
  }

  return { content, mimeType };
}

export async function getStashList(localPath: string): Promise<GitStash[]> {
  const output = await gitAt(localPath).raw(["stash", "list", "--format=%gd%x1f%H%x1f%gs"]);
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [selector = "", sha = "", message = ""] = line.split("\x1f");
      const index = Number(/\{(\d+)\}/.exec(selector)?.[1] ?? "0");
      return { index, message, sha };
    });
}

export async function ensureMirror(remoteUrl: string, mirrorPath: string): Promise<void> {
  if (await pathExists(mirrorPath)) {
    await simpleGit({ baseDir: mirrorPath }).fetch(["--all", "--prune"]);
    return;
  }

  await simpleGit().clone(remoteUrl, mirrorPath, ["--mirror"]);
}

async function resolveDefaultBranch(raw: (args: string[]) => Promise<string>): Promise<string | undefined> {
  try {
    const output = await raw(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
    return normalizeBranchName(output.trim());
  } catch {
    try {
      const output = await raw(["symbolic-ref", "--short", "HEAD"]);
      return normalizeBranchName(output.trim());
    } catch {
      return undefined;
    }
  }
}

function normalizeBranchName(name: string): string {
  return name
    .replace(/^refs\/heads\//, "")
    .replace(/^refs\/remotes\//, "")
    .replace(/^remotes\//, "");
}

function isDefaultBranch(name: string, defaultBranch: string | undefined): boolean {
  if (!defaultBranch) {
    return false;
  }
  if (name === defaultBranch) {
    return true;
  }
  return !name.includes("/") && defaultBranch.endsWith(`/${name}`);
}

function isTextMimeType(mimeType: string): boolean {
  return mimeType.startsWith("text/") || Boolean(mimeTypes.charset(mimeType));
}

async function resolveRef(raw: (args: string[]) => Promise<string>, branch: string): Promise<string> {
  if (branch === "HEAD" || branch.startsWith("refs/") || /^[0-9a-f]{7,40}$/i.test(branch)) {
    return branch;
  }

  const localRef = `refs/heads/${branch}`;
  if (await refExists(raw, localRef)) {
    return localRef;
  }

  const remoteRef = `refs/remotes/${branch}`;
  if (await refExists(raw, remoteRef)) {
    return remoteRef;
  }

  return branch;
}

async function refExists(raw: (args: string[]) => Promise<string>, ref: string): Promise<boolean> {
  try {
    const output = await raw(["show-ref", "--verify", ref]);
    return output.trim() !== "";
  } catch {
    return false;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
