import { error } from "@sveltejs/kit";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PageServerLoad } from "./$types";
import { openDatabase, getDefaultOrgId } from "$lib/server/db";

const execFileAsync = promisify(execFile);

const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "svg", "ico",
  "woff", "woff2", "ttf", "eot",
  "zip", "tar", "gz", "bz2", "7z",
  "pdf", "doc", "docx", "xls", "xlsx",
  "mp3", "mp4", "ogg", "webm",
  "exe", "dll", "so", "dylib",
]);

export type FileTreeNode =
  | { kind: "file"; name: string; path: string; ext: string; binary: boolean }
  | { kind: "dir"; name: string; path: string; children: FileTreeNode[] };

async function listTree(rootPath: string, subPath: string, maxDepth: number): Promise<FileTreeNode[]> {
  const absPath = subPath ? join(rootPath, subPath) : rootPath;
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
        "-C", rootPath, "cat-file", "-t", `HEAD:${entry}`,
      ]).catch(() => ({ stdout: "blob" }));
      const objType = typeOut.trim();
      if (objType === "tree") {
        const children = maxDepth > 1
          ? await listTree(rootPath, entry, maxDepth - 1)
          : [];
        nodes.push({ kind: "dir", name, path: entry, children });
      } else {
        const extMatch = name.match(/\.([^.]+)$/);
        const ext = extMatch ? extMatch[1]!.toLowerCase() : "";
        nodes.push({
          kind: "file",
          name,
          path: entry,
          ext,
          binary: BINARY_EXTENSIONS.has(ext),
        });
      }
    }
    return nodes;
  } catch {
    return [];
  }
}

async function getFileContent(rootPath: string, filePath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", [
      "-C", rootPath, "show", `HEAD:${filePath}`,
    ]);
    return stdout;
  } catch {
    return null;
  }
}

function isoStamp(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

export const load: PageServerLoad = ({ params, url, locals }) => {
  const filePath = url.searchParams.get("path") ?? "";
  return {
    activeProjectId: locals?.activeProjectId ?? null,
    filePath,
    streamed: {
      data: (async () => {
        const db = await openDatabase();
        try {
          const orgId = await getDefaultOrgId(db);
          const rows = await db.query<{
            id: string;
            slug: string;
            root_path: string;
            default_branch: string | null;
            last_seen_at: string | Date;
          }>(
            `SELECT id, slug, root_path, default_branch, last_seen_at
               FROM repos WHERE id = $1 AND org_id = $2`,
            [params.id, orgId],
          );
          if (rows.length === 0) throw error(404, "Repo not found");
          const raw = rows[0]!;
          const repo = { ...raw, last_seen_at: isoStamp(raw.last_seen_at) };

          const tree = await listTree(repo.root_path, "", 1);

          let fileContent: string | null = null;
          let isBinary = false;
          if (filePath) {
            const extMatch = filePath.match(/\.([^.]+)$/);
            const ext = extMatch ? extMatch[1]!.toLowerCase() : "";
            isBinary = BINARY_EXTENSIONS.has(ext);
            if (!isBinary) {
              fileContent = await getFileContent(repo.root_path, filePath);
            }
          }

          return { repo, tree, filePath, fileContent, isBinary };
        } finally {
          await db.close();
        }
      })(),
    },
  };
};
