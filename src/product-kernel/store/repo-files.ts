import type { ProductDb } from "../db/types.ts";
import { newUlid } from "../ids.ts";

export interface RepoFileRow {
  id: string;
  repo_id: string;
  branch: string;
  path: string;
  kind: "file" | "directory";
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

export interface InsertRepoFileInput {
  repoId: string;
  branch: string;
  path: string;
  kind: "file" | "directory";
  mime?: string | null;
  sizeBytes?: number | null;
  sha?: string | null;
  parentPath?: string | null;
  depth?: number;
}

export async function insertRepoFile(
  db: ProductDb,
  input: InsertRepoFileInput,
): Promise<RepoFileRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO repo_files_index
       (id, repo_id, branch, path, kind, mime, size_bytes, sha, parent_path, depth)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (repo_id, branch, path)
     DO UPDATE SET kind=$5, mime=$6, size_bytes=$7, sha=$8, parent_path=$9,
                   depth=$10, updated_at=now()`,
    [
      id,
      input.repoId,
      input.branch,
      input.path,
      input.kind,
      input.mime ?? null,
      input.sizeBytes ?? null,
      input.sha ?? null,
      input.parentPath ?? null,
      input.depth ?? 0,
    ],
  );
  const rows = await db.query<RepoFileRow>(
    `SELECT * FROM repo_files_index WHERE repo_id=$1 AND branch=$2 AND path=$3`,
    [input.repoId, input.branch, input.path],
  );
  return rows[0]!;
}

/** List children of a directory (or root when parentPath is null). */
export async function listTreeChildren(
  db: ProductDb,
  repoId: string,
  branch: string,
  parentPath: string | null,
): Promise<RepoFileRow[]> {
  if (parentPath === null) {
    return db.query<RepoFileRow>(
      `SELECT * FROM repo_files_index
       WHERE repo_id=$1 AND branch=$2 AND parent_path IS NULL
       ORDER BY kind ASC, path ASC`,
      [repoId, branch],
    );
  }
  return db.query<RepoFileRow>(
    `SELECT * FROM repo_files_index
     WHERE repo_id=$1 AND branch=$2 AND parent_path=$3
     ORDER BY kind ASC, path ASC`,
    [repoId, branch, parentPath],
  );
}

/** Get a single file entry by path. */
export async function getFileByPath(
  db: ProductDb,
  repoId: string,
  branch: string,
  path: string,
): Promise<RepoFileRow | null> {
  const rows = await db.query<RepoFileRow>(
    `SELECT * FROM repo_files_index WHERE repo_id=$1 AND branch=$2 AND path=$3`,
    [repoId, branch, path],
  );
  return rows[0] ?? null;
}

export interface InsertFileContentInput {
  repoId: string;
  branch: string;
  path: string;
  content: string | null;
  isBinary: boolean;
  encoding?: string;
}

export async function upsertFileContent(
  db: ProductDb,
  input: InsertFileContentInput,
): Promise<RepoFileContentRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO repo_file_content (id, repo_id, branch, path, content, is_binary, encoding)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (repo_id, branch, path)
     DO UPDATE SET content=$5, is_binary=$6, encoding=$7`,
    [id, input.repoId, input.branch, input.path, input.content, input.isBinary, input.encoding ?? "utf-8"],
  );
  const rows = await db.query<RepoFileContentRow>(
    `SELECT * FROM repo_file_content WHERE repo_id=$1 AND branch=$2 AND path=$3`,
    [input.repoId, input.branch, input.path],
  );
  return rows[0]!;
}

export async function getFileContent(
  db: ProductDb,
  repoId: string,
  branch: string,
  path: string,
): Promise<RepoFileContentRow | null> {
  const rows = await db.query<RepoFileContentRow>(
    `SELECT * FROM repo_file_content WHERE repo_id=$1 AND branch=$2 AND path=$3`,
    [repoId, branch, path],
  );
  return rows[0] ?? null;
}

export interface InsertBlameLineInput {
  repoId: string;
  branch: string;
  path: string;
  lineNumber: number;
  commitSha: string;
  author: string;
  authorDate: string;
  lineContent: string;
}

export async function insertBlameLine(
  db: ProductDb,
  input: InsertBlameLineInput,
): Promise<RepoFileBlameRow> {
  const id = newUlid();
  await db.query(
    `INSERT INTO repo_file_blame
       (id, repo_id, branch, path, line_number, commit_sha, author, author_date, line_content)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (repo_id, branch, path, line_number)
     DO UPDATE SET commit_sha=$6, author=$7, author_date=$8, line_content=$9`,
    [id, input.repoId, input.branch, input.path, input.lineNumber, input.commitSha, input.author, input.authorDate, input.lineContent],
  );
  const rows = await db.query<RepoFileBlameRow>(
    `SELECT * FROM repo_file_blame WHERE repo_id=$1 AND branch=$2 AND path=$3 AND line_number=$4`,
    [input.repoId, input.branch, input.path, input.lineNumber],
  );
  return rows[0]!;
}

export async function getBlameForFile(
  db: ProductDb,
  repoId: string,
  branch: string,
  path: string,
): Promise<RepoFileBlameRow[]> {
  return db.query<RepoFileBlameRow>(
    `SELECT * FROM repo_file_blame
     WHERE repo_id=$1 AND branch=$2 AND path=$3
     ORDER BY line_number ASC`,
    [repoId, branch, path],
  );
}

/** List distinct branches that have files indexed for a repo. */
export async function listIndexedBranches(
  db: ProductDb,
  repoId: string,
): Promise<string[]> {
  const rows = await db.query<{ branch: string }>(
    `SELECT DISTINCT branch FROM repo_files_index WHERE repo_id=$1 ORDER BY branch`,
    [repoId],
  );
  return rows.map((r) => r.branch);
}
