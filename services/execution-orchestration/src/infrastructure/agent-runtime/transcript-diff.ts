/**
 * Transcript JSONL capture + workspace diff capture (P4#11).
 *
 * TranscriptWriter: streams agent stdout/stderr to `<workspace>/transcripts/<runId>.jsonl`.
 * Each line: `{"ts":"<ISO>","stream":"stdout"|"stderr","text":"<line>"}`.
 * Enforces FULCRUM_MAX_TRANSCRIPT_SIZE (50MB default) with truncation sentinel.
 *
 * captureWorkspaceDiff: runs `git diff HEAD` on worktree, writes to `<workspace>/diffs/<runId>.diff`.
 */

import { mkdir, appendFile, writeFile, stat, readFile } from "node:fs/promises";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DEFAULT_MAX_TRANSCRIPT_BYTES = 50 * 1024 * 1024; // 50 MB

// ---------------------------------------------------------------------------
// TranscriptWriter
// ---------------------------------------------------------------------------
export interface TranscriptCloseResult {
  readonly transcriptPath: string;
  readonly truncated: boolean;
}

export class TranscriptWriter {
  private readonly filePath: string;
  private readonly dirPath: string;
  private bytesWritten = 0;
  private truncated = false;
  private dirCreated = false;

  constructor(
    private readonly workspaceRoot: string,
    private readonly runId: string,
    private readonly maxBytes: number = DEFAULT_MAX_TRANSCRIPT_BYTES,
  ) {
    this.dirPath = join(workspaceRoot, "transcripts");
    this.filePath = join(this.dirPath, `${runId}.jsonl`);
  }

  async write(stream: "stdout" | "stderr", text: string): Promise<void> {
    if (this.truncated) return;

    if (!this.dirCreated) {
      await mkdir(this.dirPath, { recursive: true });
      this.dirCreated = true;
    }

    const line = JSON.stringify({
      ts: new Date().toISOString(),
      stream,
      text,
    });
    const lineBytes = Buffer.byteLength(line + "\n", "utf-8");

    if (this.bytesWritten + lineBytes > this.maxBytes) {
      this.truncated = true;
      const sentinel = JSON.stringify({ truncated: true, run_id: this.runId });
      await appendFile(this.filePath, sentinel + "\n", "utf-8");
      return;
    }

    await appendFile(this.filePath, line + "\n", "utf-8");
    this.bytesWritten += lineBytes;
  }

  async close(): Promise<TranscriptCloseResult> {
    // Ensure dir + file exist even if nothing was written
    if (!this.dirCreated) {
      await mkdir(this.dirPath, { recursive: true });
    }
    // Touch file if empty
    try {
      await stat(this.filePath);
    } catch {
      await writeFile(this.filePath, "", "utf-8");
    }

    return {
      transcriptPath: this.filePath,
      truncated: this.truncated,
    };
  }
}

// ---------------------------------------------------------------------------
// maxTranscriptSize — reads env
// ---------------------------------------------------------------------------
export function maxTranscriptSize(
  env: Record<string, string | undefined>,
): number {
  const raw = env.FULCRUM_MAX_TRANSCRIPT_SIZE;
  if (!raw) return DEFAULT_MAX_TRANSCRIPT_BYTES;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_MAX_TRANSCRIPT_BYTES;
}

// ---------------------------------------------------------------------------
// captureWorkspaceDiff
// ---------------------------------------------------------------------------
export interface DiffCaptureResult {
  readonly diffPath: string;
}

// ---------------------------------------------------------------------------
// readTranscriptLines — paginated JSONL reader for tRPC getLogs
// ---------------------------------------------------------------------------
export interface TranscriptReadResult {
  readonly lines: Record<string, unknown>[];
  readonly total: number;
  readonly truncated: boolean;
}

export async function readTranscriptLines(
  filePath: string,
  offset: number,
  limit: number,
): Promise<TranscriptReadResult> {
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    return { lines: [], total: 0, truncated: false };
  }

  const rawLines = content.trim().split("\n").filter((l) => l.length > 0);
  const parsed: Record<string, unknown>[] = [];
  let truncated = false;

  for (const raw of rawLines) {
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      if (obj.truncated === true) {
        truncated = true;
      }
      parsed.push(obj);
    } catch {
      // skip malformed lines
    }
  }

  const total = parsed.length;
  const slice = parsed.slice(offset, offset + limit);
  return { lines: slice, total, truncated };
}

// ---------------------------------------------------------------------------
// captureWorkspaceDiff
// ---------------------------------------------------------------------------
export async function captureWorkspaceDiff(
  workspaceRoot: string,
  runId: string,
  gitDiffFn: () => Promise<string>,
): Promise<DiffCaptureResult> {
  const dirPath = join(workspaceRoot, "diffs");
  await mkdir(dirPath, { recursive: true });

  const diffPath = join(dirPath, `${runId}.diff`);
  const diffContent = await gitDiffFn();
  await writeFile(diffPath, diffContent, "utf-8");

  return { diffPath };
}
