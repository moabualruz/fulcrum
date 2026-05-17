/**
 * Tests for transcript JSONL capture + workspace diff capture (P4#11).
 *
 * TDD red phase: tests written before implementation.
 */

import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  TranscriptWriter,
  maxTranscriptSize,
  captureWorkspaceDiff,
  readTranscriptLines,
} from "../transcript-diff.ts";

describe("TranscriptWriter", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "fulcrum-transcript-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes JSONL with valid JSON per line", async () => {
    const runId = "run-001";
    const writer = new TranscriptWriter(tempDir, runId);
    await writer.write("stdout", "hello world");
    await writer.write("stderr", "some error");
    await writer.close();

    const filePath = join(tempDir, "transcripts", `${runId}.jsonl`);
    const content = await readFile(filePath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines.length).toBe(2);

    const line1 = JSON.parse(lines[0]!);
    expect(line1.stream).toBe("stdout");
    expect(line1.text).toBe("hello world");
    expect(line1.ts).toBeDefined();

    const line2 = JSON.parse(lines[1]!);
    expect(line2.stream).toBe("stderr");
    expect(line2.text).toBe("some error");
  });

  it("returns transcript_path after close", async () => {
    const runId = "run-002";
    const writer = new TranscriptWriter(tempDir, runId);
    await writer.write("stdout", "test");
    const result = await writer.close();

    expect(result.transcriptPath).toBe(
      join(tempDir, "transcripts", `${runId}.jsonl`),
    );
    expect(result.truncated).toBe(false);
  });

  it("enforces FULCRUM_MAX_TRANSCRIPT_SIZE with truncation sentinel", async () => {
    const runId = "run-003";
    // Use a very small cap for testing
    const smallCap = 100; // bytes
    const writer = new TranscriptWriter(tempDir, runId, smallCap);

    // Write enough to exceed cap
    await writer.write("stdout", "A".repeat(200));
    await writer.write("stdout", "should not appear");
    const result = await writer.close();

    expect(result.truncated).toBe(true);

    const content = await readFile(result.transcriptPath, "utf-8");
    const lines = content.trim().split("\n");
    const lastLine = JSON.parse(lines[lines.length - 1]!);
    expect(lastLine.truncated).toBe(true);
    expect(lastLine.run_id).toBe(runId);
  });

  it("creates transcripts directory if it does not exist", async () => {
    const runId = "run-004";
    const writer = new TranscriptWriter(tempDir, runId);
    await writer.write("stdout", "test");
    await writer.close();

    const dirs = await readdir(tempDir);
    expect(dirs).toContain("transcripts");
  });
});

describe("maxTranscriptSize", () => {
  it("returns 50MB default when env not set", () => {
    const size = maxTranscriptSize({});
    expect(size).toBe(50 * 1024 * 1024);
  });

  it("reads FULCRUM_MAX_TRANSCRIPT_SIZE from env", () => {
    const size = maxTranscriptSize({ FULCRUM_MAX_TRANSCRIPT_SIZE: "1000" });
    expect(size).toBe(1000);
  });

  it("returns default for invalid values", () => {
    const size = maxTranscriptSize({ FULCRUM_MAX_TRANSCRIPT_SIZE: "garbage" });
    expect(size).toBe(50 * 1024 * 1024);
  });
});

describe("readTranscriptLines", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "fulcrum-read-transcript-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("paginates JSONL lines", async () => {
    const runId = "run-read-01";
    const writer = new TranscriptWriter(tempDir, runId);
    await writer.write("stdout", "line1");
    await writer.write("stdout", "line2");
    await writer.write("stderr", "line3");
    await writer.close();

    const filePath = join(tempDir, "transcripts", `${runId}.jsonl`);
    const result = await readTranscriptLines(filePath, 0, 2);
    expect(result.total).toBe(3);
    expect(result.lines.length).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it("detects truncated flag", async () => {
    const runId = "run-read-02";
    const writer = new TranscriptWriter(tempDir, runId, 50);
    await writer.write("stdout", "A".repeat(200));
    await writer.close();

    const filePath = join(tempDir, "transcripts", `${runId}.jsonl`);
    const result = await readTranscriptLines(filePath, 0, 100);
    expect(result.truncated).toBe(true);
  });

  it("returns empty for missing file", async () => {
    const result = await readTranscriptLines("/nonexistent/file.jsonl", 0, 10);
    expect(result.lines).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe("captureWorkspaceDiff", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "fulcrum-diff-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes diff file from git output", async () => {
    const runId = "run-005";
    const diffContent = "diff --git a/foo.ts b/foo.ts\n+hello\n";
    const result = await captureWorkspaceDiff(tempDir, runId, async () => diffContent);

    const expectedPath = join(tempDir, "diffs", `${runId}.diff`);
    expect(result.diffPath).toBe(expectedPath);

    const content = await readFile(expectedPath, "utf-8");
    expect(content).toBe(diffContent);
  });

  it("writes empty file on no-change run (not an error)", async () => {
    const runId = "run-006";
    const result = await captureWorkspaceDiff(tempDir, runId, async () => "");

    const content = await readFile(result.diffPath, "utf-8");
    expect(content).toBe("");
  });

  it("creates diffs directory if it does not exist", async () => {
    const runId = "run-007";
    await captureWorkspaceDiff(tempDir, runId, async () => "");

    const dirs = await readdir(tempDir);
    expect(dirs).toContain("diffs");
  });
});
